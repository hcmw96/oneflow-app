-- How did you find us? (onboarding — reportable slug stored in referral_source).

alter table public.profiles
  add column if not exists referral_source text;

comment on column public.profiles.referral_source is
  'How the member found One Flow. Slugs: instagram, facebook, google_search, friend_word_of_mouth, walked_past, event_popup, or other:free text.';
