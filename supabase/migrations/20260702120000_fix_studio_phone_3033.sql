-- Canonical studio phone: +27 82 553 3033
update public.studio_settings
set value = '+27 82 553 3033'
where key = 'studio_phone'
  and value in (
    '+27 82 553 3032',
    '27825533032',
    '+27 82 553 3033',
    '27825533033'
  );
