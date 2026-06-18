-- Make challenge_checkins.upsert(onConflict: "booking_id") work.
-- Each booking records at most one challenge stamp; an earlier migration
-- (20260506113000) dropped the (profile_id, class_date) unique constraint
-- to allow up to 2 stamps per day, and no replacement was added.

-- Deduplicate any existing rows that share a booking_id, keeping the
-- earliest. (Defensive: in practice this should be a no-op.)
delete from public.challenge_checkins c
using public.challenge_checkins keep
where c.booking_id = keep.booking_id
  and (
    c.created_at > keep.created_at
    or (c.created_at = keep.created_at and c.id > keep.id)
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenge_checkins_booking_id_key'
      and conrelid = 'public.challenge_checkins'::regclass
  ) then
    alter table public.challenge_checkins
      add constraint challenge_checkins_booking_id_key
      unique (booking_id);
  end if;
end$$;
