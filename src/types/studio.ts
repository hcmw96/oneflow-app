import {
  CLASS_TYPE_SLUG_LABEL,
  type AllowedClassTypeSlug,
  isAllowedClassTypeSlug,
} from "@/lib/allowedClassTypes";

/** Display labels for class types (matches TypeBadge styles). */
export type ClassType =
  | (typeof CLASS_TYPE_SLUG_LABEL)[AllowedClassTypeSlug]
  /** Legacy DB rows */
  | "Pilates";

const LEGACY_SLUG_TO_DISPLAY: Record<string, ClassType> = {
  pilates: "Pilates",
};

export function displayClassType(raw: string | null | undefined): ClassType {
  const key = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (isAllowedClassTypeSlug(key)) return CLASS_TYPE_SLUG_LABEL[key];
  return LEGACY_SLUG_TO_DISPLAY[key] ?? "Yoga";
}

export type ChallengeType = "Yoga" | "Sauna Journey";

export interface ChallengeCheckIn {
  id: string;
  date: Date;
  type: ChallengeType;
  className: string;
}
