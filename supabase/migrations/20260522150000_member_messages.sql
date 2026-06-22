-- Member → studio messages (compose in app; read/reply in admin client comms).

create table if not exists public.member_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  subject text,
  body text not null,
  status text not null default 'unread' check (status in ('unread', 'read')),
  created_at timestamptz not null default now()
);

create index if not exists member_messages_created_idx
  on public.member_messages (created_at desc);

create index if not exists member_messages_status_idx
  on public.member_messages (status)
  where status = 'unread';

alter table public.member_messages enable row level security;

drop policy if exists member_messages_insert_own on public.member_messages;
create policy member_messages_insert_own on public.member_messages
  for insert
  with check (profile_id = auth.uid());

drop policy if exists member_messages_select_own on public.member_messages;
create policy member_messages_select_own on public.member_messages
  for select
  using (profile_id = auth.uid());

drop policy if exists member_messages_select_staff on public.member_messages;
create policy member_messages_select_staff on public.member_messages
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in ('director', 'management')
    )
  );

drop policy if exists member_messages_update_staff on public.member_messages;
create policy member_messages_update_staff on public.member_messages
  for update
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
