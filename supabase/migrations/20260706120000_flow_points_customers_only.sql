-- Flow Points on attend: customers only (primary role), ignore secondary_roles.

create or replace function public.profile_earns_flow_points(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and lower(coalesce(p.role::text, '')) = 'customer'
  );
$$;
