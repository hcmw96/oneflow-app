alter table public.profiles
  add column if not exists weekly_goal integer;

update public.profiles
set weekly_goal = 3
where weekly_goal is null;

alter table public.profiles
  alter column weekly_goal set default 3;

alter table public.profiles
  drop constraint if exists profiles_weekly_goal_range;

alter table public.profiles
  add constraint profiles_weekly_goal_range check (weekly_goal >= 1 and weekly_goal <= 14);

alter table public.profiles
  add column if not exists notification_preferences jsonb default '{
    "class_reminders": true,
    "booking_confirmations": true,
    "cancellation_alerts": true,
    "promotional_updates": false
  }'::jsonb;

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles (id) on delete set null;
