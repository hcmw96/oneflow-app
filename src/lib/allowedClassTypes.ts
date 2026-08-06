/**
 * Canonical studio `class_type` module.
 *
 * MUST stay in sync with the Postgres enum `public.class_type`
 * (yoga, sculpt, wellzone, sauna_journey, power, event, beginner, beginner_sculpt, pilates).
 * Edge functions that cannot import this file duplicate the slug list and carry an explicit
 * sync comment — see `supabase/functions/invite-guide/index.ts` (`DISCIPLINE_SLUGS`).
 *
 * Do not merge with product `credit_category` — that is a separate concept.
 */
import { normalizeProductCategoryKey } from "@/lib/productCategories";

/** Mirrors Postgres `class_type` enum — order need not match DB sortorder. */
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

/** Full enum set (e.g. all_access packages, guide disciplines). */
export const ALL_ALLOWED_CLASS_TYPES: readonly AllowedClassTypeSlug[] = [
  ...ALLOWED_CLASS_TYPE_SLUGS,
];

/**
 * Guide `disciplines` + invite-guide allow-list — full enum.
 * Keep identical to ALLOWED_CLASS_TYPE_SLUGS (and invite-guide DISCIPLINE_SLUGS).
 */
export const GUIDE_DISCIPLINE_SLUGS: readonly AllowedClassTypeSlug[] = [
  ...ALLOWED_CLASS_TYPE_SLUGS,
];

/** Checkbox labels for `guides.disciplines` (display strings). */
export const GUIDE_DISCIPLINE_LABELS: ReadonlyArray<
  (typeof CLASS_TYPE_SLUG_LABEL)[AllowedClassTypeSlug]
> = ALLOWED_CLASS_TYPE_SLUGS.map((slug) => CLASS_TYPE_SLUG_LABEL[slug]);

/**
 * Studio pack / Seeker yoga-side types (excludes Wellzone & Sauna Journey).
 * Shared by product defaults and The Seeker multi-credit rows.
 */
export const SEEKER_YOGA_CLASS_TYPES: readonly AllowedClassTypeSlug[] = [
  "yoga",
  "sculpt",
  "pilates",
  "power",
  "beginner",
  "beginner_sculpt",
  "event",
];

/** Wellzone credit category / sauna reminder branch. */
export const WELLZONE_CLASS_TYPES: readonly AllowedClassTypeSlug[] = [
  "wellzone",
  "sauna_journey",
];

/** Intro classes booked without credits or payment. */
export const FREE_BEGINNER_CLASS_TYPES: readonly AllowedClassTypeSlug[] = [
  "beginner",
  "beginner_sculpt",
];

const FREE_BEGINNER_SET = new Set<string>(FREE_BEGINNER_CLASS_TYPES);
const WELLZONE_SET = new Set<string>(WELLZONE_CLASS_TYPES);

export type ClassTypeTheme = {
  /** Left accent stripe (hex) */
  accent: string;
  /** Subtle card background wash (Tailwind class) */
  tint: string;
};

/**
 * Shared class-card badge (top-right pill) — label only, not colour-coded.
 * Same style for every class type.
 */
export const CLASS_TYPE_BADGE_CLASS =
  "border border-[#c5d4b8] bg-primary-soft text-[#3d4f36]";

/**
 * Theme keyed by slug only (`satisfies` fails compile if an enum slug is missing).
 * Colour differentiation is stripe + tint; badges use CLASS_TYPE_BADGE_CLASS.
 */
export const CLASS_TYPE_THEME_BY_SLUG = {
  yoga: {
    accent: "#7a9a68",
    tint: "bg-[#f4f8f1]",
  },
  sculpt: {
    accent: "#d97706",
    tint: "bg-amber-50",
  },
  pilates: {
    accent: "#7c3aed",
    tint: "bg-violet-50",
  },
  wellzone: {
    accent: "#0284c7",
    tint: "bg-sky-50",
  },
  sauna_journey: {
    accent: "#ea580c",
    tint: "bg-orange-50",
  },
  power: {
    accent: "#44403c",
    tint: "bg-stone-100",
  },
  beginner: {
    accent: "#8fa67d",
    tint: "bg-[#f7faf4]",
  },
  beginner_sculpt: {
    accent: "#e8a54b",
    tint: "bg-[#fff8ed]",
  },
  event: {
    accent: "#9333ea",
    tint: "bg-purple-50",
  },
} as const satisfies Record<AllowedClassTypeSlug, ClassTypeTheme>;

const FALLBACK_THEME: ClassTypeTheme = {
  accent: "#a3b693",
  tint: "bg-muted/40",
};

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

/** Normalize slug or display label → enum slug when known. */
export function resolveClassTypeSlug(
  typeOrSlug: string | null | undefined,
): AllowedClassTypeSlug | null {
  const raw = (typeOrSlug ?? "").trim();
  if (!raw) return null;
  const asSlug = raw.toLowerCase().replace(/\s+/g, "_");
  if (isAllowedClassTypeSlug(asSlug)) return asSlug;
  const lower = raw.toLowerCase();
  for (const slug of ALLOWED_CLASS_TYPE_SLUGS) {
    if (CLASS_TYPE_SLUG_LABEL[slug].toLowerCase() === lower) return slug;
  }
  return null;
}

export function displayClassType(raw: string | null | undefined): string {
  const slug = resolveClassTypeSlug(raw);
  if (slug) return CLASS_TYPE_SLUG_LABEL[slug];
  const key = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (!key) return CLASS_TYPE_SLUG_LABEL.yoga;
  return humanizeClassTypeSlug(key);
}

export function classTypeTheme(typeOrSlug: string | null | undefined): ClassTypeTheme {
  const slug = resolveClassTypeSlug(typeOrSlug);
  if (slug) return CLASS_TYPE_THEME_BY_SLUG[slug];
  return FALLBACK_THEME;
}

/** Shared neutral badge classes for every class type (cards + admin pills). */
export function classTypeBadgeClass(_slug?: string | null): string {
  return CLASS_TYPE_BADGE_CLASS;
}

export const CLASS_TYPE_SLUG_ACCENT: Record<AllowedClassTypeSlug, string> = {
  yoga: CLASS_TYPE_THEME_BY_SLUG.yoga.accent,
  sculpt: CLASS_TYPE_THEME_BY_SLUG.sculpt.accent,
  pilates: CLASS_TYPE_THEME_BY_SLUG.pilates.accent,
  wellzone: CLASS_TYPE_THEME_BY_SLUG.wellzone.accent,
  sauna_journey: CLASS_TYPE_THEME_BY_SLUG.sauna_journey.accent,
  power: CLASS_TYPE_THEME_BY_SLUG.power.accent,
  beginner: CLASS_TYPE_THEME_BY_SLUG.beginner.accent,
  beginner_sculpt: CLASS_TYPE_THEME_BY_SLUG.beginner_sculpt.accent,
  event: CLASS_TYPE_THEME_BY_SLUG.event.accent,
};

/**
 * @deprecated Prefer CLASS_TYPE_THEME_BY_SLUG. Kept for label-keyed callers during Pass 1.
 */
export const CLASS_TYPE_THEME: Record<string, ClassTypeTheme> = Object.fromEntries(
  ALLOWED_CLASS_TYPE_SLUGS.map((slug) => [CLASS_TYPE_SLUG_LABEL[slug], CLASS_TYPE_THEME_BY_SLUG[slug]]),
);

export function allowedClassTypeCheckboxOptions(): {
  value: AllowedClassTypeSlug;
  label: string;
}[] {
  return ALLOWED_CLASS_TYPE_SLUGS.map((slug) => ({
    value: slug,
    label: CLASS_TYPE_SLUG_LABEL[slug],
  }));
}

export function defaultAllowedClassTypesForCreditCategory(
  category: string | null | undefined,
): AllowedClassTypeSlug[] {
  const k = normalizeProductCategoryKey(category);
  if (k === "all_access") return [...ALL_ALLOWED_CLASS_TYPES];
  if (k === "yoga" || k === "power" || k === "mat_towel") return [...SEEKER_YOGA_CLASS_TYPES];
  if (k === "wellzone") return [...WELLZONE_CLASS_TYPES];
  return [...ALL_ALLOWED_CLASS_TYPES];
}

export function userCreditCoversClassType(args: {
  category: string | null | undefined;
  allowed_class_types: string[] | null | undefined;
  classType: string;
}): boolean {
  const cat = normalizeProductCategoryKey(args.category);
  if (cat === "mat_towel" || cat === "cafe") return false;
  if (cat === "all_access") return true;
  const allowed = args.allowed_class_types;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(args.classType);
}

export function isFreeBeginnerClass(classType: string | null | undefined): boolean {
  return FREE_BEGINNER_SET.has(String(classType ?? "").toLowerCase());
}

export function isWellzoneSaunaClassType(classType: string | null | undefined): boolean {
  const s = String(classType ?? "")
    .trim()
    .toLowerCase();
  if (WELLZONE_SET.has(s)) return true;
  // Legacy fuzzy match for free-text / old rows
  return s.includes("sauna");
}

export function bookingConfirmationTemplateForClassType(
  classType: string | null | undefined,
): "booking_confirmation_sauna" | "booking_confirmation_class" {
  return isWellzoneSaunaClassType(classType)
    ? "booking_confirmation_sauna"
    : "booking_confirmation_class";
}
