import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STUDIO_TIMEZONE,
  civilAddDaysYmd,
  dayBoundsForDateKey,
  todayDateKey,
  weekSundayDateKey,
} from "./timezone";

/** Matches `profiles.weekly_goal` DB default. */
export const DEFAULT_WEEKLY_GOAL = 3;

export function clampWeeklyGoal(n: number): number {
  return Math.min(14, Math.max(1, Math.round(n)));
}

export function weeklyGoalFromProfile(raw: number | null | undefined): number {
  return typeof raw === "number" && Number.isFinite(raw)
    ? clampWeeklyGoal(raw)
    : DEFAULT_WEEKLY_GOAL;
}

export type StudioWeekBounds = {
  weekStartIso: string;
  weekEndIso: string;
};

/** Studio week runs Sunday 00:00 → next Sunday 00:00 (Africa/Johannesburg). */
export function studioWeekBounds(
  timeZone: string = STUDIO_TIMEZONE,
): StudioWeekBounds {
  const todayKey = todayDateKey(timeZone);
  const weekSundayKey = weekSundayDateKey(todayKey, timeZone);
  const nextSundayKey = civilAddDaysYmd(weekSundayKey, 7);
  return {
    weekStartIso: dayBoundsForDateKey(weekSundayKey, timeZone).startUtcIso,
    weekEndIso: dayBoundsForDateKey(nextSundayKey, timeZone).startUtcIso,
  };
}

export function classStartsAtInStudioWeek(
  startsAt: string | Date,
  bounds: StudioWeekBounds,
): boolean {
  const t = new Date(startsAt).getTime();
  return (
    t >= new Date(bounds.weekStartIso).getTime() && t < new Date(bounds.weekEndIso).getTime()
  );
}

type BookingWithClass = {
  classes: { starts_at: string } | { starts_at: string }[] | null;
};

function oneClass<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function countAttendedInStudioWeek(
  rows: BookingWithClass[],
  bounds: StudioWeekBounds,
): number {
  let count = 0;
  for (const row of rows) {
    const startsAt = oneClass(row.classes)?.starts_at;
    if (startsAt && classStartsAtInStudioWeek(startsAt, bounds)) count += 1;
  }
  return count;
}

export async function fetchWeeklyGoalProgress(
  client: SupabaseClient,
  profileId: string,
): Promise<{ weeklyGoal: number; weeklyDone: number }> {
  const bounds = studioWeekBounds();
  const [{ data: profile }, { data: bookings, error }] = await Promise.all([
    client.from("profiles").select("weekly_goal").eq("id", profileId).maybeSingle(),
    client
      .from("bookings")
      .select("id, classes ( starts_at )")
      .eq("profile_id", profileId)
      .eq("status", "attended"),
  ]);

  if (error) console.error("fetchWeeklyGoalProgress", error);

  return {
    weeklyGoal: weeklyGoalFromProfile(
      (profile as { weekly_goal?: number | null } | null)?.weekly_goal,
    ),
    weeklyDone: countAttendedInStudioWeek((bookings ?? []) as BookingWithClass[], bounds),
  };
}
