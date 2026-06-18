-- Grant table-level privileges on offline_revenue so PostgREST gets past the
-- "permission denied for table" check before reaching the RLS policy from
-- 20260618170000_offline_revenue.sql. RLS still gates which rows are visible.

grant select, insert, update, delete on public.offline_revenue to authenticated;
grant all on public.offline_revenue to service_role;
