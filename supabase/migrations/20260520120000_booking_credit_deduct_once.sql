-- Deduct class credits exactly once: on booking INSERT (BEFORE), not on status updates.
-- Removes duplicate deduction when the app also decremented client-side after insert.

-- Drop legacy triggers/functions that may exist on hosted DB (names vary).
drop trigger if exists trigger_deduct_credit_on_booking on public.bookings;
drop trigger if exists trg_deduct_booking_credit on public.bookings;
drop trigger if exists deduct_credit_on_booking_insert on public.bookings;
drop trigger if exists trigger_booking_use_credit on public.bookings;
drop trigger if exists trg_booking_credit_deduct on public.bookings;
drop trigger if exists trg_deduct_credit_on_booking_update on public.bookings;
drop trigger if exists trigger_deduct_credit_on_booking_attend on public.bookings;
drop trigger if exists trg_deduct_credit_on_booking_insert on public.bookings;

drop function if exists public.deduct_credit_on_booking();
drop function if exists public.deduct_booking_credit();
drop function if exists public.use_booking_credit();
drop function if exists public.handle_booking_credit_deduction();
drop function if exists public.deduct_credit_on_booking_insert();
drop function if exists public.deduct_credit_on_booking_update();

create or replace function public.deduct_credit_on_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cred public.user_credits%rowtype;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if new.credit_id is null then
    return new;
  end if;

  if new.profile_id is null then
    raise exception 'booking_profile_required';
  end if;

  select *
  into cred
  from public.user_credits
  where id = new.credit_id
    and profile_id = new.profile_id
  for update;

  if not found then
    raise exception 'credit_not_found';
  end if;

  if cred.is_unlimited is true then
    return new;
  end if;

  if coalesce(cred.credits_remaining, 0) < 1 then
    raise exception 'insufficient_credits';
  end if;

  update public.user_credits
  set credits_remaining = cred.credits_remaining - 1
  where id = cred.id;

  return new;
end;
$$;

drop trigger if exists trg_deduct_credit_on_booking_insert on public.bookings;

create trigger trg_deduct_credit_on_booking_insert
  before insert on public.bookings
  for each row
  execute function public.deduct_credit_on_booking_insert();
