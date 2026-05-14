-- Let front desk + management read member credits for check-in roster (e.g. Sage café pill).
alter table if exists public.user_credits enable row level security;

drop policy if exists user_credits_select_staff_roster on public.user_credits;
create policy user_credits_select_staff_roster on public.user_credits
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in ('director', 'management', 'front_desk')
    )
  );
