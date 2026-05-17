-- Award Flow Points to the teaching guide when bookings are marked attended.
-- Tiered by class attendance (milestones on 1st, 6th, 16th attended booking):
--   1–5 attendees  → 20 total (+20 at 1st)
--   6–15 attendees → 30 total (+10 at 6th)
--   16+ attendees  → 50 total (+20 at 16th)

create or replace function public.award_guide_flow_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attendee_count integer;
  guide_profile_id uuid;
  points_to_award integer;
  class_guide_id uuid;
begin
  if new.status is distinct from 'attended' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from 'attended' then
    return new;
  end if;

  select count(*)::integer
    into attendee_count
  from public.bookings
  where class_id = new.class_id
    and status = 'attended';

  select c.guide_id
    into class_guide_id
  from public.classes c
  where c.id = new.class_id;

  if class_guide_id is null then
    return new;
  end if;

  -- classes.guide_id may store guides.id or profiles.id (legacy).
  select g.profile_id
    into guide_profile_id
  from public.guides g
  where g.id = class_guide_id
  limit 1;

  if guide_profile_id is null
     and exists (
       select 1 from public.guides g2 where g2.profile_id = class_guide_id
     ) then
    guide_profile_id := class_guide_id;
  end if;

  if attendee_count = 1 then
    points_to_award := 20;
  elsif attendee_count = 6 then
    points_to_award := 10;
  elsif attendee_count = 16 then
    points_to_award := 20;
  else
    points_to_award := 0;
  end if;

  if points_to_award > 0 and guide_profile_id is not null then
    update public.profiles
    set flow_points = coalesce(flow_points, 0) + points_to_award
    where id = guide_profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_award_guide_flow_points on public.bookings;

create trigger trigger_award_guide_flow_points
  after insert or update on public.bookings
  for each row
  execute function public.award_guide_flow_points();
