-- Marketing staff need read access to legacy_members for email campaigns.
drop policy if exists legacy_members_select_staff on public.legacy_members;

create policy legacy_members_select_staff
  on public.legacy_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          lower(coalesce(p.role::text, '')) in ('director', 'management', 'marketing')
          or exists (
            select 1
            from unnest(coalesce(p.secondary_roles, array[]::text[])) sr(role)
            where lower(trim(sr.role)) = 'marketing'
          )
        )
    )
  );
