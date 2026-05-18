-- Reliable kiosk QR check-in: SECURITY DEFINER lookup/update bypasses bookings RLS gaps.

create or replace function public.is_check_in_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in (
        'director',
        'management',
        'front_desk',
        'guide',
        'boh'
      )
  );
$$;

create or replace function public.check_in_booking_by_qr(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tok uuid;
  b public.bookings%rowtype;
  member_name text;
  class_starts timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'auth',
      'message', 'Sign in to use check-in.'
    );
  end if;

  if not public.is_check_in_staff() then
    return jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'You do not have permission to check in members.'
    );
  end if;

  begin
    tok := lower(trim(p_token))::uuid;
  exception
    when others then
      return jsonb_build_object(
        'ok', false,
        'code', 'invalid',
        'message', 'Could not read this QR code. Use the code from My Bookings in the app.'
      );
  end;

  select *
  into b
  from public.bookings
  where qr_token = tok
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'missing',
      'message', 'No booking found for this code. Use the QR from My Bookings in the app.'
    );
  end if;

  if b.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'code', 'cancelled',
      'message', 'This booking was cancelled.'
    );
  end if;

  if b.qr_used is true or b.checked_in is true or b.status = 'attended' then
    return jsonb_build_object(
      'ok', false,
      'code', 'already',
      'message', 'Already checked in'
    );
  end if;

  if b.status is distinct from 'confirmed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'status',
      'message', 'Booking is ' || replace(coalesce(b.status, 'unknown'), '_', ' ') || ' — cannot check in.'
    );
  end if;

  update public.bookings
  set
    status = 'attended',
    checked_in = true,
    checked_in_at = now(),
    qr_used = true
  where id = b.id;

  select trim(coalesce(p.first_name, 'Member'))
  into member_name
  from public.profiles p
  where p.id = b.profile_id;

  select c.starts_at
  into class_starts
  from public.classes c
  where c.id = b.class_id;

  return jsonb_build_object(
    'ok', true,
    'booking_id', b.id,
    'profile_id', b.profile_id,
    'member_name', member_name,
    'class_starts_at', class_starts
  );
end;
$$;

revoke all on function public.is_check_in_staff() from public;
grant execute on function public.is_check_in_staff() to authenticated;

revoke all on function public.check_in_booking_by_qr(text) from public;
grant execute on function public.check_in_booking_by_qr(text) to authenticated;

create unique index if not exists bookings_qr_token_unique
  on public.bookings (qr_token)
  where qr_token is not null;

-- If bookings already has RLS enabled, ensure staff can still read/update for desk flows.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'bookings'
      and c.relrowsecurity
  ) then
    drop policy if exists bookings_staff_select_check_in on public.bookings;
    create policy bookings_staff_select_check_in on public.bookings
      for select to authenticated
      using (public.is_check_in_staff());

    drop policy if exists bookings_staff_update_check_in on public.bookings;
    create policy bookings_staff_update_check_in on public.bookings
      for update to authenticated
      using (public.is_check_in_staff())
      with check (public.is_check_in_staff());
  end if;
end
$$;
