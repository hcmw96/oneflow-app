/** Display labels for class types (matches TypeBadge styles). */
export type ClassType = "Yoga" | "Sculpt" | "Power" | "Wellzone" | "Sauna Journey";

const DB_TO_DISPLAY: Record<string, ClassType> = {
  yoga: "Yoga",
  sculpt: "Sculpt",
  power: "Power",
  wellzone: "Wellzone",
  sauna_journey: "Sauna Journey",
};

export function displayClassType(raw: string | null | undefined): ClassType {
  const key = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  return DB_TO_DISPLAY[key] ?? "Yoga";
}

export type ChallengeType = "Yoga" | "Sauna Journey";

export interface ChallengeCheckIn {
  id: string;
  date: Date;
  type: ChallengeType;
  className: string;
}
