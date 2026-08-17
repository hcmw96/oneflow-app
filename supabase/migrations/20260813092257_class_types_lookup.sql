-- Class-type lookup table + `classes.class_type_id` FK.
--
-- PROVENANCE: this DDL was already applied to production on 2026-08-13 09:22:57 UTC
-- by hand (Supabase SQL editor), NOT via `supabase db push`. It therefore left no row
-- in `supabase_migrations.schema_migrations`: local and remote migration history still
-- agree with each other, while the remote *schema* is a migration ahead. This file
-- records the change so a fresh environment reproduces production and the history
-- table becomes consistent.
--
-- Every statement below is idempotent, so pushing this against production is a no-op
-- EXCEPT for the grants at the bottom, which the original hand-run omitted (see note
-- there). Verified against a `supabase db dump --linked` of production.
--
-- `classes.class_type` and the `public.class_type` enum are deliberately left in place:
-- the frontend still reads the enum column, and `user_credits.allowed_class_types` /
-- `products.allowed_class_types` are `public.class_type[]`, so the enum is load-bearing
-- for credit eligibility.
--
-- NOTE: the nine rows seeded here are enum values, which are a mix of categories
-- ("Yoga") and types ("Power"). Migration 002 renames this table to
-- `public.class_categories` and introduces a separate type level beneath it.

create table if not exists public.class_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  colour text,
  category text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.class_types is
  'Editable class-type lookup seeded from the public.class_type enum. Renamed to class_categories in a later migration.';

-- Seed from the enum, in enum declaration order. `initcap(replace(slug,'_',' '))`
-- reproduces the exact names present in production ("Sauna Journey", "Beginner Sculpt").
insert into public.class_types (slug, name, sort_order)
select t.slug::text,
       initcap(replace(t.slug::text, '_', ' ')),
       t.ord::integer
from unnest(enum_range(null::public.class_type)) with ordinality as t (slug, ord)
on conflict (slug) do nothing;

-- Keep `updated_at` honest on edits from the admin UI.
drop trigger if exists class_types_touch on public.class_types;
create trigger class_types_touch
  before update on public.class_types
  for each row execute function public.touch_updated_at();

alter table public.classes
  add column if not exists class_type_id uuid references public.class_types (id);

comment on column public.classes.class_type_id is
  'Lookup FK alongside the legacy class_type enum column. Both are maintained until the frontend stops reading the enum.';

create index if not exists classes_class_type_id_idx
  on public.classes (class_type_id);

-- Backfill by matching slug to the existing enum value.
update public.classes c
set class_type_id = t.id
from public.class_types t
where t.slug = c.class_type::text
  and c.class_type_id is null;

alter table public.class_types enable row level security;

-- Readable by everyone; only director/management may write.
drop policy if exists class_types_read on public.class_types;
create policy class_types_read on public.class_types
  for select using (true);

drop policy if exists class_types_admin_write on public.class_types;
create policy class_types_admin_write on public.class_types
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['director'::public.user_role, 'management'::public.user_role])
    )
  );

-- FIX (not part of the original hand-run): production has NO table-level grants on
-- public.class_types, so PostgREST rejects every request with
-- `42501 permission denied for table class_types` regardless of the RLS policies above.
-- This project requires explicit grants — RLS alone is not enough; see
-- 20260625180000_member_messages_grants.sql. Nothing has broken yet only because the
-- frontend still reads `classes.class_type`.
--
-- No DELETE grant: class types are retired via `is_active`, never deleted, because
-- `guides.disciplines` stores these slugs and deleting orphans those guide records.
grant select, insert, update on public.class_types to authenticated;
grant all on public.class_types to service_role;
