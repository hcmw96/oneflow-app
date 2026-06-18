import { supabase } from "@/lib/supabase";

export type RefundResult = {
  yocoRefundId: string | null;
  amountZar: number;
};

/**
 * Refund a Yoco-backed user_credit. Calls the yoco-refund edge function which
 * hits Yoco's refunds API and then marks the credit refunded in the DB.
 */
export async function refundYocoCredit(args: {
  userCreditId: string;
  reason?: string;
}): Promise<RefundResult> {
  const { data, error } = await supabase.functions.invoke("yoco-refund", {
    body: { user_credit_id: args.userCreditId, reason: args.reason ?? "admin_refund" },
  });
  if (error) {
    throw new Error(error.message);
  }
  const payload = (data ?? {}) as { yoco_refund_id?: string | null; amount_zar?: number; error?: string };
  if (payload.error) throw new Error(payload.error);
  return {
    yocoRefundId: payload.yoco_refund_id ?? null,
    amountZar: Number(payload.amount_zar ?? 0),
  };
}

/**
 * Mark a non-Yoco (manual) user_credit refunded for record-keeping. Director or
 * management only — the RPC enforces.
 */
export async function markManualCreditRefunded(args: {
  userCreditId: string;
  amountZar: number;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("mark_user_credit_refunded", {
    p_credit_id: args.userCreditId,
    p_amount_zar: args.amountZar,
    p_reason: args.reason ?? "admin_refund_manual",
    p_refund_yoco_id: null,
  });
  if (error) throw new Error(error.message);
}
