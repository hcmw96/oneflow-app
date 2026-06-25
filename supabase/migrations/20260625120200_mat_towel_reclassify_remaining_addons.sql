-- Move remaining mat/towel add-on products out of yoga.

update public.products
set category = 'mat_towel'
where is_addon = true
  and category is distinct from 'mat_towel'
  and (
    lower(name) like '%mat%'
    or lower(name) like '%towel%'
  );

update public.user_credits uc
set category = 'mat_towel'
from public.products p
where uc.product_id = p.id
  and p.is_addon = true
  and (
    lower(p.name) like '%mat%'
    or lower(p.name) like '%towel%'
  );

update public.user_credits
set category = 'mat_towel'
where product_id is null
  and category is distinct from 'mat_towel'
  and (
    lower(trim(product_name)) like '%mat%'
    or lower(trim(product_name)) like '%towel%'
  )
  and (
    mat_access = true
    or towel_access = true
    or lower(trim(product_name)) like '%mat monthly%'
    or lower(trim(product_name)) like '%towel monthly%'
    or lower(trim(product_name)) like '%mat hire%'
    or lower(trim(product_name)) like '%towel hire%'
    or lower(trim(product_name)) like '%towel service%'
    or lower(trim(product_name)) like '%mat and towel%'
  );
