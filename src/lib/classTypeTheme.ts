/**
 * Central class-type colours for schedule, bookings, and detail views.
 * Keys are display labels from `displayClassType()` / ClassType.
 */

export type ClassTypeTheme = {
  /** Solid tag background */
  tagBg: string;
  /** Tag text */
  tagText: string;
  /** Subtle card left accent */
  accent: string;
  /** Very light card tint (optional) */
  tint: string;
};

/** Distinct hues per studio class type — keep consistent across the app. */
export const CLASS_TYPE_THEME: Record<string, ClassTypeTheme> = {
  Yoga: {
    tagBg: "bg-[#d4e4c8]",
    tagText: "text-[#2f3f28]",
    accent: "#7a9a68",
    tint: "bg-[#f4f8f1]",
  },
  Sculpt: {
    tagBg: "bg-amber-200",
    tagText: "text-amber-950",
    accent: "#d97706",
    tint: "bg-amber-50",
  },
  Power: {
    tagBg: "bg-stone-800",
    tagText: "text-stone-50",
    accent: "#44403c",
    tint: "bg-stone-100",
  },
  Wellzone: {
    tagBg: "bg-sky-200",
    tagText: "text-sky-950",
    accent: "#0284c7",
    tint: "bg-sky-50",
  },
  "Sauna Journey": {
    tagBg: "bg-orange-200",
    tagText: "text-orange-950",
    accent: "#ea580c",
    tint: "bg-orange-50",
  },
  Beginner: {
    tagBg: "bg-emerald-200",
    tagText: "text-emerald-950",
    accent: "#059669",
    tint: "bg-emerald-50",
  },
  "Beginner sculpt": {
    tagBg: "bg-teal-200",
    tagText: "text-teal-950",
    accent: "#0d9488",
    tint: "bg-teal-50",
  },
  Event: {
    tagBg: "bg-purple-200",
    tagText: "text-purple-950",
    accent: "#9333ea",
    tint: "bg-purple-50",
  },
  Pilates: {
    tagBg: "bg-violet-200",
    tagText: "text-violet-950",
    accent: "#7c3aed",
    tint: "bg-violet-50",
  },
};

const FALLBACK: ClassTypeTheme = {
  tagBg: "bg-muted",
  tagText: "text-foreground",
  accent: "#a3b693",
  tint: "bg-muted/40",
};

/** Theme by display label (e.g. "Yoga") or raw slug (e.g. "yoga"). */
export function classTypeTheme(typeOrSlug: string | null | undefined): ClassTypeTheme {
  const raw = (typeOrSlug ?? "").trim();
  if (!raw) return FALLBACK;
  if (CLASS_TYPE_THEME[raw]) return CLASS_TYPE_THEME[raw];
  // Title-case slug: sauna_journey → Sauna Journey handled by callers via displayClassType.
  const spaced = raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return CLASS_TYPE_THEME[spaced] ?? FALLBACK;
}

/** Slug → accent for admin maps that key by enum slug. */
export const CLASS_TYPE_SLUG_ACCENT: Record<string, string> = {
  yoga: CLASS_TYPE_THEME.Yoga.accent,
  sculpt: CLASS_TYPE_THEME.Sculpt.accent,
  power: CLASS_TYPE_THEME.Power.accent,
  wellzone: CLASS_TYPE_THEME.Wellzone.accent,
  sauna_journey: CLASS_TYPE_THEME["Sauna Journey"].accent,
  beginner: CLASS_TYPE_THEME.Beginner.accent,
  beginner_sculpt: CLASS_TYPE_THEME["Beginner sculpt"].accent,
  event: CLASS_TYPE_THEME.Event.accent,
  pilates: CLASS_TYPE_THEME.Pilates.accent,
};
