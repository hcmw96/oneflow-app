import { supabase } from "@/lib/supabase";

/** May 2026 challenge stamps: written when a booking is marked attended (admin QR / manual / walk-in). */

const MAY_START = "2026-05-01";
const MAY_END = "2026-05-31";

/** Calendar date string YYYY-MM-DD in UTC from class start (matches admin check-in behaviour). */
export function classDateFromStartsAtIso(startsAtIso: string): string {
  return new Date(startsAtIso).toISOString().split("T")[0] ?? "";
}

function isMay2026ClassDate(dateStr: string): boolean {
  return dateStr >= MAY_START && dateStr <= MAY_END;
}

/**
 * Record a May 2026 challenge stamp when a booking is marked attended (desk QR or manual).
 * Idempotent per (profile_id, class_date) via upsert.
 */
export async function upsertMayChallengeCheckIn(input: {
  profileId: string;
  bookingId: string;
  classStartsAtIso: string;
}): Promise<void> {
  const classDate = classDateFromStartsAtIso(input.classStartsAtIso);
  if (!classDate || !isMay2026ClassDate(classDate)) return;

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

/** Distinct May calendar days (1–31) the member has at least one challenge stamp for. */
export async function countMayChallengeStampedDays(profileId: string): Promise<number> {
  const { data, error } = await supabase
    .from("challenge_checkins")
    .select("class_date")
    .eq("profile_id", profileId)
    .gte("class_date", MAY_START)
    .lte("class_date", MAY_END);

  if (error) {
    console.error("challenge_checkins count", error);
    return 0;
  }

  const days = new Set<number>();
  for (const row of data ?? []) {
    const raw = (row as { class_date?: string }).class_date;
    if (typeof raw !== "string" || raw.length < 10) continue;
    const d = Number(raw.slice(8, 10));
    if (Number.isFinite(d) && d >= 1 && d <= 31) days.add(d);
  }
  return days.size;
}
