-- One-time backfill: link historical weekly-looking classes into recurring series.
-- Sets recurring_group_id ONLY (no other columns touched).
--
-- Grouping (SAST / Africa/Johannesburg) — matches preview query:
--   lower(trim(name)) + ISO day-of-week (1=Mon … 7=Sun) + start time HH24:MI
--   WHERE recurring_group_id IS NULL AND is_cancelled = false AND count >= 2 per group
--
-- Reversal:
--   UPDATE public.classes
--   SET recurring_group_id = NULL
--   WHERE recurring_group_id IN (
--     SELECT recurring_group_id FROM public.recurring_group_backfill_audit
--   );
--
-- List assigned UUIDs:
--   SELECT recurring_group_id, display_name, day_label, time_sast, class_count
--   FROM public.recurring_group_backfill_audit
--   ORDER BY display_name, iso_dow, time_sast;

create table if not exists public.recurring_group_backfill_audit (
  recurring_group_id uuid primary key,
  name_key text not null,
  display_name text not null,
  iso_dow smallint not null,
  day_label text not null,
  time_sast text not null,
  class_count integer not null,
  applied_at timestamptz not null default now()
);

comment on table public.recurring_group_backfill_audit is
  'One-time 2026-07-03 recurring_group_id backfill audit. Safe to drop after studio confirms.';

truncate public.recurring_group_backfill_audit;

with group_keys as (
  select
    lower(trim(name)) as name_key,
    min(trim(name)) as display_name,
    extract(isodow from starts_at at time zone 'Africa/Johannesburg')::smallint as iso_dow,
    case extract(isodow from starts_at at time zone 'Africa/Johannesburg')::int
      when 1 then 'Monday'
      when 2 then 'Tuesday'
      when 3 then 'Wednesday'
      when 4 then 'Thursday'
      when 5 then 'Friday'
      when 6 then 'Saturday'
      when 7 then 'Sunday'
    end as day_label,
    to_char(starts_at at time zone 'Africa/Johannesburg', 'HH24:MI') as time_sast,
    count(*)::integer as class_count
  from public.classes
  where recurring_group_id is null
    and is_cancelled = false
  group by
    lower(trim(name)),
    extract(isodow from starts_at at time zone 'Africa/Johannesburg'),
    to_char(starts_at at time zone 'Africa/Johannesburg', 'HH24:MI')
  having count(*) >= 2
),
mapping as (
  select
    g.*,
    gen_random_uuid() as new_group_id
  from group_keys g
)
insert into public.recurring_group_backfill_audit (
  recurring_group_id,
  name_key,
  display_name,
  iso_dow,
  day_label,
  time_sast,
  class_count
)
select
  m.new_group_id,
  m.name_key,
  m.display_name,
  m.iso_dow,
  m.day_label,
  m.time_sast,
  m.class_count
from mapping m;

update public.classes c
set recurring_group_id = a.recurring_group_id
from public.recurring_group_backfill_audit a
where c.recurring_group_id is null
  and c.is_cancelled = false
  and lower(trim(c.name)) = a.name_key
  and extract(isodow from c.starts_at at time zone 'Africa/Johannesburg')::smallint = a.iso_dow
  and to_char(c.starts_at at time zone 'Africa/Johannesburg', 'HH24:MI') = a.time_sast;

do $$
declare
  v_groups integer;
  v_updated integer;
begin
  select count(*)::integer into v_groups from public.recurring_group_backfill_audit;

  select count(*)::integer
  into v_updated
  from public.classes
  where recurring_group_id in (
    select recurring_group_id from public.recurring_group_backfill_audit
  );

  if v_groups <> 100 then
    raise exception 'recurring backfill: expected 100 groups, got %', v_groups;
  end if;

  if v_updated <> 5424 then
    raise exception 'recurring backfill: expected 5424 class rows updated, got %', v_updated;
  end if;
end;
$$;
