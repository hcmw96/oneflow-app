-- Ensure member booking QR tokens always exist.
-- Includes backfill for existing rows with NULL qr_token.

alter table public.bookings
  add column if not exists qr_token uuid;

alter table public.bookings
  alter column qr_token set default gen_random_uuid();

update public.bookings
set qr_token = gen_random_uuid()
where qr_token is null;

