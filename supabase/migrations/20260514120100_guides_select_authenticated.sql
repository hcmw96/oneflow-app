-- If guides already has RLS enabled (e.g. from dashboard), allow authenticated SELECT
-- so admin class forms can load the guide list. Does not enable RLS on guides.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'guides'
      and c.relkind = 'r'
      and c.relrowsecurity = true
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'guides'
        and policyname = 'guides_select_authenticated'
    ) then
      create policy guides_select_authenticated
        on public.guides
        for select
        using (auth.uid() is not null);
    end if;
  end if;
end
$$;
