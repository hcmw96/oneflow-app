-- PostgREST needs table-level grants; RLS policies alone are not enough in this project.
grant select, insert on public.member_messages to authenticated;
grant select, update on public.member_messages to authenticated;
grant all on public.member_messages to service_role;
