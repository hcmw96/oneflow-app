create table if not exists public.class_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now(),
  constraint class_reviews_booking_id_key unique (booking_id)
);

create index if not exists class_reviews_class_id_idx on public.class_reviews (class_id);
create index if not exists class_reviews_profile_id_idx on public.class_reviews (profile_id);

alter table public.class_reviews enable row level security;

drop policy if exists class_reviews_select_own on public.class_reviews;
create policy class_reviews_select_own
  on public.class_reviews
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists class_reviews_insert_own on public.class_reviews;
create policy class_reviews_insert_own
  on public.class_reviews
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.profile_id = auth.uid()
        and b.status = 'attended'
    )
  );

drop policy if exists class_reviews_staff_select on public.class_reviews;
create policy class_reviews_staff_select
  on public.class_reviews
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('director', 'management', 'guide')
    )
  );
