import { supabase } from "@/lib/supabase";
import { isUserCreditActiveNow, type UserCreditPillSource } from "@/lib/activeUserCredits";

export type CafeCreditRow = UserCreditPillSource & {
  id: string;
  category: string | null;
};

export function isCafeCredit(row: { category?: string | null }): boolean {
  return (row.category ?? "").trim().toLowerCase() === "cafe";
}

export function sumCafeCreditsRemaining(rows: CafeCreditRow[], nowMs = Date.now()): number {
  let total = 0;
  let hasUnlimited = false;
  for (const row of rows) {
    if (!isCafeCredit(row) || !isUserCreditActiveNow(row, nowMs)) continue;
    if (row.is_unlimited) {
      hasUnlimited = true;
      break;
    }
    const rem = Number(row.credits_remaining);
    if (Number.isFinite(rem) && rem > 0) total += rem;
  }
  return hasUnlimited ? -1 : total;
}

/** True when the member has an active café package (balance > 0 or unlimited). */
export function hasActiveCafeCredits(rows: CafeCreditRow[], nowMs = Date.now()): boolean {
  return sumCafeCreditsRemaining(rows, nowMs) !== 0;
}

export async function fetchCafeCredits(profileId: string): Promise<CafeCreditRow[]> {
  const { data, error } = await supabase
    .from("user_credits")
    .select("id, product_name, credits_remaining, is_unlimited, expires_at, category")
    .eq("profile_id", profileId);

  if (error) {
    console.error("fetchCafeCredits", error);
    return [];
  }

  return (data ?? [])
    .filter((raw) => isCafeCredit(raw as { category?: string | null }))
    .map((raw) => raw as CafeCreditRow);
}

export async function ensureCafeQrToken(profileId: string): Promise<string | null> {
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("cafe_qr_token")
    .eq("id", profileId)
    .maybeSingle();

  if (readErr) {
    console.error("ensureCafeQrToken read", readErr);
    return null;
  }

  const token = (existing as { cafe_qr_token?: string | null } | null)?.cafe_qr_token;
  if (token) return String(token);

  const newToken = crypto.randomUUID();
  const { data: updated, error: upErr } = await supabase
    .from("profiles")
    .update({ cafe_qr_token: newToken })
    .eq("id", profileId)
    .select("cafe_qr_token")
    .maybeSingle();

  if (upErr) {
    console.error("ensureCafeQrToken update", upErr);
    return newToken;
  }

  return String((updated as { cafe_qr_token?: string } | null)?.cafe_qr_token ?? newToken);
}
