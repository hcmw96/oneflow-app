-- Allow class invites addressed to an email instead of an app profile.
-- Used when the recipient isn't yet a One Flow member.

alter table public.class_invites
  alter column invitee_id drop not null;

alter table public.class_invites
  add column if not exists invitee_email text,
  add column if not exists invitee_name text;

-- Exactly one of invitee_id or invitee_email must be present.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_invites_target_required'
      and conrelid = 'public.class_invites'::regclass
  ) then
    alter table public.class_invites
      add constraint class_invites_target_required check (
        invitee_id is not null or invitee_email is not null
      );
  end if;
end$$;

create index if not exists class_invites_invitee_email_idx
  on public.class_invites (lower(invitee_email))
  where invitee_email is not null;
