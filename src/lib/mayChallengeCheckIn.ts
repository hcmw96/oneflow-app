import { supabase } from "@/lib/supabase";
import {
  dayIndexInChallenge,
  fetchMovementChallengeConfig,
  isClassDateInChallenge,
  movementChallengeTotalDays,
  type MovementChallengeConfig,
} from "@/lib/movementChallenge";

/** Challenge stamps: written when a booking is marked attended (admin QR / manual / walk-in). */

/** Calendar date string YYYY-MM-DD in UTC from class start (matches admin check-in behaviour). */
export function classDateFromStartsAtIso(startsAtIso: string): string {
  return new Date(startsAtIso).toISOString().split("T")[0] ?? "";
}

/**
 * Record a challenge stamp when a booking is marked attended (desk QR or manual).
 * Idempotent per booking via upsert on booking_id.
 */
export async function upsertMayChallengeCheckIn(input: {
  profileId: string;
  bookingId: string;
  classStartsAtIso: string;
}): Promise<void> {
  const config = await fetchMovementChallengeConfig();
  if (!config.enabled) return;

  const classDate = classDateFromStartsAtIso(input.classStartsAtIso);
  if (!classDate || !isClassDateInChallenge(classDate, config)) return;

  const { error } = await supabase.from("challenge_checkins").upsert(
    {
      profile_id: input.profileId,
      class_date: classDate,
      booking_id: input.bookingId,
    },
    { onConflict: "booking_id" },
  );

  if (error) {
    console.error("challenge_checkins upsert", error);
  }
}

/** Remove stamp when undoing check-in for that booking’s day. */
export async function deleteMayChallengeCheckInForBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.from("challenge_checkins").delete().eq("booking_id", bookingId);
  if (error) {
    console.error("challenge_checkins delete", error);
  }
}

/** Distinct challenge calendar days the member has at least one stamp for. */
export async function countMayChallengeStampedDays(profileId: string): Promise<number> {
  const config = await fetchMovementChallengeConfig();
  if (!config.enabled) return 0;

  const { data, error } = await supabase
    .from("challenge_checkins")
    .select("class_date")
    .eq("profile_id", profileId)
    .gte("class_date", config.start_date)
    .lte("class_date", config.end_date);

  if (error) {
    console.error("challenge_checkins count", error);
    return 0;
  }

  const total = movementChallengeTotalDays(config);
  const days = new Set<number>();
  for (const row of data ?? []) {
    const raw = (row as { class_date?: string }).class_date;
    if (typeof raw !== "string") continue;
    const idx = dayIndexInChallenge(raw, config);
    if (idx != null && idx >= 1 && idx <= total) days.add(idx);
  }
  return days.size;
}

export async function countChallengeStampedDaysForConfig(
  profileId: string,
  config: MovementChallengeConfig,
): Promise<number> {
  if (!config.enabled) return 0;

  const { data, error } = await supabase
    .from("challenge_checkins")
    .select("class_date")
    .eq("profile_id", profileId)
    .gte("class_date", config.start_date)
    .lte("class_date", config.end_date);

  if (error) {
    console.error("challenge_checkins count", error);
    return 0;
  }

  const total = movementChallengeTotalDays(config);
  const days = new Set<number>();
  for (const row of data ?? []) {
    const raw = (row as { class_date?: string }).class_date;
    if (typeof raw !== "string") continue;
    const idx = dayIndexInChallenge(raw, config);
    if (idx != null && idx >= 1 && idx <= total) days.add(idx);
  }
  return days.size;
}
