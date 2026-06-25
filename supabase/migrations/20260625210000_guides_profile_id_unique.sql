-- invite-guide and admin guides upsert use ON CONFLICT (profile_id).
create unique index if not exists guides_profile_id_key on public.guides (profile_id);
