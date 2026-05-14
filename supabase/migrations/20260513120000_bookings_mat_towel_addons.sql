-- Mat / towel add-on flags on bookings (BookingSheet + check-in roster pills).
alter table public.bookings
  add column if not exists mat_addon boolean default false;

alter table public.bookings
  add column if not exists towel_addon boolean default false;
