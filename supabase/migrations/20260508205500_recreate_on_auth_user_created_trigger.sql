-- Self-heal auth.users -> profiles trigger in case it was dropped or misattached.
-- Keeps existing public.handle_new_user() implementation and re-attaches the trigger.

do $$
begin
  -- Ensure the trigger function exists before attaching the trigger.
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
  ) then
    raise exception 'public.handle_new_user() does not exist. Run the handle_new_user migration first.';
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

