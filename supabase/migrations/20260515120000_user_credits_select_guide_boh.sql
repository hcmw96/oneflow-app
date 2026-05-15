-- Guides and BOH need the same read access as front desk for embedded
-- user_credits on admin lists (e.g. Customers plan column, roster pills).
drop policy if exists user_credits_select_staff_roster on public.user_credits;

create policy user_credits_select_staff_roster on public.user_credits
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in (
          'director',
          'management',
          'front_desk',
          'guide',
          'boh'
        )
    )
  );
