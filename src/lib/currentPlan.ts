export type UserCreditPlanRow = {
  product_name: string | null;
  category: string | null;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
  purchased_at?: string | null;
  created_at?: string | null;
  products?: { name: string; is_addon?: boolean | null } | { name: string; is_addon?: boolean | null }[] | null;
};

function productNameFromJoin(products: UserCreditPlanRow["products"]): string | null {
  if (!products) return null;
  const row = Array.isArray(products) ? products[0] : products;
  const name = row?.name?.trim();
  return name || null;
}

function productIsAddon(c: UserCreditPlanRow): boolean {
  const products = c.products;
  if (!products) return false;
  const row = Array.isArray(products) ? products[0] : products;
  return row?.is_addon === true;
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

function creditDisplayName(c: UserCreditPlanRow): string | null {
  return productNameFromJoin(c.products) || c.product_name?.trim() || null;
}

/** All active credits (including add-ons), main packages first then by recency. */
export function currentPlanLabels(
  credits: UserCreditPlanRow[],
  nowMs: number = Date.now(),
): string[] {
  const active = credits.filter((c) => isActiveUserCredit(c, nowMs));
  if (active.length === 0) return [];

  const sorted = [...active].sort((a, b) => {
    const addonDelta = Number(productIsAddon(a)) - Number(productIsAddon(b));
    if (addonDelta !== 0) return addonDelta;
    return creditRecencyMs(b) - creditRecencyMs(a);
  });

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const credit of sorted) {
    const name = creditDisplayName(credit);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(name);
  }
  return labels;
}

/** Joined label for compact display, e.g. "Drop In · Mat Monthly". */
export function currentPlanLabel(
  credits: UserCreditPlanRow[],
  nowMs: number = Date.now(),
): string | null {
  const labels = currentPlanLabels(credits, nowMs);
  return labels.length > 0 ? labels.join(" · ") : null;
}
