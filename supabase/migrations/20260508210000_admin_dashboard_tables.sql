-- Admin dashboard tables: shifts, timesheets, guide_invoices, badges, member_badges,
-- promotions, email_campaigns, studio_messages, studio_settings.
-- Idempotent — safe to re-run.

-- Helper kept for any non-RLS callers; RLS policies inline the check below
-- because PostgREST + RLS were not honoring the wrapper consistently.
create or replace function public.is_admin_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and lower(coalesce(role, '')) in ('director', 'management')
  );
$$;

------------------------------------------------------------
-- shifts
------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  role_label text,
  location text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_shifts_profile_starts on public.shifts (profile_id, starts_at desc);
create index if not exists idx_shifts_starts on public.shifts (starts_at);

alter table public.shifts enable row level security;

drop policy if exists shifts_select_self_or_admin on public.shifts;
create policy shifts_select_self_or_admin on public.shifts
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists shifts_admin_write on public.shifts;
create policy shifts_admin_write on public.shifts
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists shifts_admin_update on public.shifts;
create policy shifts_admin_update on public.shifts
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists shifts_admin_delete on public.shifts;
create policy shifts_admin_delete on public.shifts
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

------------------------------------------------------------
-- timesheets
------------------------------------------------------------
create table if not exists public.timesheets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  date date,
  shift_id uuid references public.shifts (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_timesheets_profile_date on public.timesheets (profile_id, date desc);
create index if not exists idx_timesheets_date on public.timesheets (date desc);

alter table public.timesheets enable row level security;

drop policy if exists timesheets_select_self_or_admin on public.timesheets;
create policy timesheets_select_self_or_admin on public.timesheets
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists timesheets_insert_self_or_admin on public.timesheets;
create policy timesheets_insert_self_or_admin on public.timesheets
  for insert with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists timesheets_update_self_or_admin on public.timesheets;
create policy timesheets_update_self_or_admin on public.timesheets
  for update using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists timesheets_delete_admin on public.timesheets;
create policy timesheets_delete_admin on public.timesheets
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

------------------------------------------------------------
-- guide_invoices
------------------------------------------------------------
create table if not exists public.guide_invoices (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.profiles (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  period_start date,
  period_end date,
  line_items jsonb not null default '[]'::jsonb,
  total_amount numeric(12, 2) not null default 0,
  status text not null default 'pending',
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_guide_invoices_guide on public.guide_invoices (guide_id, submitted_at desc);
create index if not exists idx_guide_invoices_status on public.guide_invoices (status);

alter table public.guide_invoices enable row level security;

drop policy if exists guide_invoices_select on public.guide_invoices;
create policy guide_invoices_select on public.guide_invoices
  for select using (
    guide_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists guide_invoices_insert_self on public.guide_invoices;
create policy guide_invoices_insert_self on public.guide_invoices
  for insert with check (
    guide_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists guide_invoices_update_admin on public.guide_invoices;
create policy guide_invoices_update_admin on public.guide_invoices
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

------------------------------------------------------------
-- badges + member_badges
------------------------------------------------------------
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text,
  criteria_type text not null,
  criteria_value integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_badges_name_unique on public.badges (name);

alter table public.badges enable row level security;

drop policy if exists badges_select_authenticated on public.badges;
create policy badges_select_authenticated on public.badges
  for select using (auth.uid() is not null);

drop policy if exists badges_admin_all on public.badges;
create policy badges_admin_all on public.badges
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

create table if not exists public.member_badges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references public.profiles (id) on delete set null,
  notes text
);

create unique index if not exists idx_member_badges_unique on public.member_badges (profile_id, badge_id);
create index if not exists idx_member_badges_profile on public.member_badges (profile_id);
create index if not exists idx_member_badges_badge on public.member_badges (badge_id);

alter table public.member_badges enable row level security;

drop policy if exists member_badges_select on public.member_badges;
create policy member_badges_select on public.member_badges
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists member_badges_admin_write on public.member_badges;
create policy member_badges_admin_write on public.member_badges
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

-- Seed badges
insert into public.badges (name, description, icon, criteria_type, criteria_value)
values
  ('First Flow', 'Attended your first class', '🌱', 'classes_attended', 1),
  ('5 Classes', 'Attended 5 classes', '⭐', 'classes_attended', 5),
  ('10 Classes', 'Attended 10 classes', '🔥', 'classes_attended', 10),
  ('25 Classes', 'Attended 25 classes', '💫', 'classes_attended', 25),
  ('50 Classes', 'Attended 50 classes', '🏆', 'classes_attended', 50),
  ('4 Week Streak', 'Attended class every week for 4 weeks', '🌊', 'streak_weeks', 4),
  ('May Challenge', 'Completed the 31 Days of Movement challenge', '🎯', 'challenge_complete', 31)
on conflict (name) do nothing;

------------------------------------------------------------
-- promotions
------------------------------------------------------------
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  discount_type text not null,
  discount_value numeric(12, 2) not null,
  applies_to text not null default 'all',
  max_uses integer,
  uses_count integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_promotions_code_unique on public.promotions (code);
create index if not exists idx_promotions_active on public.promotions (is_active);

alter table public.promotions enable row level security;

drop policy if exists promotions_select_authenticated on public.promotions;
create policy promotions_select_authenticated on public.promotions
  for select using (auth.uid() is not null);

drop policy if exists promotions_admin_all on public.promotions;
create policy promotions_admin_all on public.promotions
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

------------------------------------------------------------
-- email_campaigns
------------------------------------------------------------
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_html text not null default '',
  recipient_filter jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  sent_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'draft'
);

create index if not exists idx_email_campaigns_status on public.email_campaigns (status, created_at desc);

alter table public.email_campaigns enable row level security;

drop policy if exists email_campaigns_admin_all on public.email_campaigns;
create policy email_campaigns_admin_all on public.email_campaigns
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

------------------------------------------------------------
-- studio_messages (renamed from messages — avoids conflict with reserved/auth schemas)
------------------------------------------------------------
-- If the previous incarnation of this migration created public.messages, rename it.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'messages'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'studio_messages'
  ) then
    execute 'alter table public.messages rename to studio_messages';
  end if;
end$$;

create table if not exists public.studio_messages (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid references public.profiles (id) on delete set null,
  to_profile_id uuid references public.profiles (id) on delete cascade,
  subject text,
  body text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  message_type text not null default 'direct'
);

create index if not exists idx_studio_messages_to_profile on public.studio_messages (to_profile_id, created_at desc);
create index if not exists idx_studio_messages_from_profile on public.studio_messages (from_profile_id, created_at desc);
create index if not exists idx_studio_messages_type on public.studio_messages (message_type);

alter table public.studio_messages enable row level security;

-- Drop legacy "messages_*" policy names if they still exist on the renamed table.
drop policy if exists messages_select on public.studio_messages;
drop policy if exists messages_insert on public.studio_messages;
drop policy if exists messages_update_recipient on public.studio_messages;
drop policy if exists messages_delete_admin on public.studio_messages;

drop policy if exists studio_messages_select on public.studio_messages;
create policy studio_messages_select on public.studio_messages
  for select using (
    to_profile_id = auth.uid()
    or from_profile_id = auth.uid()
    or message_type = 'announcement'
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists studio_messages_insert on public.studio_messages;
create policy studio_messages_insert on public.studio_messages
  for insert with check (
    from_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists studio_messages_update_recipient on public.studio_messages;
create policy studio_messages_update_recipient on public.studio_messages
  for update using (
    to_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    to_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

drop policy if exists studio_messages_delete_admin on public.studio_messages;
create policy studio_messages_delete_admin on public.studio_messages
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

------------------------------------------------------------
-- studio_settings
------------------------------------------------------------
create table if not exists public.studio_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create unique index if not exists idx_studio_settings_key on public.studio_settings (key);

alter table public.studio_settings enable row level security;

drop policy if exists studio_settings_select on public.studio_settings;
create policy studio_settings_select on public.studio_settings
  for select using (auth.uid() is not null);

drop policy if exists studio_settings_admin_write on public.studio_settings;
create policy studio_settings_admin_write on public.studio_settings
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role::text in ('director', 'management')
    )
  );

-- Seed defaults
insert into public.studio_settings (key, value)
values
  ('studio_name', 'One Flow'),
  ('studio_phone', '+27 82 553 3032'),
  ('studio_email', 'info@oneflow.co.za'),
  ('late_cancel_fee_zar', '100'),
  ('booking_open_days_ahead', '14'),
  ('checkin_open_minutes_before', '30'),
  ('flow_points_per_class', '10')
on conflict (key) do nothing;
