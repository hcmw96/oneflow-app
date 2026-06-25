-- Reclassify mat/towel add-on products and existing credits (enum value added in prior migration).

update public.products
set category = 'mat_towel'
where is_addon = true
  and lower(trim(name)) in ('mat monthly', 'towel monthly');

update public.user_credits
set category = 'mat_towel'
where lower(trim(product_name)) in ('mat monthly', 'towel monthly');
