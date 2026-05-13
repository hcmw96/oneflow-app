-- Optional fields for admin guides list / profile (safe if already present).
alter table if exists public.guides add column if not exists bio text;
alter table if exists public.guides add column if not exists photo_url text;
