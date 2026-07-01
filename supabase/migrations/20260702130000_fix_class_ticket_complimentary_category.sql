-- R0 class tickets were saved as category "complimentary" even for wellzone/sauna/power.
-- Re-categorise linked ticket products from their class type so credit matching works.

update public.products p
set category = (
  case c.class_type
    when 'wellzone' then 'wellzone'
    when 'sauna_journey' then 'wellzone'
    when 'power' then 'power'
    else 'yoga'
  end
)::public.credit_category
from public.classes c
where c.product_id = p.id
  and p.is_class_ticket = true
  and p.category = 'complimentary'
  and c.class_type in (
    'yoga',
    'sculpt',
    'pilates',
    'wellzone',
    'sauna_journey',
    'power',
    'beginner',
    'beginner_sculpt',
    'event'
  );
