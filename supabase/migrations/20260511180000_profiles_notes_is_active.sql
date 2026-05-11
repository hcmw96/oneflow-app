-- Admin customer profile: internal notes + active flag for operations.
alter table public.profiles
  add column if not exists notes text;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

comment on column public.profiles.notes is 'Internal admin notes; not shown to the member.';
comment on column public.profiles.is_active is 'When false, member is treated as inactive for admin workflows.';
