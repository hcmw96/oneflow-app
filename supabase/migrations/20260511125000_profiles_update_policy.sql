drop policy if exists profiles_update on public.profiles;

create policy profiles_update
  on public.profiles
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
