-- Amber-editable home event card (bottom of member home page).
insert into public.studio_settings (key, value)
values (
  'home_event_card',
  '{"enabled":false,"image_url":"","event_date":"","price_label":"","title":"","body_text":"","link_url":"/schedule","link_label":"Learn more"}'
)
on conflict (key) do nothing;
