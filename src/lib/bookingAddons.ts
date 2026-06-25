/** Per-class mat/towel hire at booking time (not monthly subscription products). */

export type BookingHireAddon = {
  id: string;
  name: string;
  price_zar: number;
  kind: "mat" | "towel";
};

export function isPerClassHireProductName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n.includes("hire")) return false;
  if (n.includes("monthly")) return false;
  return true;
}

/** Mat-only or towel-only hire SKU from product name. */
export function perClassHireKindFromName(name: string): "mat" | "towel" | null {
  if (!isPerClassHireProductName(name)) return null;
  const n = name.trim().toLowerCase();
  const hasMat = n.includes("mat");
  const hasTowel = n.includes("towel");
  if (hasMat && !hasTowel) return "mat";
  if (hasTowel && !hasMat) return "towel";
  return null;
}

export function pickPerClassHireAddons(
  products: readonly { id: string; name: string; price_zar: number }[],
): { mat: BookingHireAddon | null; towel: BookingHireAddon | null } {
  let mat: BookingHireAddon | null = null;
  let towel: BookingHireAddon | null = null;
  for (const p of products) {
    const kind = perClassHireKindFromName(p.name);
    if (!kind) continue;
    const row: BookingHireAddon = {
      id: p.id,
      name: p.name,
      price_zar: Number(p.price_zar),
      kind,
    };
    if (kind === "mat" && !mat) mat = row;
    if (kind === "towel" && !towel) towel = row;
  }
  return { mat, towel };
}

export function formatHireAddonPrice(zar: number): string {
  const n = Number(zar);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
