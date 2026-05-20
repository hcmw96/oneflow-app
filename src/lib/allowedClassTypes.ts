/**
 * Canonical `allowed_class_types` / `classes.class_type` slugs (Postgres enum).
 * Keep in sync with DB migrations.
 */
import { normalizeProductCategoryKey } from "@/lib/productCategories";

export const ALLOWED_CLASS_TYPE_SLUGS = [
  "yoga",
  "sculpt",
  "pilates",
  "wellzone",
  "sauna_journey",
  "power",
  "beginner",
  "beginner_sculpt",
  "event",
] as const;

export type AllowedClassTypeSlug = (typeof ALLOWED_CLASS_TYPE_SLUGS)[number];

export const CLASS_TYPE_SLUG_LABEL: Record<AllowedClassTypeSlug, string> = {
  yoga: "Yoga",
  sculpt: "Sculpt",
  pilates: "Pilates",
  wellzone: "Wellzone",
  sauna_journey: "Sauna Journey",
  power: "Power",
  beginner: "Beginner",
  beginner_sculpt: "Beginner sculpt",
  event: "Event",
};

/** Checkbox labels for `guides.disciplines` (same strings as class type labels). */
export const GUIDE_DISCIPLINE_LABELS: ReadonlyArray<
  (typeof CLASS_TYPE_SLUG_LABEL)[AllowedClassTypeSlug]
> = ALLOWED_CLASS_TYPE_SLUGS.map((slug) => CLASS_TYPE_SLUG_LABEL[slug]);

/** Full enum set (e.g. all_access packages). */
export const ALL_ALLOWED_CLASS_TYPES: readonly AllowedClassTypeSlug[] = [
  ...ALLOWED_CLASS_TYPE_SLUGS,
];

/** Default `allowed_class_types` when assigning / configuring by credit category. */
const DEFAULTS_YOGA_STUDIO: readonly AllowedClassTypeSlug[] = [
  "yoga",
  "sculpt",
  "pilates",
  "power",
  "beginner",
  "beginner_sculpt",
  "event",
];

const DEFAULTS_WELLZONE: readonly AllowedClassTypeSlug[] = ["wellzone", "sauna_journey"];

/** Checkbox / select options in slug order. */
export function allowedClassTypeCheckboxOptions(): {
  value: AllowedClassTypeSlug;
  label: string;
}[] {
  return ALLOWED_CLASS_TYPE_SLUGS.map((slug) => ({
    value: slug,
    label: CLASS_TYPE_SLUG_LABEL[slug],
  }));
}

/**
 * Default allowed class types for a product / credit `category` when none are stored.
 * `all_access`, `yoga`, and `wellzone` match business rules; `power` follows yoga studio set;
 * other categories default to the full enum so staff can narrow in the editor.
 */
export function defaultAllowedClassTypesForCreditCategory(
  category: string | null | undefined,
): AllowedClassTypeSlug[] {
  const k = normalizeProductCategoryKey(category);
  if (k === "all_access") return [...ALL_ALLOWED_CLASS_TYPES];
  if (k === "yoga" || k === "power") return [...DEFAULTS_YOGA_STUDIO];
  if (k === "wellzone") return [...DEFAULTS_WELLZONE];
  return [...ALL_ALLOWED_CLASS_TYPES];
}

/**
 * Booking / scheduling: whether a `user_credits` row may pay for a class with this `classes.class_type`.
 * Café credits are excluded by the caller.
 *
 * All Access must cover every studio class type even when `allowed_class_types` was saved from an
 * older product definition that omitted newer types (e.g. Pilates).
 */
export function userCreditCoversClassType(args: {
  category: string | null | undefined;
  allowed_class_types: string[] | null | undefined;
  classType: string;
}): boolean {
  const cat = normalizeProductCategoryKey(args.category);
  if (cat === "all_access") return true;
  const allowed = args.allowed_class_types;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(args.classType);
}

export function isAllowedClassTypeSlug(value: string): value is AllowedClassTypeSlug {
  return (ALLOWED_CLASS_TYPE_SLUGS as readonly string[]).includes(value);
}

export function humanizeClassTypeSlug(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
