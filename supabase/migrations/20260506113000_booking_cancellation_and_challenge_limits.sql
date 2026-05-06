-- Booking cancellation + late fee fields
alter table public.bookings
  add column if not exists late_cancel boolean default false;

alter table public.bookings
  add column if not exists cancelled_at timestamptz;

alter table public.bookings
  add column if not exists cancellation_reason text;

alter table public.bookings
  add column if not exists qr_used boolean default false;

alter table public.profiles
  add column if not exists late_cancel_fee_pending boolean default false;

-- May challenge now supports up to 2 stamps per profile/day.
alter table public.challenge_checkins
  drop constraint if exists challenge_checkins_profile_id_class_date_key;

create or replace function public.enforce_max_two_challenge_checkins_per_day()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.challenge_checkins c
    where c.profile_id = new.profile_id
      and c.class_date = new.class_date
      and c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 2 then
    raise exception 'Maximum of 2 challenge check-ins allowed per day for this profile';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_challenge_checkins_max_two_per_day on public.challenge_checkins;

create trigger trg_challenge_checkins_max_two_per_day
before insert or update on public.challenge_checkins
for each row execute function public.enforce_max_two_challenge_checkins_per_day();
