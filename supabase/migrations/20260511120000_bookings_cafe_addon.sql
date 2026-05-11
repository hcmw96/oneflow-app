-- Future café add-on flag on bookings (UI uses The Sage user_credit for now).
alter table public.bookings
  add column if not exists cafe_addon boolean default false;
