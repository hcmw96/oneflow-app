import { pickFocusClassId, type LiveClassRow } from "@/lib/liveClassList";

export type CheckInClassRow = LiveClassRow;

/** @deprecated Use pickFocusClassId from @/lib/liveClassList */
export function pickNextUpcomingClassId(
  classes: CheckInClassRow[],
  nowMs: number = Date.now(),
): string | null {
  return pickFocusClassId(classes, nowMs);
}
