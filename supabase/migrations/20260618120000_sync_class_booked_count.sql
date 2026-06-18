-- Keep classes.booked_count in sync with active bookings.
-- "Active" = any booking whose status is not 'cancelled'.

create or replace function public.sync_class_booked_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.status, '') <> 'cancelled' then
      update public.classes
        set booked_count = coalesce(booked_count, 0) + 1
        where id = new.class_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    -- transition into cancelled -> decrement
    if coalesce(old.status, '') <> 'cancelled'
       and coalesce(new.status, '') = 'cancelled' then
      update public.classes
        set booked_count = greatest(0, coalesce(booked_count, 0) - 1)
        where id = old.class_id;
    -- transition out of cancelled -> increment (defensive)
    elsif coalesce(old.status, '') = 'cancelled'
       and coalesce(new.status, '') <> 'cancelled' then
      update public.classes
        set booked_count = coalesce(booked_count, 0) + 1
        where id = new.class_id;
    end if;
    -- if class_id changed on a non-cancelled booking, move the count
    if coalesce(new.status, '') <> 'cancelled'
       and coalesce(old.status, '') <> 'cancelled'
       and old.class_id is distinct from new.class_id then
      update public.classes
        set booked_count = greatest(0, coalesce(booked_count, 0) - 1)
        where id = old.class_id;
      update public.classes
        set booked_count = coalesce(booked_count, 0) + 1
        where id = new.class_id;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    if coalesce(old.status, '') <> 'cancelled' then
      update public.classes
        set booked_count = greatest(0, coalesce(booked_count, 0) - 1)
        where id = old.class_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_class_booked_count_trg on public.bookings;
create trigger sync_class_booked_count_trg
  after insert or update or delete on public.bookings
  for each row
  execute function public.sync_class_booked_count();

-- Backfill: recompute booked_count from current active bookings.
update public.classes c
  set booked_count = coalesce(sub.cnt, 0)
  from (
    select class_id, count(*)::int as cnt
    from public.bookings
    where coalesce(status, '') <> 'cancelled'
    group by class_id
  ) sub
  where c.id = sub.class_id;

-- Zero out classes that had stale counts but no active bookings.
update public.classes
  set booked_count = 0
  where coalesce(booked_count, 0) > 0
    and id not in (
      select distinct class_id
      from public.bookings
      where coalesce(status, '') <> 'cancelled'
    );
