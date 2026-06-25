-- Onboarding: gender, home location, age, and how the member found One Flow.

alter table public.profiles
  add column if not exists gender text,
  add column if not exists location text,
  add column if not exists age integer,
  add column if not exists signup_source text;

comment on column public.profiles.location is 'Member home area / suburb (not studio room).';
comment on column public.profiles.age is 'Age at signup (self-reported).';
comment on column public.profiles.signup_source is 'How the member heard about One Flow.';

alter table public.profiles
  drop constraint if exists profiles_age_range;

alter table public.profiles
  add constraint profiles_age_range
  check (age is null or (age >= 13 and age <= 120));
