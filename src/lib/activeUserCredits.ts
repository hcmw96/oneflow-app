import { supabase } from "@/lib/supabase";

/** Active credits for roster / guide package pills (matches booking “usable” rules). */

export type UserCreditPillSource = {
  product_name: string | null;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
};

export function isUserCreditActiveNow(c: UserCreditPillSource, nowMs = Date.now()): boolean {
  if (c.expires_at) {
    const t = new Date(c.expires_at).getTime();
    if (Number.isFinite(t) && t <= nowMs) return false;
  }
  if (c.is_unlimited) return true;
  const rem = Number(c.credits_remaining);
  return Number.isFinite(rem) && rem > 0;
}

/** Short label for sage/grey pills: unlimited name, or "Product · N credits". */
export function userCreditPillLabel(c: UserCreditPillSource): string {
  const pn = (c.product_name ?? "").trim();
  if (c.is_unlimited) {
    return pn || "Unlimited";
  }
  const rem = Math.max(0, Math.round(Number(c.credits_remaining ?? 0)));
  const base = pn || "Package";
  return `${base} · ${rem} credit${rem === 1 ? "" : "s"}`;
}

export type GuideCreditPillRow = UserCreditPillSource & { id: string; profile_id: string };

/** Loads credits for many profiles in one round-trip; returns only currently active rows per profile. */
export async function fetchActiveUserCreditsByProfileIds(
  profileIds: readonly string[],
): Promise<Map<string, GuideCreditPillRow[]>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  const map = new Map<string, GuideCreditPillRow[]>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("user_credits")
    .select("id, profile_id, product_name, credits_remaining, is_unlimited, expires_at")
    .in("profile_id", ids);

  if (error) {
    console.error("fetchActiveUserCreditsByProfileIds", error);
    return map;
  }

  for (const raw of data ?? []) {
    const row = raw as GuideCreditPillRow;
    if (!row.profile_id || !isUserCreditActiveNow(row)) continue;
    const list = map.get(row.profile_id) ?? [];
    list.push(row);
    map.set(row.profile_id, list);
  }
  return map;
}
