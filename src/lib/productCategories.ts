/**
 * Canonical product category grouping for admin UI, assign-package dialog,
 * revenue charts, and list ordering.
 *
 * DB `products.category` / `user_credits.category`: lowercase slugs
 * (yoga, wellzone, all_access, power, cafe, complimentary, staff).
 */

export const PRODUCT_DISPLAY_GROUPS: readonly {
  readonly keys: readonly string[];
  readonly label: string;
}[] = [
  { keys: ["yoga"], label: "Yoga & Studio Classes" },
  { keys: ["wellzone"], label: "Wellzone & Sauna" },
  { keys: ["all_access"], label: "All Access" },
  { keys: ["power"], label: "Power" },
  { keys: ["cafe"], label: "Café" },
  { keys: ["complimentary"], label: "Complimentary" },
  { keys: ["staff"], label: "Staff" },
  { keys: ["other"], label: "Other" },
] as const;

const ASSIGN_CATEGORY_KEYS = new Set(
  PRODUCT_DISPLAY_GROUPS.flatMap((g) => g.keys).filter((k) => k !== "other"),
);

/** Known DB slugs in display order (excludes "other"). */
export const CREDIT_CATEGORY_ORDERED = [
  "yoga",
  "wellzone",
  "all_access",
  "power",
  "cafe",
  "complimentary",
  "staff",
] as const;

export type CreditCategoryOrdered = (typeof CREDIT_CATEGORY_ORDERED)[number];

/** Short label for table badges / form (not section headers). */
export const PRODUCT_CATEGORY_SLUG_LABEL: Record<string, string> = {
  yoga: "Yoga",
  wellzone: "Wellzone",
  all_access: "All Access",
  power: "Power",
  cafe: "Café",
  complimentary: "Complimentary",
  staff: "Staff",
  other: "Other",
};

export function normalizeProductCategoryKey(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return "other";
  if (ASSIGN_CATEGORY_KEYS.has(s)) return s;
  return "other";
}

export function productCategorySlugLabel(cat: string | null | undefined): string {
  const k = normalizeProductCategoryKey(cat);
  return PRODUCT_CATEGORY_SLUG_LABEL[k] ?? (String(cat ?? "").trim() || "—");
}

/** Revenue / chart bucket: one bar per display group label, or "Other". */
export function revenueChartLabelForCategories(
  rowCategory: string | null | undefined,
  productCategory: string | null | undefined,
): string {
  const k = normalizeProductCategoryKey(rowCategory ?? productCategory);
  const g = PRODUCT_DISPLAY_GROUPS.find((x) => x.keys.includes(k));
  return g?.label ?? "Other";
}

export type ProductDisplaySection<T> = { label: string; items: T[] };

export function groupProductsByDisplayCategory<T extends { name: string; category?: string | null }>(
  items: readonly T[],
  sortWithinGroup: (a: T, b: T) => number,
): ProductDisplaySection<T>[] {
  const bucket = new Map<string, T[]>();
  for (const k of PRODUCT_DISPLAY_GROUPS.flatMap((g) => g.keys)) {
    bucket.set(k, []);
  }
  for (const p of items) {
    const key = normalizeProductCategoryKey(p.category);
    const list = bucket.get(key) ?? bucket.get("other");
    if (list) list.push(p);
  }

  const out: ProductDisplaySection<T>[] = [];
  for (const g of PRODUCT_DISPLAY_GROUPS) {
    const itemsInSection = g.keys.flatMap((k) => bucket.get(k) ?? []);
    if (itemsInSection.length === 0) continue;
    out.push({
      label: g.label,
      items: [...itemsInSection].sort(sortWithinGroup),
    });
  }
  return out;
}
