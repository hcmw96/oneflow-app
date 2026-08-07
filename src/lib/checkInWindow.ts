import { isWellzoneSaunaClassType } from "@/lib/allowedClassTypes";

export { isWellzoneSaunaClassType };

/** Late check-in grace after class start — Wellzone & Sauna Journey only. */
export const WELLZONE_LATE_CHECKIN_MINUTES = 30;

/** QR / roster check-in opens this many minutes before class start. */
export const DEFAULT_CHECKIN_OPEN_MINUTES_BEFORE = 120;

export function parseCheckinOpenMinutesBefore(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CHECKIN_OPEN_MINUTES_BEFORE;
  return Math.min(180, Math.round(n));
}

export type CheckInWindowResult = {
  opensAtMs: number;
  closesAtMs: number;
  allowed: boolean;
  reason?: string;
};

/** Whether check-in is allowed at `now` for this class type and start time. */
export function checkInWindowAt(
  classStartsAtIso: string,
  classType: string | null | undefined,
  openMinutesBefore: number = DEFAULT_CHECKIN_OPEN_MINUTES_BEFORE,
  nowMs: number = Date.now(),
): CheckInWindowResult {
  const startMs = new Date(classStartsAtIso).getTime();
  if (!Number.isFinite(startMs)) {
    return { opensAtMs: 0, closesAtMs: 0, allowed: false, reason: "Invalid class time." };
  }

  const openMs = Math.max(0, openMinutesBefore) * 60_000;
  const lateMs = isWellzoneSaunaClassType(classType)
    ? WELLZONE_LATE_CHECKIN_MINUTES * 60_000
    : 0;

  const opensAtMs = startMs - openMs;
  const closesAtMs = startMs + lateMs;

  if (nowMs < opensAtMs) {
    return {
      opensAtMs,
      closesAtMs,
      allowed: false,
      reason: `Check-in opens ${openMinutesBefore} minutes before class.`,
    };
  }

  if (nowMs > closesAtMs) {
    return {
      opensAtMs,
      closesAtMs,
      allowed: false,
      reason: isWellzoneSaunaClassType(classType)
        ? "Check-in closed — the 30-minute window after class start has passed."
        : "Check-in is only available until class start time.",
    };
  }

  return { opensAtMs, closesAtMs, allowed: true };
}

/** Whether check-in actions are allowed right now (not used to hide the day roster). */
export function classVisibleOnCheckInRoster(
  classStartsAtIso: string,
  classType: string | null | undefined,
  openMinutesBefore: number = DEFAULT_CHECKIN_OPEN_MINUTES_BEFORE,
  nowMs: number = Date.now(),
): boolean {
  return checkInWindowAt(classStartsAtIso, classType, openMinutesBefore, nowMs).allowed;
}
