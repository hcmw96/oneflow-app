-- Complimentary first class for new members (pricing page R0 claim).
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
  'Free Intro Class',
  'Complimentary first class for new members.',
  0,
  1,
  'yoga',
  30,
  array['yoga','sculpt']::class_type[],
  false,
  false,
  true,
  0
where not exists (
  select 1 from public.products where lower(trim(name)) = lower('Free Intro Class')
);
