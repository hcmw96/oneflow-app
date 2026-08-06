import {
  CLASS_TYPE_SLUG_LABEL,
  displayClassType as displayFromCanonical,
  type AllowedClassTypeSlug,
} from "@/lib/allowedClassTypes";

/** Display labels for class types (matches TypeBadge styles). */
export type ClassType = (typeof CLASS_TYPE_SLUG_LABEL)[AllowedClassTypeSlug] | string;

export function displayClassType(raw: string | null | undefined): string {
  return displayFromCanonical(raw);
}

export type ChallengeType = "Yoga" | "Sauna Journey";

export interface ChallengeCheckIn {
  id: string;
  date: Date;
  type: ChallengeType;
  className: string;
}
