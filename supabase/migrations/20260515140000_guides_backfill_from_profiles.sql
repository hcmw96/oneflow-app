-- Ensure every profile with role guide has a guides row (admin list reads guides table).
insert into public.guides (profile_id, is_active, disciplines)
select p.id, true, '[]'::jsonb
from public.profiles p
where lower(coalesce(p.role, '')) = 'guide'
  and not exists (
    select 1 from public.guides g where g.profile_id = p.id
  )
on conflict (profile_id) do nothing;
