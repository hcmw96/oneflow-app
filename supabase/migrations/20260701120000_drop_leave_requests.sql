-- Remove leave requests feature (table and RLS only).
-- leave-documents bucket: remove manually in Supabase dashboard if needed.

drop policy if exists leave_requests_insert_own on public.leave_requests;
drop policy if exists leave_requests_select_self_or_staff on public.leave_requests;
drop policy if exists leave_requests_update_staff on public.leave_requests;
drop policy if exists leave_requests_delete_staff on public.leave_requests;
drop policy if exists leave_requests_all on public.leave_requests;

drop table if exists public.leave_requests;
