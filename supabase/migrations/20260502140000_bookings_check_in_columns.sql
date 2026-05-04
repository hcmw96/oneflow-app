-- QR check-in tracking on bookings
alter table public.bookings
  add column if not exists checked_in boolean default false;

alter table public.bookings
  add column if not exists checked_in_at timestamptz;
