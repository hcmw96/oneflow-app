-- Referral bonus: 500 Flow Points to referrer when an email class-invite completes their first booking.
-- Uses existing referrals + flow_points tables (no new tables).

alter table public.class_invites
  add column if not exists invited_via_email boolean not null default false;

-- Recreate attach helper so pending email invites register a referrals row.
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
          invitee_name = null,
          invited_via_email = true
      where id = v_invite.id;

    if v_invite.inviter_id is not null and v_invite.inviter_id <> p_profile_id then
      insert into public.referrals (referrer_id, referred_id, referral_type, points_awarded)
      select v_invite.inviter_id, p_profile_id, 'class_invite_email', 0
      where not exists (
        select 1
        from public.referrals r
        where r.referrer_id = v_invite.inviter_id
          and r.referred_id = p_profile_id
      );
    end if;

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

create or replace function public.award_referral_bonus_on_first_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_referral_id uuid;
  v_invitee_name text;
  v_bonus integer := 500;
begin
  if new.profile_id is null or coalesce(new.status::text, '') = 'cancelled' then
    return new;
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.profile_id = new.profile_id
      and b.id <> new.id
      and coalesce(b.status::text, '') <> 'cancelled'
  ) then
    return new;
  end if;

  select r.id, r.referrer_id
    into v_referral_id, v_referrer_id
    from public.referrals r
    where r.referred_id = new.profile_id
      and r.referral_type = 'class_invite_email'
      and coalesce(r.points_awarded, 0) = 0
    order by r.created_at
    limit 1;

  if v_referrer_id is null and new.class_invite_id is not null then
    select ci.inviter_id
      into v_referrer_id
      from public.class_invites ci
      where ci.id = new.class_invite_id
        and ci.invited_via_email = true
        and ci.inviter_id is not null
        and ci.inviter_id <> new.profile_id;

    if v_referrer_id is not null then
      insert into public.referrals (referrer_id, referred_id, referral_type, points_awarded)
      select v_referrer_id, new.profile_id, 'class_invite_email', 0
      where not exists (
        select 1
        from public.referrals r
        where r.referrer_id = v_referrer_id
          and r.referred_id = new.profile_id
      )
      returning id into v_referral_id;

      if v_referral_id is null then
        select r.id
          into v_referral_id
          from public.referrals r
          where r.referrer_id = v_referrer_id
            and r.referred_id = new.profile_id
          limit 1;
      end if;
    end if;
  end if;

  if v_referrer_id is null or v_referral_id is null then
    return new;
  end if;

  update public.referrals
    set points_awarded = v_bonus
    where id = v_referral_id
      and coalesce(points_awarded, 0) = 0;

  if not found then
    return new;
  end if;

  update public.profiles
    set flow_points = coalesce(flow_points, 0) + v_bonus
    where id = v_referrer_id;

  insert into public.flow_points (profile_id, points, reason, reference_id)
  values (v_referrer_id, v_bonus, 'referral_bonus', v_referral_id);

  select nullif(trim(coalesce(p.first_name, '')), '')
    into v_invitee_name
    from public.profiles p
    where p.id = new.profile_id;

  insert into public.notifications (profile_id, type, title, body)
  values (
    v_referrer_id,
    'referral_bonus',
    format(
      'You earned %s Flow Points for inviting %s!',
      v_bonus,
      coalesce(v_invitee_name, 'your friend')
    ),
    null
  );

  return new;
end;
$$;

drop trigger if exists trigger_award_referral_bonus on public.bookings;
create trigger trigger_award_referral_bonus
  after insert on public.bookings
  for each row
  execute function public.award_referral_bonus_on_first_booking();
