/** Placeholder values stored in user_credits.yoco_payment_id when no Yoco ID was captured. */
const YOCO_PLACEHOLDER_IDS = new Set([
  "yoco_checkout",
  "manual_assignment",
  "free_intro",
  "manual_component",
]);

/** Yoco checkout ID (ch_…) for cross-reference with Yoco CSV "Online Reference". */
export function yocoCheckoutId(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t || YOCO_PLACEHOLDER_IDS.has(t)) return null;
  return t;
}

export function isRecordedYocoPayment(raw: string | null | undefined): boolean {
  const t = String(raw ?? "").trim();
  return Boolean(t) && !YOCO_PLACEHOLDER_IDS.has(t);
}

export function isYocoCheckoutPlaceholder(raw: string | null | undefined): boolean {
  const t = String(raw ?? "").trim();
  return t === "yoco_checkout";
}
