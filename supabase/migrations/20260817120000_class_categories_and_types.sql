-- Two-level class taxonomy: class_categories (fixed) → class_types (editable by Master).
--
-- Builds on 20260813092257_class_types_lookup.sql, which created a single flat
-- `public.class_types` seeded from the nine `public.class_type` enum values. Those nine
-- are a mix of categories ("Yoga") and types ("Power"), so this migration:
--
--   1. renames that table to `public.class_categories` and `classes.class_type_id`
--      to `classes.class_category_id` (data and FK preserved, nothing re-backfilled);
--   2. demotes `power`, `beginner`, `beginner_sculpt` and `sauna_journey` from category
--      to type, leaving the five categories the client named:
--      Yoga, Sculpt, Pilates, Wellzone, Events;
--   3. creates a new `public.class_types` under those categories, carrying the behaviour
--      flags that currently live as hardcoded slug sets in `src/lib/allowedClassTypes.ts`.
--
-- WHY THE ENUM SURVIVES
--
-- `products.allowed_class_types` and `user_credits.allowed_class_types` are
-- `public.class_type[]`. Credit eligibility is matched against `classes.class_type`, so
-- the enum cannot be narrowed and the three demoted slugs cannot leave it. Instead every
-- class type carries `legacy_class_type`: the enum value a class of that type writes into
-- `classes.class_type`. A "Yoga: Flow State" class stores `yoga`; "Yoga: Power" stores
-- `power`; "Yoga: Beginners" stores `beginner`. Credit matching is therefore bit-identical
-- to today, including for types the client invents later, which inherit their category's
-- enum value.
--
-- DEFAULTS PRESERVE TODAY'S BEHAVIOUR EXACTLY. `beginner` and `beginner_sculpt` seed with
-- `is_free_intro = true` (they are `FREE_BEGINNER_CLASS_TYPES` today); the Wellzone category
-- reproduces `WELLZONE_CLASS_TYPES`; `classes.credit_covered` defaults to true, matching
-- `event` being unconditionally present in `ALL_ALLOWED_CLASS_TYPES`. Nothing changes until
-- the client changes it in Master.
--
-- Deliberately NOT done: dropping class types. `guides.disciplines` stores these slugs, so
-- deletion orphans guide records. Retirement is `is_active = false`. There is no DELETE grant.

-- ---------------------------------------------------------------------------
-- 1. class_types → class_categories
-- ---------------------------------------------------------------------------

-- Index names are unique per schema, so the old indexes must be renamed out of the way
-- before the new `class_types` table claims those auto-generated names.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'class_types' and c.relkind = 'r'
  ) and not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'class_categories'
  ) then
    alter table public.class_types rename to class_categories;
    alter index public.class_types_pkey rename to class_categories_pkey;
    alter index public.class_types_slug_key rename to class_categories_slug_key;
    alter trigger class_types_touch on public.class_categories rename to class_categories_touch;

    alter policy class_types_read on public.class_categories rename to class_categories_read;
    alter policy class_types_admin_write on public.class_categories
      rename to class_categories_admin_write;
  end if;
end $$;

comment on table public.class_categories is
  'Fixed top level of the class taxonomy (Yoga, Sculpt, Pilates, Wellzone, Events). '
  'Credit rules key on category, so categories are not client-editable; class_types are.';

-- `classes.class_type_id` was backfilled against the flat table, i.e. it holds a category.
-- Rename it rather than re-deriving, then free the name for the new type-level FK.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'class_type_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'class_category_id'
  ) then
    alter table public.classes rename column class_type_id to class_category_id;
    alter table public.classes
      rename constraint classes_class_type_id_fkey to classes_class_category_id_fkey;
    alter index public.classes_class_type_id_idx rename to classes_class_category_id_idx;
  end if;
end $$;

comment on column public.classes.class_category_id is
  'Category-level FK. Set for every class; the finer class_type_id may be null on historical '
  'rows whose enum value ("yoga", "sculpt") names only a category.';

-- ---------------------------------------------------------------------------
-- 2. Five categories
-- ---------------------------------------------------------------------------

-- Category accents seed from CLASS_TYPE_THEME_BY_SLUG in src/lib/allowedClassTypes.ts so a
-- newly created type inherits a sensible colour instead of rendering with FALLBACK_THEME grey.
update public.class_categories set name = 'Events', colour = '#9333ea', sort_order = 50
  where slug = 'event';
update public.class_categories set name = 'Yoga',     colour = '#7a9a68', sort_order = 10
  where slug = 'yoga';
update public.class_categories set name = 'Sculpt',   colour = '#d97706', sort_order = 20
  where slug = 'sculpt';
update public.class_categories set name = 'Pilates',  colour = '#7c3aed', sort_order = 30
  where slug = 'pilates';
update public.class_categories set name = 'Wellzone', colour = '#0284c7', sort_order = 40
  where slug = 'wellzone';

insert into public.class_categories (slug, name, colour, sort_order)
values
  ('yoga',     'Yoga',     '#7a9a68', 10),
  ('sculpt',   'Sculpt',   '#d97706', 20),
  ('pilates',  'Pilates',  '#7c3aed', 30),
  ('wellzone', 'Wellzone', '#0284c7', 40),
  ('event',    'Events',   '#9333ea', 50)
on conflict (slug) do nothing;

-- Repoint classes that referenced a demoted category onto its real category, so the
-- demoted rows can be deleted below. `sauna_journey` and the two free-intro slugs were
-- never categories in the client's model.
update public.classes c
set class_category_id = cat.id
from public.class_categories cat
where cat.slug = case c.class_type::text
                   when 'power'           then 'yoga'
                   when 'beginner'        then 'yoga'
                   when 'beginner_sculpt' then 'sculpt'
                   when 'sauna_journey'   then 'wellzone'
                   else c.class_type::text
                 end
  and (c.class_category_id is distinct from cat.id);

-- Fails loudly on FK violation if any class still points at a demoted row, rather than
-- silently orphaning it.
delete from public.class_categories
where slug in ('power', 'beginner', 'beginner_sculpt', 'sauna_journey');

-- ---------------------------------------------------------------------------
-- 3. class_types
-- ---------------------------------------------------------------------------

create table if not exists public.class_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.class_categories (id),
  slug text not null unique,
  name text not null,
  -- Enum value written to classes.class_type for classes of this type. Keeps
  -- products/user_credits.allowed_class_types (class_type[]) matching unchanged.
  legacy_class_type public.class_type not null,
  -- Replaces FREE_BEGINNER_CLASS_TYPES: books with no credit and no payment.
  is_free_intro boolean not null default false,
  -- Unguided types (Wellzone sauna & plunge) have no guide. Drives whether class creation
  -- asks for one and whether bulk guide reassignment may touch the class.
  is_guided boolean not null default true,
  -- Null inherits the category colour; set to override per type.
  colour text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.class_types is
  'Client-editable second level. Renaming a row retitles every scheduled class of that type '
  'with zero writes to public.classes, because titles are derived at render time.';
comment on column public.class_types.legacy_class_type is
  'public.class_type enum value stored on classes.class_type for this type. Credit '
  'eligibility keys on the enum, so this is what keeps billing behaviour identical.';

drop trigger if exists class_types_touch on public.class_types;
create trigger class_types_touch
  before update on public.class_types
  for each row execute function public.touch_updated_at();

-- Seed: the client's full list, plus every enum value that must remain resolvable.
-- `sort_order` is per-category and spaced by 10 to leave room for reordering in Master.
insert into public.class_types
  (category_id, slug, name, legacy_class_type, is_free_intro, is_guided, colour, sort_order)
select cat.id, v.slug, v.name, v.legacy::public.class_type,
       v.is_free_intro, v.is_guided, v.colour, v.sort_order
from (values
  -- Yoga
  ('yoga',     'flow_state',           'Flow State',           'yoga',            false, true, null,      10),
  ('yoga',     'power',                'Power',                'power',           false, true, '#44403c', 20),
  ('yoga',     'warm_vinyasa',         'Warm Vinyasa',         'yoga',            false, true, null,      30),
  ('yoga',     'vinyasa',              'Vinyasa',              'yoga',            false, true, null,      40),
  ('yoga',     'beginner',             'Beginners',            'beginner',        true,  true, '#8fa67d', 50),
  ('yoga',     'stretch_and_recovery', 'Stretch and Recovery', 'yoga',            false, true, null,      60),
  -- Sculpt
  ('sculpt',   'kettle_bell',          'Kettle Bell',          'sculpt',          false, true, null,      10),
  ('sculpt',   'hiit',                 'HIIT',                 'sculpt',          false, true, null,      20),
  ('sculpt',   'liit',                 'LIIT',                 'sculpt',          false, true, null,      30),
  -- beginner_sculpt is absent from the client's list but is in FREE_BEGINNER_CLASS_TYPES
  -- today, so it books free. Seeded active and free rather than dropped silently —
  -- retire it in Master with is_active if she confirms it is gone.
  ('sculpt',   'beginner_sculpt',      'Beginner Sculpt',      'beginner_sculpt', true,  true, '#e8a54b', 40),
  -- Pilates
  ('pilates',  'pilates_flow',         'Flow',                 'pilates',         false, true, null,      10),
  -- Wellzone
  ('wellzone', 'sauna_journey',        'Guided Sauna Journey', 'sauna_journey',   false, true, '#ea580c', 10),
  ('wellzone', 'guided_series',        'Guided Series',        'sauna_journey',   false, true, null,      20),
  ('wellzone', 'wellzone',             'Unguided',             'wellzone',        false, false, '#0284c7', 30),
  -- Events
  ('event',    'event',                'Event',                'event',           false, true, '#9333ea', 10)
) as v (category_slug, slug, name, legacy, is_free_intro, is_guided, colour, sort_order)
join public.class_categories cat on cat.slug = v.category_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 4. classes.class_type_id, title_override, credit_covered
-- ---------------------------------------------------------------------------

alter table public.classes
  add column if not exists class_type_id uuid references public.class_types (id);

create index if not exists classes_class_type_id_idx
  on public.classes (class_type_id);

comment on column public.classes.class_type_id is
  'Type-level FK. Null for historical rows whose enum value names only a category '
  '("yoga", "sculpt") and so cannot be resolved to Flow State vs Vinyasa; those fall '
  'back to the category name at render time.';

-- Backfill only where the enum identifies exactly one type. `yoga` and `sculpt` are
-- category-level and stay null on purpose.
update public.classes c
set class_type_id = t.id
from public.class_types t
where t.slug = c.class_type::text
  and c.class_type::text not in ('yoga', 'sculpt')
  and c.class_type_id is null;

alter table public.classes
  add column if not exists title_override text;

comment on column public.classes.title_override is
  'Overrides the derived "Category: Type" title when set. For one-offs such as '
  '"Full Moon Sauna". Null means the title follows the class type, so renaming a type '
  'retitles every scheduled class of that type without writing to this table.';

-- Per-event payment route. Default true reproduces today: `event` is unconditionally in
-- ALL_ALLOWED_CLASS_TYPES, so all-access credits cover every event. A price is the existing
-- linked ticket product (classes.product_id → products.price_zar) — see
-- src/lib/classTicketProduct.ts. Both set means members use credits and non-members pay.
alter table public.classes
  add column if not exists credit_covered boolean not null default true;

comment on column public.classes.credit_covered is
  'Whether member credits can pay for this class. Combine with product_id (a ticket '
  'product) to offer both routes on the same event.';

-- ---------------------------------------------------------------------------
-- 5. RLS + grants
-- ---------------------------------------------------------------------------

alter table public.class_types enable row level security;

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

-- RLS alone is not enough in this project; PostgREST needs table-level grants or every
-- request fails with 42501. See 20260625180000_member_messages_grants.sql.
-- No DELETE grant: types are retired via is_active, never deleted.
grant select, insert, update on public.class_types to authenticated;
grant all on public.class_types to service_role;
