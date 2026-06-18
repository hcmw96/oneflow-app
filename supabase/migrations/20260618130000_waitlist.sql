-- Waitlist for full classes with auto-promotion on cancellation.
--
-- Flow:
--   1. Member joins waitlist with a payment intent (credit / flow_points / free).
--   2. When a confirmed booking is cancelled, bookingCancellation.ts calls
--      promote_next_waitlist_entry(class_id) which picks the oldest valid
--      waiter, inserts a confirmed booking on their behalf, and marks them
--      promoted. Existing triggers (sync_class_booked_count,
--      deduct_credit_on_booking_insert) handle capacity + credit math.

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'promoted', 'cancelled')),
  joined_at timestamptz not null default now(),
  -- Payment intent at join time (nullable for legacy rows; new rows always set it).
  payment_method text check (payment_method in ('free', 'credit', 'flow_points')),
  credit_id uuid references public.user_credits(id) on delete set null,
  flow_points_pledged integer,
  -- Lifecycle.
  promoted_at timestamptz,
  promoted_booking_id uuid references public.bookings(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text,
  unique (class_id, profile_id)
);

create index if not exists waitlist_entries_class_status_joined_idx
  on public.waitlist_entries (class_id, status, joined_at);

create index if not exists waitlist_entries_profile_status_idx
  on public.waitlist_entries (profile_id, status);

alter table public.waitlist_entries enable row level security;

-- Members see and manage their own; director/management/front_desk see all.
drop policy if exists waitlist_select_own_or_staff on public.waitlist_entries;
create policy waitlist_select_own_or_staff on public.waitlist_entries
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management', 'front_desk')
    )
  );

drop policy if exists waitlist_insert_own on public.waitlist_entries;
create policy waitlist_insert_own on public.waitlist_entries
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists waitlist_update_own_or_staff on public.waitlist_entries;
create policy waitlist_update_own_or_staff on public.waitlist_entries
  for update to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management', 'front_desk')
    )
  )
  with check (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management', 'front_desk')
    )
  );

-- ============================================================================
-- promote_next_waitlist_entry
-- ============================================================================
-- Returns one row (promoted_booking_id, promoted_profile_id, payment_method)
-- on success, no rows if no eligible waiter or class isn't promotable.
-- SECURITY DEFINER so it can insert a booking on someone else's behalf and
-- update their flow_points balance.

create or replace function public.promote_next_waitlist_entry(p_class_id uuid)
returns table (
  promoted_booking_id uuid,
  promoted_profile_id uuid,
  payment_method text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class record;
  v_entry record;
  v_active_count integer;
  v_new_booking_id uuid;
  v_already_booked boolean;
  v_credit_ok boolean;
  v_points_ok boolean;
begin
  -- Class must exist, be in future, and not cancelled.
  select id, capacity, starts_at, is_cancelled
    into v_class
    from public.classes
    where id = p_class_id;

  if not found then return; end if;
  if coalesce(v_class.is_cancelled, false) then return; end if;
  if v_class.starts_at <= now() then return; end if;

  -- Check live capacity from bookings (not cached booked_count) so this is
  -- robust to trigger ordering and any cache drift.
  select count(*)::int
    into v_active_count
    from public.bookings
    where class_id = p_class_id
      and coalesce(status::text, '') <> 'cancelled';

  if v_active_count >= coalesce(v_class.capacity, 0) then
    return;
  end if;

  -- Iterate oldest -> newest waiting entries.
  for v_entry in
    select *
      from public.waitlist_entries we
      where we.class_id = p_class_id
        and we.status = 'waiting'
      order by we.joined_at asc
  loop
    -- Already booked for this class? Mark them promoted-equivalent and skip.
    select exists (
      select 1 from public.bookings b
      where b.class_id = p_class_id
        and b.profile_id = v_entry.profile_id
        and coalesce(b.status::text, '') <> 'cancelled'
    ) into v_already_booked;

    if v_already_booked then
      update public.waitlist_entries
        set status = 'cancelled',
            cancelled_at = now(),
            cancellation_reason = 'already_booked'
        where id = v_entry.id;
      continue;
    end if;

    -- Validate payment intent.
    if v_entry.payment_method = 'credit' then
      select exists (
        select 1 from public.user_credits uc
        where uc.id = v_entry.credit_id
          and uc.profile_id = v_entry.profile_id
          and (uc.expires_at is null or uc.expires_at > now())
          and (uc.is_unlimited = true or coalesce(uc.credits_remaining, 0) > 0)
      ) into v_credit_ok;

      if not v_credit_ok then
        update public.waitlist_entries
          set status = 'cancelled',
              cancelled_at = now(),
              cancellation_reason = 'credit_invalid'
          where id = v_entry.id;
        continue;
      end if;

    elsif v_entry.payment_method = 'flow_points' then
      select exists (
        select 1 from public.profiles p
        where p.id = v_entry.profile_id
          and coalesce(p.flow_points, 0)
              >= coalesce(v_entry.flow_points_pledged, 100)
      ) into v_points_ok;

      if not v_points_ok then
        update public.waitlist_entries
          set status = 'cancelled',
              cancelled_at = now(),
              cancellation_reason = 'points_insufficient'
          where id = v_entry.id;
        continue;
      end if;
    end if;
    -- payment_method 'free' / null = no validation.

    -- Insert the promotion booking. sync_class_booked_count handles
    -- booked_count; deduct_credit_on_booking_insert handles credit math.
    insert into public.bookings (
      profile_id,
      class_id,
      status,
      payment_method,
      credit_id,
      flow_points_used,
      mat_addon,
      towel_addon,
      qr_token
    )
    values (
      v_entry.profile_id,
      p_class_id,
      'confirmed',
      coalesce(v_entry.payment_method, 'free'),
      v_entry.credit_id,
      coalesce(v_entry.flow_points_pledged, 0),
      false,
      false,
      gen_random_uuid()
    )
    returning id into v_new_booking_id;

    -- Deduct flow points (credit deduction is handled by existing trigger).
    if v_entry.payment_method = 'flow_points'
       and coalesce(v_entry.flow_points_pledged, 0) > 0 then
      update public.profiles
        set flow_points = greatest(
              0,
              coalesce(flow_points, 0) - coalesce(v_entry.flow_points_pledged, 0)
            )
        where id = v_entry.profile_id;
    end if;

    -- Mark entry promoted.
    update public.waitlist_entries
      set status = 'promoted',
          promoted_at = now(),
          promoted_booking_id = v_new_booking_id
      where id = v_entry.id;

    return query
      select v_new_booking_id, v_entry.profile_id, coalesce(v_entry.payment_method, 'free');
    return;
  end loop;

  return;
end;
$$;

grant execute on function public.promote_next_waitlist_entry(uuid) to authenticated;
