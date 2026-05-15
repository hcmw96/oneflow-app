-- Mat / towel access flags on credits (bundles + standalone add-ons).
alter table if exists public.user_credits
  add column if not exists mat_access boolean not null default false;

alter table if exists public.user_credits
  add column if not exists towel_access boolean not null default false;
