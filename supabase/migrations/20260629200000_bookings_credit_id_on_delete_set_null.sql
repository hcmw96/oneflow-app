-- Allow admins to remove user_credits even when past bookings reference the package.
-- Historical bookings keep their row; credit_id is cleared instead of blocking delete.

alter table public.bookings
  drop constraint if exists bookings_credit_id_fkey;

alter table public.bookings
  add constraint bookings_credit_id_fkey
  foreign key (credit_id)
  references public.user_credits (id)
  on delete set null;
