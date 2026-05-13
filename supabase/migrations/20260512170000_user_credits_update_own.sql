-- Allow members to decrement their own credits when booking (client updates after insert).
drop policy if exists user_credits_update_own on public.user_credits;
create policy user_credits_update_own on public.user_credits
  for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
