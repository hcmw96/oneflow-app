-- Mat / towel monthly hire add-ons for admin complimentary assignment.
insert into public.products (
  name,
  description,
  price_zar,
  credit_count,
  category,
  validity_days,
  allowed_class_types,
  is_addon,
  is_staff_only,
  is_active,
  sort_order
)
select
  'Mat Monthly',
  'Monthly mat hire — unlimited use for 30 days.',
  200,
  999,
  'yoga',
  30,
  array['yoga','sculpt']::class_type[],
  true,
  false,
  true,
  52
where not exists (
  select 1 from public.products where lower(trim(name)) = lower('Mat Monthly')
);

insert into public.products (
  name,
  description,
  price_zar,
  credit_count,
  category,
  validity_days,
  allowed_class_types,
  is_addon,
  is_staff_only,
  is_active,
  sort_order
)
select
  'Towel Monthly',
  'Monthly towel hire — unlimited use for 30 days.',
  150,
  999,
  'yoga',
  30,
  array['yoga','sculpt']::class_type[],
  true,
  false,
  true,
  53
where not exists (
  select 1 from public.products where lower(trim(name)) = lower('Towel Monthly')
);
