/**
 * Re-exports from the canonical module (`allowedClassTypes.ts`).
 * Prefer importing theme helpers from `@/lib/allowedClassTypes` going forward.
 */
export {
  CLASS_TYPE_THEME,
  CLASS_TYPE_THEME_BY_SLUG,
  CLASS_TYPE_SLUG_ACCENT,
  CLASS_TYPE_BADGE_CLASS,
  classTypeTheme,
  classTypeBadgeClass,
  type ClassTypeTheme,
} from "@/lib/allowedClassTypes";
