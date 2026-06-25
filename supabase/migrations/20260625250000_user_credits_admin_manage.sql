-- Let director / management assign, edit, and remove member credits from admin.
-- Without these policies, client deletes succeed with 0 rows and packages reappear on reload.

drop policy if exists user_credits_insert_admin on public.user_credits;
create policy user_credits_insert_admin on public.user_credits
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in ('director', 'management')
    )
  );

drop policy if exists user_credits_update_admin on public.user_credits;
create policy user_credits_update_admin on public.user_credits
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in ('director', 'management')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in ('director', 'management')
    )
  );

drop policy if exists user_credits_delete_admin on public.user_credits;
create policy user_credits_delete_admin on public.user_credits
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in ('director', 'management')
    )
  );
