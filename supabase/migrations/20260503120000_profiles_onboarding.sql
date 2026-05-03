-- Run in Supabase SQL editor or via `supabase db push` after linking the project.
-- Inspect existing columns:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' order by ordinal_position;

alter table public.profiles
  add column if not exists onboarding_complete boolean default false;

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists waiver_accepted_at timestamptz;

-- Optional one-time backfill for members who already had phone + DOB before this flow:
-- update public.profiles
-- set onboarding_complete = true
-- where phone is not null and date_of_birth is not null and onboarding_complete is distinct from true;
