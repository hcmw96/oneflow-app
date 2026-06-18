-- Lock down leave_requests RLS and the leave-documents storage bucket.
-- Replaces the blanket using(true) with check(true) policy from
-- 20260512220000_leave_requests.sql, which let any authenticated user
-- read/modify all leave requests (including sick notes).

-- =============================================================
-- leave_requests table
-- =============================================================
drop policy if exists leave_requests_all on public.leave_requests;
drop policy if exists leave_requests_insert_own on public.leave_requests;
drop policy if exists leave_requests_select_self_or_staff on public.leave_requests;
drop policy if exists leave_requests_update_staff on public.leave_requests;
drop policy if exists leave_requests_delete_staff on public.leave_requests;

-- Staff submit their own request.
create policy leave_requests_insert_own on public.leave_requests
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

-- Owners read their own; director/management read all.
create policy leave_requests_select_self_or_staff on public.leave_requests
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );

-- Only director/management approve, decline, or edit review notes.
create policy leave_requests_update_staff on public.leave_requests
  for update to authenticated
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

-- Only director/management delete.
create policy leave_requests_delete_staff on public.leave_requests
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and lower(coalesce(pr.role::text, '')) in ('director', 'management')
    )
  );

-- =============================================================
-- leave-documents storage bucket
-- Tighten SELECT to uploader OR director/management.
-- Insert/update/delete own policies from the original migration remain.
-- =============================================================
drop policy if exists leave_documents_select_authenticated on storage.objects;
drop policy if exists leave_documents_select_self_or_staff on storage.objects;

create policy leave_documents_select_self_or_staff
  on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1 from public.profiles pr
        where pr.id = (select auth.uid())
          and lower(coalesce(pr.role::text, '')) in ('director', 'management')
      )
    )
  );
