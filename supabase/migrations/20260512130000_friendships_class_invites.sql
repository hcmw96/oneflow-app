-- Friend requests + class invites (used by customer FriendsPanel, BookingSheet, edge functions).

------------------------------------------------------------
-- friendships
------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

create unique index if not exists idx_friendships_pair on public.friendships (requester_id, addressee_id);
create index if not exists idx_friendships_requester on public.friendships (requester_id);
create index if not exists idx_friendships_addressee on public.friendships (addressee_id);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_participants on public.friendships;
create policy friendships_select_participants on public.friendships
  for select using (
    requester_id = auth.uid()
    or addressee_id = auth.uid()
  );

drop policy if exists friendships_insert_requester on public.friendships;
create policy friendships_insert_requester on public.friendships
  for insert with check (requester_id = auth.uid());

drop policy if exists friendships_update_addressee on public.friendships;
create policy friendships_update_addressee on public.friendships
  for update using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

------------------------------------------------------------
-- class_invites
------------------------------------------------------------
create table if not exists public.class_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  paid_by_inviter boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'pending_payment', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  constraint class_invites_no_self check (inviter_id <> invitee_id)
);

create index if not exists idx_class_invites_inviter on public.class_invites (inviter_id);
create index if not exists idx_class_invites_invitee on public.class_invites (invitee_id);
create index if not exists idx_class_invites_class on public.class_invites (class_id);

alter table public.class_invites enable row level security;

drop policy if exists class_invites_select_participants on public.class_invites;
create policy class_invites_select_participants on public.class_invites
  for select using (
    inviter_id = auth.uid()
    or invitee_id = auth.uid()
  );

drop policy if exists class_invites_insert_inviter on public.class_invites;
create policy class_invites_insert_inviter on public.class_invites
  for insert with check (inviter_id = auth.uid());
