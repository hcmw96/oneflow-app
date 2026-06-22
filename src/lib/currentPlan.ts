export type UserCreditPlanRow = {
  product_name: string | null;
  category: string | null;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
  purchased_at?: string | null;
  created_at?: string | null;
  products?: { name: string } | { name: string }[] | null;
};

function productNameFromJoin(products: UserCreditPlanRow["products"]): string | null {
  if (!products) return null;
  const row = Array.isArray(products) ? products[0] : products;
  const name = row?.name?.trim();
  return name || null;
}

export function isActiveUserCredit(c: UserCreditPlanRow, nowMs: number): boolean {
  const exp = c.expires_at;
  if (exp != null && String(exp).trim() !== "") {
    const t = new Date(exp).getTime();
    if (!Number.isNaN(t) && t <= nowMs) return false;
  }
  if (c.is_unlimited) return true;
  const rem = Number(c.credits_remaining);
  return Number.isFinite(rem) && rem > 0;
}

function creditRecencyMs(c: UserCreditPlanRow): number {
  for (const raw of [c.purchased_at, c.created_at]) {
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/** Most recent active credit joined to products.name, or product_name fallback. */
export function currentPlanLabel(
  credits: UserCreditPlanRow[],
  nowMs: number = Date.now(),
): string | null {
  const active = credits.filter((c) => isActiveUserCredit(c, nowMs));
  if (active.length === 0) return null;

  const sorted = [...active].sort((a, b) => creditRecencyMs(b) - creditRecencyMs(a));
  const top = sorted[0];
  const joined = productNameFromJoin(top.products);
  const fallback = top.product_name?.trim();
  return joined || fallback || null;
}
