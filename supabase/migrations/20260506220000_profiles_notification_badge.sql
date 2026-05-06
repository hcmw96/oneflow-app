alter table public.profiles
  add column if not exists unread_notification_count integer default 0;
