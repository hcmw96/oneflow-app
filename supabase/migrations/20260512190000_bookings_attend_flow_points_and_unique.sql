-- Award Flow Points when a booking becomes attended (safety net + walk-in INSERT).
-- Reads studio_settings.flow_points_per_class (default 10).

create or replace function public.award_flow_points_on_attend()
returns trigger
language plpgsql
as $$
declare
  pts integer;
begin
  select coalesce(nullif(trim(value), '')::integer, 10)
    into pts
  from public.studio_settings
  where key = 'flow_points_per_class'
  limit 1;

  if pts is null or pts < 1 then
    pts := 10;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'attended' and new.profile_id is not null then
      update public.profiles
      set flow_points = coalesce(flow_points, 0) + pts
      where id = new.profile_id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'attended'
       and old.status is distinct from 'attended'
       and new.profile_id is not null then
      update public.profiles
      set flow_points = coalesce(flow_points, 0) + pts
      where id = new.profile_id;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_award_flow_points on public.bookings;

create trigger trigger_award_flow_points
  after insert or update on public.bookings
  for each row
  execute function public.award_flow_points_on_attend();

-- One non-cancelled booking per member per class (dedupe before unique index).
with ranked as (
  select
    id,
    row_number() over (
      partition by profile_id, class_id
      order by id asc
    ) as rn
  from public.bookings
  where status is distinct from 'cancelled'
)
delete from public.bookings b
using ranked r
where b.id = r.id
  and r.rn > 1;

create unique index if not exists bookings_unique_active
  on public.bookings (profile_id, class_id)
  where status not in ('cancelled');
