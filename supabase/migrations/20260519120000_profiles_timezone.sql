alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is 'IANA timezone detected from the user device (e.g. Africa/Johannesburg).';
