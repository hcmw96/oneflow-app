-- Remove leave requests feature (table, RLS, and sick-note storage bucket).

drop policy if exists leave_requests_insert_own on public.leave_requests;
drop policy if exists leave_requests_select_self_or_staff on public.leave_requests;
drop policy if exists leave_requests_update_staff on public.leave_requests;
drop policy if exists leave_requests_delete_staff on public.leave_requests;
drop policy if exists leave_requests_all on public.leave_requests;

drop table if exists public.leave_requests;

drop policy if exists leave_documents_insert_own on storage.objects;
drop policy if exists leave_documents_select_authenticated on storage.objects;
drop policy if exists leave_documents_update_own on storage.objects;
drop policy if exists leave_documents_delete_own on storage.objects;

delete from storage.objects where bucket_id = 'leave-documents';
delete from storage.buckets where id = 'leave-documents';
