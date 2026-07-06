-- Wellzone/Sauna: 30-minute late check-in window; other classes: until start only.

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
  class_type text;
  open_mins integer;
  late_mins integer;
  now_ts timestamptz := now();
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

  select c.starts_at, lower(coalesce(c.class_type::text, ''))
  into class_starts, class_type
  from public.classes c
  where c.id = b.class_id;

  select coalesce(nullif(trim(value), '')::integer, 30)
  into open_mins
  from public.studio_settings
  where key = 'checkin_open_minutes_before';

  if open_mins is null then
    open_mins := 30;
  end if;

  if class_type in ('wellzone', 'sauna_journey') or class_type like '%sauna%' then
    late_mins := 30;
  else
    late_mins := 0;
  end if;

  if now_ts < class_starts - (open_mins || ' minutes')::interval then
    return jsonb_build_object(
      'ok', false,
      'code', 'early',
      'message', 'Check-in opens ' || open_mins || ' minutes before class.'
    );
  end if;

  if now_ts > class_starts + (late_mins || ' minutes')::interval then
    return jsonb_build_object(
      'ok', false,
      'code', 'late',
      'message', case
        when late_mins > 0 then
          'Check-in closed — the 30-minute window after class start has passed.'
        else
          'Check-in is only available until class start time.'
      end
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
