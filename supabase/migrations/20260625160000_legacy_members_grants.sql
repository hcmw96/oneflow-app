-- PostgREST / import script need explicit grants (see service_role_walk_in_grants).
grant select on public.legacy_members to authenticated;
grant select, insert, update, delete on public.legacy_members to service_role;
