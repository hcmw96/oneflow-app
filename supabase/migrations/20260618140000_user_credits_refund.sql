-- Admin refunds for user_credits transactions.
--
-- Adds tracking columns to user_credits and an RPC the admin client (and
-- the yoco-refund edge function) calls to atomically mark a credit as
-- refunded. The RPC verifies the caller is director/management.

alter table public.user_credits
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references public.profiles(id),
  add column if not exists refund_reason text,
  add column if not exists refund_yoco_id text,
  add column if not exists refund_amount_zar numeric(10, 2);

create index if not exists user_credits_refunded_at_idx
  on public.user_credits (refunded_at)
  where refunded_at is not null;

-- Mark a user_credit row as refunded.
-- Caller must be director or management. Returns the updated row.
create or replace function public.mark_user_credit_refunded(
  p_credit_id uuid,
  p_amount_zar numeric,
  p_reason text default null,
  p_refund_yoco_id text default null
)
returns table (
  id uuid,
  refunded_at timestamptz,
  refunded_by uuid,
  refund_reason text,
  refund_yoco_id text,
  refund_amount_zar numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_existing record;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select lower(coalesce(role::text, '')) into v_caller_role
    from public.profiles
    where id = v_caller;

  if v_caller_role not in ('director', 'management') then
    raise exception 'Only director or management can process refunds';
  end if;

  select uc.id, uc.refunded_at
    into v_existing
    from public.user_credits uc
    where uc.id = p_credit_id;

  if not found then
    raise exception 'Credit not found';
  end if;
  if v_existing.refunded_at is not null then
    raise exception 'Credit already refunded';
  end if;

  update public.user_credits uc
    set refunded_at = now(),
        refunded_by = v_caller,
        refund_reason = nullif(trim(coalesce(p_reason, '')), ''),
        refund_yoco_id = nullif(trim(coalesce(p_refund_yoco_id, '')), ''),
        refund_amount_zar = p_amount_zar,
        -- Zero out remaining credits so they can't be used after refund.
        credits_remaining = 0
    where uc.id = p_credit_id;

  return query
    select uc.id, uc.refunded_at, uc.refunded_by, uc.refund_reason,
           uc.refund_yoco_id, uc.refund_amount_zar
      from public.user_credits uc
      where uc.id = p_credit_id;
end;
$$;

grant execute on function public.mark_user_credit_refunded(uuid, numeric, text, text)
  to authenticated;
