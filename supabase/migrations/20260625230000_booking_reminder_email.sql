-- Track one-hour-before class reminder emails per booking.
alter table public.bookings
  add column if not exists reminder_email_sent_at timestamptz;

create index if not exists bookings_reminder_email_pending_idx
  on public.bookings (class_id, status)
  where status = 'confirmed' and reminder_email_sent_at is null;
