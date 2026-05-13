-- Secondary roles (tags) in addition to profiles.role. Safe if already applied.
alter table if exists public.profiles
  add column if not exists secondary_roles text[] not null default '{}';
