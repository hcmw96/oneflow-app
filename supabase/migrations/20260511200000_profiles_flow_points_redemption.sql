-- Flow Points balance on profile (pack checkout redemption updates this column).
alter table public.profiles
  add column if not exists flow_points integer not null default 0;

-- Default: 100 points = R10 discount (rate = rand per 100 points).
insert into public.studio_settings (key, value)
values ('flow_points_conversion_rate', '10')
on conflict (key) do nothing;

-- Best-effort backfill when legacy balance table exists (not a view).
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'flow_points_balance'
      and c.relkind = 'r'
  ) then
    update public.profiles p
    set flow_points = greatest(coalesce(p.flow_points, 0), coalesce(b.balance::integer, 0))
    from public.flow_points_balance b
    where b.profile_id = p.id;
  end if;
end $$;

-- Atomic decrement for the signed-in user (payment success page).
create or replace function public.redeem_my_flow_points(p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_amount is null or p_amount <= 0 then
    return;
  end if;
  update public.profiles
  set flow_points = greatest(0, coalesce(flow_points, 0) - p_amount)
  where id = uid;
end;
$$;

revoke all on function public.redeem_my_flow_points(integer) from public;
grant execute on function public.redeem_my_flow_points(integer) to authenticated;
