-- Align check-in open window: studio_settings row + RPC fallback → 120 minutes.
-- Live row was already '120' (updated 2026-08-07); this records it and fixes the
-- check_in_booking_by_qr fallback which still used 30 when the setting is missing.

UPDATE public.studio_settings
SET
  value = '120',
  updated_at = now()
WHERE key = 'checkin_open_minutes_before'
  AND value IS DISTINCT FROM '120';

INSERT INTO public.studio_settings (key, value)
VALUES ('checkin_open_minutes_before', '120')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_in_booking_by_qr(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tok uuid;
  b public.bookings%rowtype;
  member_name text;
  member_role text;
  class_starts timestamptz;
  class_type text;
  open_mins integer;
  late_mins integer;
  now_ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'auth',
      'message', 'Sign in to use check-in.'
    );
  END IF;

  IF NOT public.is_check_in_staff() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'You do not have permission to check in members.'
    );
  END IF;

  BEGIN
    tok := lower(trim(p_token))::uuid;
  EXCEPTION
    WHEN others THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'invalid',
        'message', 'Could not read this QR code. Use the code from My Bookings in the app.'
      );
  END;

  SELECT *
  INTO b
  FROM public.bookings
  WHERE qr_token = tok
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'missing',
      'message', 'No booking found for this code. Use the QR from My Bookings in the app.'
    );
  END IF;

  IF b.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'cancelled',
      'message', 'This booking was cancelled.'
    );
  END IF;

  IF b.qr_used IS TRUE OR b.checked_in IS TRUE OR b.status = 'attended' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already',
      'message', 'Already checked in'
    );
  END IF;

  IF b.status IS DISTINCT FROM 'confirmed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'status',
      'message', 'Booking is ' || replace(coalesce(b.status, 'unknown'), '_', ' ') || ' — cannot check in.'
    );
  END IF;

  SELECT c.starts_at, lower(coalesce(c.class_type::text, ''))
  INTO class_starts, class_type
  FROM public.classes c
  WHERE c.id = b.class_id;

  SELECT coalesce(nullif(trim(value), '')::integer, 120)
  INTO open_mins
  FROM public.studio_settings
  WHERE key = 'checkin_open_minutes_before';

  IF open_mins IS NULL THEN
    open_mins := 120;
  END IF;

  IF class_type IN ('wellzone', 'sauna_journey') OR class_type LIKE '%sauna%' THEN
    late_mins := 30;
  ELSE
    late_mins := 0;
  END IF;

  IF now_ts < class_starts - (open_mins || ' minutes')::interval THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'early',
      'message', 'Check-in opens ' || open_mins || ' minutes before class.'
    );
  END IF;

  IF now_ts > class_starts + (late_mins || ' minutes')::interval THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'late',
      'message', CASE
        WHEN late_mins > 0 THEN
          'Check-in closed — the 30-minute window after class start has passed.'
        ELSE
          'Check-in is only available until class start time.'
      END
    );
  END IF;

  UPDATE public.bookings
  SET
    status = 'attended',
    checked_in = true,
    checked_in_at = now(),
    qr_used = true
  WHERE id = b.id;

  SELECT trim(coalesce(p.first_name, 'Member')), lower(coalesce(p.role::text, ''))
  INTO member_name, member_role
  FROM public.profiles p
  WHERE p.id = b.profile_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', b.id,
    'profile_id', b.profile_id,
    'member_name', member_name,
    'member_role', member_role,
    'class_starts_at', class_starts
  );
END;
$$;
