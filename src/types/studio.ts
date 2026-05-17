import {
  CLASS_TYPE_SLUG_LABEL,
  humanizeClassTypeSlug,
  type AllowedClassTypeSlug,
  isAllowedClassTypeSlug,
} from "@/lib/allowedClassTypes";

/** Display labels for class types (matches TypeBadge styles). */
export type ClassType = (typeof CLASS_TYPE_SLUG_LABEL)[AllowedClassTypeSlug] | string;

export function displayClassType(raw: string | null | undefined): string {
  const key = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (!key) return CLASS_TYPE_SLUG_LABEL.yoga;
  if (isAllowedClassTypeSlug(key)) return CLASS_TYPE_SLUG_LABEL[key];
  return humanizeClassTypeSlug(key);
}

export type ChallengeType = "Yoga" | "Sauna Journey";

export interface ChallengeCheckIn {
  id: string;
  date: Date;
  type: ChallengeType;
  className: string;
}
