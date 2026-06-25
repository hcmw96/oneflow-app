-- Public images for marketing email campaigns (inline <img> in sent emails).

insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do update set public = true;

drop policy if exists email_assets_insert_marketing_admin on storage.objects;
create policy email_assets_insert_marketing_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'email-assets'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          lower(coalesce(p.role::text, '')) in ('director', 'management', 'marketing')
          or exists (
            select 1
            from unnest(coalesce(p.secondary_roles, '{}'::text[])) as sr(role)
            where lower(sr.role) = 'marketing'
          )
        )
    )
  );

drop policy if exists email_assets_delete_marketing_admin on storage.objects;
create policy email_assets_delete_marketing_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'email-assets'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          lower(coalesce(p.role::text, '')) in ('director', 'management', 'marketing')
          or exists (
            select 1
            from unnest(coalesce(p.secondary_roles, '{}'::text[])) as sr(role)
            where lower(sr.role) = 'marketing'
          )
        )
    )
  );
