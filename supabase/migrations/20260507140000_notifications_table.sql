-- In-app notifications (class invites, etc.). Safe if partially applied.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_notifications_profile_created
  on public.notifications (profile_id, created_at desc);
