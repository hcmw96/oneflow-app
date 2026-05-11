/**
 * `flow_points_conversion_rate` in studio_settings: rand discount per 100 points (default 10 → 100 pts = R10).
 */
export function parseFlowPointsConversionRate(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export function discountZarFromPoints(points: number, ratePer100Points: number): number {
  return (Math.max(0, points) * ratePer100Points) / 100;
}

/** Max Flow Points redemption for a product price (ZAR), after any promo is applied on the server; client uses same for display. */
export function maxPackFlowPointsRedemption(
  balance: number,
  priceZar: number,
  ratePer100Points: number,
): { flow_points_used: number; flow_points_discount_zar: number } {
  const price = Math.max(0, Number(priceZar) || 0);
  const bal = Math.max(0, Math.floor(Number(balance) || 0));
  if (bal === 0 || price === 0) return { flow_points_used: 0, flow_points_discount_zar: 0 };

  const maxZar = Math.min(discountZarFromPoints(bal, ratePer100Points), price);
  const flow_points_used = Math.floor((maxZar * 100) / ratePer100Points);
  const flow_points_discount_zar =
    Math.round(((flow_points_used * ratePer100Points) / 100) * 100) / 100;
  return { flow_points_used, flow_points_discount_zar };
}

export function estimatedRandValueFromPoints(balance: number, ratePer100Points: number): number {
  return Math.round(discountZarFromPoints(Math.max(0, balance), ratePer100Points) * 100) / 100;
}
