alter table public.profiles
  add column if not exists cafe_qr_token uuid;

update public.profiles
set cafe_qr_token = gen_random_uuid()
where cafe_qr_token is null;

alter table public.profiles
  alter column cafe_qr_token set default gen_random_uuid();

create unique index if not exists profiles_cafe_qr_token_unique
  on public.profiles (cafe_qr_token)
  where cafe_qr_token is not null;
