-- May challenge: one stamp row per member per calendar day (May check-ins)
create table if not exists public.challenge_checkins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  class_date date not null,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, class_date)
);

create index if not exists challenge_checkins_profile_date_idx
  on public.challenge_checkins (profile_id, class_date);

alter table public.challenge_checkins enable row level security;

-- Members see their own stamps; directors/management see all (admin check-in upsert)
create policy "challenge_checkins_select_own"
  on public.challenge_checkins for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "challenge_checkins_staff_select"
  on public.challenge_checkins for select to authenticated
  using (
    exists (
      select 1
      from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );

create policy "challenge_checkins_staff_insert"
  on public.challenge_checkins for insert to authenticated
  with check (
    exists (
      select 1
      from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );

create policy "challenge_checkins_staff_update"
  on public.challenge_checkins for update to authenticated
  using (
    exists (
      select 1
      from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );

create policy "challenge_checkins_staff_delete"
  on public.challenge_checkins for delete to authenticated
  using (
    exists (
      select 1
      from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );
