-- Link weekly recurring class occurrences.
alter table public.classes
  add column if not exists recurring_group_id uuid null;

create index if not exists classes_recurring_group_id_idx
  on public.classes (recurring_group_id)
  where recurring_group_id is not null;
