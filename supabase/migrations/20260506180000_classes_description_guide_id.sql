-- Class descriptions + optional link to guide profile for denormalized guide_name.

alter table public.classes
  add column if not exists description text;

alter table public.classes
  add column if not exists guide_id uuid references public.profiles (id) on delete set null;

comment on column public.classes.description is 'Shown on schedule and booking UI.';
comment on column public.classes.guide_id is 'Teaching guide profile; keep guide_name in sync when this changes.';

-- Sync guide_name from linked profile.
update public.classes c
set guide_name = trim(
  both ' '
  from
    coalesce(nullif(trim(p.first_name), ''), '') || case
      when nullif(trim(p.first_name), '') is not null and nullif(trim(p.last_name), '') is not null then ' '
      else ''
    end || coalesce(nullif(trim(p.last_name), ''), '')
)
from public.profiles p
where c.guide_id = p.id;

-- Best-effort: set guide_id where guide_name matches exactly one guide profile.
update public.classes c
set guide_id = sub.pid
from (
  select
    cl.id as cid,
    min(p.id) as pid
  from public.classes cl
  join public.profiles p
    on lower(p.role) = 'guide'
   and trim(regexp_replace(lower(coalesce(cl.guide_name, '')), '\s+', ' ', 'g')) =
       trim(
         regexp_replace(
           lower(
             trim(coalesce(p.first_name, '')) || ' ' || trim(coalesce(p.last_name, ''))
           ),
           '\s+',
           ' ',
           'g'
         )
       )
  where cl.guide_id is null
    and nullif(trim(cl.guide_name), '') is not null
  group by cl.id
  having count(distinct p.id) = 1
) sub
where c.id = sub.cid;

-- Re-sync names after guide_id backfill.
update public.classes c
set guide_name = trim(
  both ' '
  from
    coalesce(nullif(trim(p.first_name), ''), '') || case
      when nullif(trim(p.first_name), '') is not null and nullif(trim(p.last_name), '') is not null then ' '
      else ''
    end || coalesce(nullif(trim(p.last_name), ''), '')
)
from public.profiles p
where c.guide_id = p.id;
