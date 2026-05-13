-- Record when a credit row was created (transaction history, sorting).
alter table if exists public.user_credits
  add column if not exists created_at timestamptz default now();
