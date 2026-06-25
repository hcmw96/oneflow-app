-- Ticket products for one-off events / priced classes (created from Schedule → New class).
alter table public.classes
  add column if not exists product_id uuid references public.products (id) on delete set null;

create index if not exists classes_product_id_idx
  on public.classes (product_id)
  where product_id is not null;

comment on column public.classes.product_id is
  'Optional single-use ticket product; when set, members book via that product (R0 = free ticket).';

alter table public.products
  add column if not exists is_class_ticket boolean not null default false;

comment on column public.products.is_class_ticket is
  'True for auto-created class/event tickets — hidden from the main pricing page.';
