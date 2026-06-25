insert into public.studio_settings (key, value)
values (
  'movement_challenge',
  '{"enabled":true,"badge_label":"May Challenge","title":"31 Days of Movement","subtitle":"May 2026 · Check in at the studio to collect your daily stamp.","stamp_help_text":"Stamps appear when you''re checked in at the desk during the challenge period. One stamp per calendar day (up to 2 per day).","booking_banner_text":"Counts toward 31 Days of Movement","start_date":"2026-05-01","end_date":"2026-05-31","image_url":""}'
)
on conflict (key) do nothing;
