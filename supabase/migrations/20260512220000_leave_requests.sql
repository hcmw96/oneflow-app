-- Staff leave requests + storage for sick notes

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  leave_type text not null
    check (leave_type in ('annual_leave', 'sick_leave', 'family_responsibility', 'off_day', 'other')),
  start_date date not null,
  end_date date not null,
  notes text,
  sick_note_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint leave_requests_end_after_start check (end_date >= start_date)
);

alter table public.leave_requests enable row level security;

drop policy if exists leave_requests_all on public.leave_requests;
create policy leave_requests_all on public.leave_requests
  for all
  using (true)
  with check (true);

grant all on table public.leave_requests to authenticated;

-- Private bucket for sick notes / leave documents
insert into storage.buckets (id, name, public)
values ('leave-documents', 'leave-documents', false)
on conflict (id) do nothing;

drop policy if exists leave_documents_insert_own on storage.objects;
drop policy if exists leave_documents_select_authenticated on storage.objects;
drop policy if exists leave_documents_update_own on storage.objects;
drop policy if exists leave_documents_delete_own on storage.objects;

create policy leave_documents_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'leave-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy leave_documents_select_authenticated
  on storage.objects for select to authenticated
  using (bucket_id = 'leave-documents');

create policy leave_documents_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'leave-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'leave-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy leave_documents_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'leave-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
