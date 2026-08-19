-- Inherit-only client-created categories.
--
-- A new category (e.g. Reformer Classes inheriting Pilates) cannot have its slug as a
-- public.class_type enum value — ALTER TYPE is DDL and is deferred. Instead the category
-- stores the parent's enum on `legacy_class_type`, and types under it inherit that, so
-- existing passes and credits treat the new category's classes identically to the parent.
--
-- Seeded categories keep slug = legacy_class_type (yoga, sculpt, pilates, wellzone, event).

alter table public.class_categories
  add column if not exists legacy_class_type public.class_type;

update public.class_categories c
set legacy_class_type = c.slug::public.class_type
where c.legacy_class_type is null
  and exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'class_type'
      and e.enumlabel = c.slug
  );

alter table public.class_categories
  alter column legacy_class_type set not null;

comment on column public.class_categories.legacy_class_type is
  'public.class_type enum value inherited by types in this category. Seeded categories '
  'match their slug. A client-created category copies this from the parent it inherits, '
  'so products.allowed_class_types / user_credits.allowed_class_types still match.';

comment on table public.class_categories is
  'Top level of the class taxonomy. Seeded rows are Yoga, Sculpt, Pilates, Wellzone, Events. '
  'Directors may add categories that inherit an existing category''s credit rules; '
  'standalone billing (a new enum value) is deferred. Types are never deleted.';
