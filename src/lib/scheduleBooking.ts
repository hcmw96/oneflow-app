import { startOfDay } from "@/lib/format";

/** Minutes after class start before it is treated as past (no new bookings). */
export const CLASS_BOOKING_GRACE_MS = 15 * 60 * 1000;

export function isPastScheduleDay(day: Date, now = new Date()): boolean {
  return startOfDay(day).getTime() < startOfDay(now).getTime();
}

export function isPastScheduleClass(
  startsAt: string | Date,
  nowMs: number = Date.now(),
  graceMs: number = CLASS_BOOKING_GRACE_MS,
): boolean {
  return new Date(startsAt).getTime() <= nowMs - graceMs;
}
