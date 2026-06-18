-- Finish wiring "Pay for them" so the friend actually gets a booking,
-- and let pending email invites auto-attach when the recipient signs up.

alter table public.class_invites
  add column if not exists yoco_payment_id text,
  add column if not exists checkout_id text;

-- Bookings created on behalf of an invite link back to it for audit.
alter table public.bookings
  add column if not exists class_invite_id uuid
    references public.class_invites(id) on delete set null;

-- Attach pending email-only invites to a profile (called from a profile
-- trigger after insert or email change) and auto-book any that were paid.
create or replace function public.attach_pending_class_invites(
  p_profile_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite record;
  v_existing_booking uuid;
begin
  if v_email = '' or p_profile_id is null then
    return;
  end if;
  for v_invite in
    select id, class_id, paid_by_inviter, yoco_payment_id, inviter_id
      from public.class_invites
      where lower(invitee_email) = v_email
        and invitee_id is null
  loop
    update public.class_invites
      set invitee_id = p_profile_id,
          invitee_email = null,
          invitee_name = null
      where id = v_invite.id;

    if v_invite.paid_by_inviter and v_invite.yoco_payment_id is not null then
      select b.id into v_existing_booking
        from public.bookings b
        where b.profile_id = p_profile_id
          and b.class_id = v_invite.class_id
          and coalesce(b.status::text, '') <> 'cancelled'
        limit 1;
      if v_existing_booking is null then
        insert into public.bookings (
          profile_id, class_id, status, payment_method,
          credit_id, flow_points_used, mat_addon, towel_addon, qr_token,
          class_invite_id
        ) values (
          p_profile_id, v_invite.class_id, 'confirmed', 'free',
          null, 0, false, false, gen_random_uuid(),
          v_invite.id
        );
      end if;
    end if;
  end loop;
end;
$$;

grant execute on function public.attach_pending_class_invites(uuid, text)
  to authenticated, service_role;

create or replace function public.profiles_match_pending_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email <> '' then
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and coalesce(old.email, '') is distinct from new.email) then
      perform public.attach_pending_class_invites(new.id, new.email);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_match_pending_invites_trg on public.profiles;
create trigger profiles_match_pending_invites_trg
  after insert or update of email on public.profiles
  for each row
  execute function public.profiles_match_pending_invites();

-- Server-side helper for the yoco webhook to record the paid invite and
-- optionally insert the booking when the recipient is already a member.
create or replace function public.record_paid_class_invite(
  p_class_invite_id uuid,
  p_yoco_payment_id text,
  p_checkout_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_existing_booking uuid;
begin
  update public.class_invites
    set yoco_payment_id = p_yoco_payment_id,
        checkout_id = p_checkout_id,
        status = case
                   when status::text = 'pending_payment' then 'pending'
                   else status
                 end
    where id = p_class_invite_id
  returning id, class_id, invitee_id, paid_by_inviter, yoco_payment_id
    into v_invite;

  if not found then return; end if;

  if v_invite.invitee_id is not null and v_invite.paid_by_inviter then
    select b.id into v_existing_booking
      from public.bookings b
      where b.profile_id = v_invite.invitee_id
        and b.class_id = v_invite.class_id
        and coalesce(b.status::text, '') <> 'cancelled'
      limit 1;
    if v_existing_booking is null then
      insert into public.bookings (
        profile_id, class_id, status, payment_method,
        credit_id, flow_points_used, mat_addon, towel_addon, qr_token,
        class_invite_id
      ) values (
        v_invite.invitee_id, v_invite.class_id, 'confirmed', 'free',
        null, 0, false, false, gen_random_uuid(),
        p_class_invite_id
      );
    end if;
  end if;
end;
$$;

grant execute on function public.record_paid_class_invite(uuid, text, text)
  to service_role;
