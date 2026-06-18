-- Capture in-studio POS sales so reports' total revenue = online + offline.
-- No pre-existing transactions table; this is the smallest viable model.

create table if not exists public.offline_revenue (
  id uuid primary key default gen_random_uuid(),
  -- When the actual sale happened (set explicitly so admins can backdate
  -- from a next-day Yoco reconciliation). UTC-stored; clients use JHB.
  occurred_at timestamptz not null,
  amount_zar numeric(10, 2) not null check (amount_zar > 0),
  source text not null default 'offline_pos'
    check (source in ('online', 'offline_pos')),
  -- Optional category mirrors products.category for the revenue-by-category
  -- chart (yoga / wellzone / all_access / etc).
  category text,
  -- Short free-text note: what was sold.
  note text,
  -- If recorded via Yoco reconciliation, the matched Yoco receipt / ref id.
  -- Used to make re-import idempotent — a re-uploaded CSV won't double-count.
  matched_yoco_ref text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists offline_revenue_occurred_at_idx
  on public.offline_revenue (occurred_at);

create unique index if not exists offline_revenue_matched_yoco_uniq
  on public.offline_revenue (matched_yoco_ref)
  where matched_yoco_ref is not null;

alter table public.offline_revenue enable row level security;

drop policy if exists offline_revenue_read on public.offline_revenue;
create policy offline_revenue_read on public.offline_revenue
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );

drop policy if exists offline_revenue_write on public.offline_revenue;
create policy offline_revenue_write on public.offline_revenue
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  )
  with check (
    exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );
