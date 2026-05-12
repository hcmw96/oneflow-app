-- Restrict profile updates to the row owner or director/management.
-- Replaces permissive profiles_update from 20260511125000.

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists profiles_update on public.profiles;

create policy "Users can update own profile" on public.profiles
  for update using (
    auth.uid() = id
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );
