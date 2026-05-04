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
    { onConflict: "profile_id,class_date" },
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
