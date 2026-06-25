-- Legacy member import (Option C): staging rows only — no auth.users at import time.
-- On signup, claim_legacy_member_on_profile() attaches unclaimed rows by email.

create table if not exists public.legacy_members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  phone text,
  claimed_at timestamptz,
  claimed_by uuid references public.profiles (id) on delete set null,
  imported_at timestamptz not null default now()
);

create unique index if not exists legacy_members_email_idx
  on public.legacy_members (lower(trim(email)));

create index if not exists legacy_members_claimed_by_idx
  on public.legacy_members (claimed_by)
  where claimed_by is not null;

comment on table public.legacy_members is
  'Pre-migration member list. Claimed automatically when a profile is created with a matching email.';

alter table public.legacy_members enable row level security;

-- Director / management only (members never query this table from the app).
drop policy if exists "Staff can view legacy members" on public.legacy_members;
drop policy if exists legacy_members_select_staff on public.legacy_members;

create policy legacy_members_select_staff
  on public.legacy_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role::text, '')) in ('director', 'management')
    )
  );

-- Attach the oldest unclaimed legacy row when a new profile is created.
create or replace function public.claim_legacy_member_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  leg public.legacy_members%rowtype;
  em text;
begin
  em := lower(trim(coalesce(new.email, '')));
  if em = '' then
    return new;
  end if;

  select *
    into leg
  from public.legacy_members
  where lower(trim(email)) = em
    and claimed_at is null
  order by imported_at asc
  limit 1
  for update skip locked;

  if not found then
    return new;
  end if;

  update public.profiles p
  set
    first_name = case
      when p.first_name is null or btrim(p.first_name) = ''
        then coalesce(nullif(btrim(leg.first_name), ''), p.first_name)
      else p.first_name
    end,
    last_name = case
      when p.last_name is null or btrim(p.last_name) = ''
        then coalesce(nullif(btrim(leg.last_name), ''), p.last_name)
      else p.last_name
    end,
    phone = case
      when p.phone is null or btrim(p.phone) = ''
        then coalesce(nullif(btrim(leg.phone), ''), p.phone)
      else p.phone
    end
  where p.id = new.id;

  update public.legacy_members
  set
    claimed_at = now(),
    claimed_by = new.id
  where id = leg.id;

  return new;
end;
$$;

drop trigger if exists profiles_claim_legacy_member_trg on public.profiles;

create trigger profiles_claim_legacy_member_trg
  after insert on public.profiles
  for each row
  execute function public.claim_legacy_member_on_profile();
