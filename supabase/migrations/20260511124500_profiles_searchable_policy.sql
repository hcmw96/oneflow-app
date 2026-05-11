do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_searchable'
  ) then
    create policy profiles_searchable
      on public.profiles
      for select
      using (auth.uid() is not null);
  end if;
end
$$;
