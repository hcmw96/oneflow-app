-- Studio-cancelled classes: mark the class cancelled and return credits in one
-- transaction. Idempotent — already-cancelled bookings/classes are skipped so a retry
-- cannot refund twice. Does not promote the waitlist (the class is gone) and does not
-- levy a late-cancel fee (the studio cancelled, not the member).
--
-- Emails stay in the client (`send-email`) after this returns, matching today's
-- single-class path. A failed email must not roll back a completed refund.

create or replace function public.cancel_classes_and_refund(p_class_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_booking record;
  v_updated uuid;
  v_classes_cancelled int := 0;
  v_bookings_cancelled int := 0;
  v_credits_returned int := 0;
  v_notifications jsonb := '[]'::jsonb;
  v_email text;
  v_class_name text;
  v_starts_at timestamptz;
  v_location text;
  v_guide_name text;
begin
  if auth.uid() is null or not public.is_admin_role() then
    raise exception 'forbidden';
  end if;

  if p_class_ids is null or cardinality(p_class_ids) = 0 then
    return jsonb_build_object(
      'classes_cancelled', 0,
      'bookings_cancelled', 0,
      'credits_returned', 0,
      'notifications', '[]'::jsonb
    );
  end if;

  foreach v_class_id in array p_class_ids loop
    update public.classes
    set is_cancelled = true
    where id = v_class_id
      and coalesce(is_cancelled, false) = false;
    if found then
      v_classes_cancelled := v_classes_cancelled + 1;
    end if;

    update public.waitlist_entries
    set status = 'cancelled'
    where class_id = v_class_id
      and status = 'waiting';

    for v_booking in
      select
        b.id,
        b.profile_id,
        b.credit_id,
        b.payment_method,
        b.flow_points_used,
        b.mat_addon,
        b.towel_addon
      from public.bookings b
      where b.class_id = v_class_id
        and b.status in ('confirmed', 'attended')
    loop
      update public.bookings
      set
        status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = 'admin_cancelled',
        late_cancel = false
      where id = v_booking.id
        and status in ('confirmed', 'attended')
      returning id into v_updated;

      if v_updated is null then
        continue;
      end if;

      v_bookings_cancelled := v_bookings_cancelled + 1;

      if v_booking.credit_id is not null then
        update public.user_credits
        set credits_remaining = credits_remaining + 1
        where id = v_booking.credit_id
          and coalesce(is_unlimited, false) = false;
        if found then
          v_credits_returned := v_credits_returned + 1;
        end if;
      end if;

      if v_booking.payment_method = 'flow_points'
         and coalesce(v_booking.flow_points_used, 0) > 0 then
        update public.profiles
        set flow_points = coalesce(flow_points, 0) + v_booking.flow_points_used
        where id = v_booking.profile_id;
      end if;

      select
        nullif(trim(p.email), ''),
        coalesce(nullif(trim(c.name), ''), 'Class'),
        c.starts_at,
        c.location,
        c.guide_name
      into v_email, v_class_name, v_starts_at, v_location, v_guide_name
      from public.bookings b
      join public.classes c on c.id = b.class_id
      join public.profiles p on p.id = b.profile_id
      where b.id = v_booking.id;

      if v_email is not null then
        v_notifications := v_notifications || jsonb_build_array(
          jsonb_build_object(
            'to', v_email,
            'class_name', v_class_name,
            'starts_at', v_starts_at,
            'location', coalesce(v_location, 'One Flow'),
            'guide_name', coalesce(v_guide_name, 'Guide'),
            'mat_addon', coalesce(v_booking.mat_addon, false),
            'towel_addon', coalesce(v_booking.towel_addon, false)
          )
        );
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'classes_cancelled', v_classes_cancelled,
    'bookings_cancelled', v_bookings_cancelled,
    'credits_returned', v_credits_returned,
    'notifications', v_notifications
  );
end;
$$;

revoke all on function public.cancel_classes_and_refund(uuid[]) from public;
grant execute on function public.cancel_classes_and_refund(uuid[]) to authenticated;
