-- Allow any authenticated user to read profiles (names for joins, class guide dropdowns).
-- Same intent as profiles_searchable; named per app convention. Idempotent.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_read_all'
  ) then
    create policy profiles_read_all
      on public.profiles
      for select
      using (auth.uid() is not null);
  end if;
end
$$;
