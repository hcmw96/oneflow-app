-- On new auth.users row, upsert profiles with names parsed from OAuth/OIDC metadata
-- (full_name, name, given_name, family_name). Does not overwrite existing non-empty first_name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  fn text;
  ln text;
  fulln text;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  fn := nullif(trim(coalesce(meta->>'given_name', '')), '');
  ln := nullif(trim(coalesce(meta->>'family_name', '')), '');
  fulln := nullif(trim(coalesce(meta->>'full_name', meta->>'name', '')), '');

  if fn is null and fulln is not null then
    fn := nullif(split_part(fulln, ' ', 1), '');
    if position(' ' in fulln) > 0 then
      ln := nullif(trim(substring(fulln from position(' ' in fulln) + 1)), '');
    end if;
  end if;

  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    fn,
    ln,
    'customer'
  )
  on conflict (id) do update set
    email = coalesce(nullif(excluded.email, ''), profiles.email),
    first_name = case
      when profiles.first_name is null or btrim(profiles.first_name) = '' then coalesce(excluded.first_name, profiles.first_name)
      else profiles.first_name
    end,
    last_name = case
      when profiles.first_name is null or btrim(profiles.first_name) = '' then coalesce(excluded.last_name, profiles.last_name)
      else profiles.last_name
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
