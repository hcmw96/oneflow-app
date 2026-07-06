-- Keep guides table in sync when profile.role changes; backfill Keshia (Keshia) Brake.

create or replace function public.sync_guides_row_on_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.role::text, '')) = 'guide' then
    insert into public.guides (profile_id, is_active, disciplines)
    values (new.id, true, '{}'::text[])
    on conflict (profile_id) do update
      set is_active = true;
  elsif tg_op = 'UPDATE'
        and lower(coalesce(old.role::text, '')) = 'guide'
        and lower(coalesce(new.role::text, '')) <> 'guide' then
    update public.guides
    set is_active = false
    where profile_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_guides_row_on_profile_role on public.profiles;

create trigger trg_sync_guides_row_on_profile_role
  after insert or update of role on public.profiles
  for each row
  execute function public.sync_guides_row_on_profile_role();

-- Keshia Brake: profile role guide but no guides row (assigned via customer profile).
insert into public.guides (profile_id, is_active, disciplines)
select p.id, true, '{}'::text[]
from public.profiles p
where p.id = '6ce2f249-5367-4966-a997-756e5e56ee61'
  and lower(coalesce(p.role::text, '')) = 'guide'
  and not exists (
    select 1 from public.guides g where g.profile_id = p.id
  )
on conflict (profile_id) do update
  set is_active = true;
