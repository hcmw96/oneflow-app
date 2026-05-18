-- Guides and directors do not earn Flow Points on check-in.

create or replace function public.profile_earns_flow_points(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and lower(coalesce(p.role::text, '')) not in ('guide', 'director')
  );
$$;

create or replace function public.award_flow_points_on_attend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null
     and new.status = 'attended'
     and (tg_op = 'insert' or old.status is distinct from 'attended')
     and public.profile_earns_flow_points(new.profile_id) then
    update public.profiles
    set flow_points = coalesce(flow_points, 0) + 10
    where id = new.profile_id;
  end if;

  if tg_op = 'update'
     and old.profile_id is not null
     and old.status = 'attended'
     and new.status is distinct from 'attended'
     and public.profile_earns_flow_points(old.profile_id) then
    update public.profiles
    set flow_points = greatest(0, coalesce(flow_points, 0) - 10)
    where id = old.profile_id;
  end if;

  return new;
end;
$$;

-- Include member role in QR check-in response (for staff UI toasts).
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
  member_role text;
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

  select trim(coalesce(p.first_name, 'Member')), lower(coalesce(p.role::text, ''))
  into member_name, member_role
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
    'member_role', member_role,
    'class_starts_at', class_starts
  );
end;
$$;
