-- Replaces attend trigger function: fixed ±10, revert on undo check-in, SECURITY DEFINER.
-- TG_OP guards: INSERT has no OLD row; subtract only on UPDATE.

create or replace function public.award_flow_points_on_attend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null
     and new.status = 'attended'
     and (tg_op = 'insert' or old.status is distinct from 'attended') then
    update public.profiles
    set flow_points = coalesce(flow_points, 0) + 10
    where id = new.profile_id;
  end if;

  if tg_op = 'update'
     and old.profile_id is not null
     and old.status = 'attended'
     and new.status is distinct from 'attended' then
    update public.profiles
    set flow_points = greatest(0, coalesce(flow_points, 0) - 10)
    where id = old.profile_id;
  end if;

  return new;
end;
$$;
