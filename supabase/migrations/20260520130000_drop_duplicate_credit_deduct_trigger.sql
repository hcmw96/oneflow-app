-- Studio already uses bookings_deduct_credit / deduct_credit_on_booking on INSERT.
-- Remove the duplicate trigger introduced in 20260520120000 if both were applied.

drop trigger if exists trg_deduct_credit_on_booking_insert on public.bookings;
drop function if exists public.deduct_credit_on_booking_insert();
