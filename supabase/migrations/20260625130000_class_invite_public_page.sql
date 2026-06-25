-- Public class-invite landing + authenticated accept/decline.

create or replace function public.get_class_invite_public(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  ci public.class_invites%rowtype;
  inviter_name text;
  cls record;
  booking_id uuid;
begin
  select * into ci from public.class_invites where id = p_invite_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    into inviter_name
  from public.profiles p
  where p.id = ci.inviter_id;

  select c.id, c.name, c.starts_at, c.ends_at, c.location, c.guide_name, c.is_cancelled
    into cls
  from public.classes c
  where c.id = ci.class_id;

  if cls.id is null then
    return jsonb_build_object('ok', false, 'code', 'class_missing');
  end if;

  if ci.invitee_id is not null then
    select b.id into booking_id
    from public.bookings b
    where b.profile_id = ci.invitee_id
      and b.class_id = ci.class_id
      and coalesce(b.status::text, '') not in ('cancelled')
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'invite', jsonb_build_object(
      'id', ci.id,
      'status', ci.status,
      'paid_by_inviter', coalesce(ci.paid_by_inviter, false),
      'invitee_email', ci.invitee_email,
      'invitee_name', ci.invitee_name,
      'invitee_id', ci.invitee_id,
      'booking_id', booking_id
    ),
    'inviter_name', coalesce(inviter_name, 'A friend'),
    'class', jsonb_build_object(
      'id', cls.id,
      'name', cls.name,
      'starts_at', cls.starts_at,
      'ends_at', cls.ends_at,
      'location', cls.location,
      'guide_name', cls.guide_name,
      'is_cancelled', coalesce(cls.is_cancelled, false)
    )
  );
end;
$$;

grant execute on function public.get_class_invite_public(uuid) to anon, authenticated;

create or replace function public.respond_class_invite(
  p_invite_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ci public.class_invites%rowtype;
  prof_email text;
  booking_id uuid;
  action text := lower(trim(coalesce(p_action, '')));
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'auth', 'message', 'Sign in to respond to this invite.');
  end if;

  if action not in ('accept', 'decline') then
    return jsonb_build_object('ok', false, 'code', 'invalid_action');
  end if;

  select email into prof_email from public.profiles where id = uid;

  select * into ci from public.class_invites where id = p_invite_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if ci.invitee_id is not null and ci.invitee_id <> uid then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'This invite is for another member.');
  end if;

  if ci.invitee_id is null then
    if ci.invitee_email is null or lower(trim(ci.invitee_email)) <> lower(trim(coalesce(prof_email, ''))) then
      return jsonb_build_object(
        'ok', false,
        'code', 'email_mismatch',
        'message', 'Sign in with the email address that received this invite.'
      );
    end if;
    update public.class_invites
      set invitee_id = uid,
          invitee_email = null,
          invitee_name = null
      where id = ci.id;
    ci.invitee_id := uid;
  end if;

  if ci.status::text in ('declined', 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'closed', 'message', 'This invite is no longer active.');
  end if;

  if action = 'decline' then
    update public.class_invites set status = 'declined' where id = ci.id;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- accept
  if ci.status::text = 'pending_payment' then
    return jsonb_build_object(
      'ok', false,
      'code', 'awaiting_payment',
      'message', 'Your friend has not finished paying for this class yet.'
    );
  end if;

  select b.id into booking_id
  from public.bookings b
  where b.profile_id = uid
    and b.class_id = ci.class_id
    and coalesce(b.status::text, '') not in ('cancelled')
  limit 1;

  if booking_id is not null then
    update public.class_invites set status = 'completed' where id = ci.id and status::text = 'pending';
    return jsonb_build_object('ok', true, 'status', 'completed', 'booked', true, 'booking_id', booking_id);
  end if;

  if coalesce(ci.paid_by_inviter, false) then
    insert into public.bookings (
      profile_id, class_id, status, payment_method,
      credit_id, flow_points_used, mat_addon, towel_addon, qr_token,
      class_invite_id
    ) values (
      uid, ci.class_id, 'confirmed', 'free',
      null, 0, false, false, gen_random_uuid(),
      ci.id
    )
    returning id into booking_id;

    update public.class_invites set status = 'completed' where id = ci.id;
    return jsonb_build_object('ok', true, 'status', 'completed', 'booked', true, 'booking_id', booking_id);
  end if;

  -- Unpaid invite: member books with their own credit on the schedule page.
  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'booked', false,
    'next', 'book',
    'class_id', ci.class_id
  );
end;
$$;

grant execute on function public.respond_class_invite(uuid, text) to authenticated;
