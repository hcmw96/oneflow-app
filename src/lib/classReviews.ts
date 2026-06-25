import { supabase } from "@/lib/supabase";

const REVIEW_DISMISS_KEY = "oneflow:class-review-dismissed";

export function reviewDismissedForSession(bookingId: string): boolean {
  try {
    const raw = sessionStorage.getItem(REVIEW_DISMISS_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw) as string[];
    return ids.includes(bookingId);
  } catch {
    return false;
  }
}

export const CLASS_REVIEW_FLOW_COMPLETE = "oneflow:class-review-flow-complete";

export type PendingClassReview = {
  bookingId: string;
  classId: string;
  className: string;
  guideName: string | null;
  endsAt: string;
};

/** Most recently ended attended booking without a review. */
export async function fetchPendingClassReview(
  profileId: string,
): Promise<PendingClassReview | null> {
  const nowIso = new Date().toISOString();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      class_id,
      classes ( name, ends_at, guide_name )
    `,
    )
    .eq("profile_id", profileId)
    .eq("status", "attended")
    .order("checked_in_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("fetchPendingClassReview bookings", error);
    return null;
  }

  const candidates: PendingClassReview[] = [];
  for (const row of bookings ?? []) {
    const raw = row as Record<string, unknown>;
    const clsRaw = raw.classes;
    const cls = Array.isArray(clsRaw) ? clsRaw[0] : clsRaw;
    if (!cls || typeof cls !== "object") continue;
    const c = cls as Record<string, unknown>;
    const endsAt = String(c.ends_at ?? "");
    if (!endsAt || endsAt > nowIso) continue;
    candidates.push({
      bookingId: String(raw.id),
      classId: String(raw.class_id),
      className: String(c.name ?? "Class"),
      guideName: typeof c.guide_name === "string" ? c.guide_name : null,
      endsAt,
    });
  }

  if (candidates.length === 0) return null;

  const bookingIds = candidates.map((c) => c.bookingId);
  const { data: reviews, error: revErr } = await supabase
    .from("class_reviews")
    .select("booking_id")
    .in("booking_id", bookingIds);

  if (revErr) {
    console.error("fetchPendingClassReview reviews", revErr);
    return null;
  }

  const reviewed = new Set((reviews ?? []).map((r) => String((r as { booking_id: string }).booking_id)));
  const pending = candidates.find((c) => !reviewed.has(c.bookingId));
  return pending ?? null;
}

export async function submitClassReview(args: {
  bookingId: string;
  classId: string;
  profileId: string;
  rating: number;
  comment?: string;
}): Promise<{ error: string | null }> {
  const rating = Math.round(args.rating);
  if (rating < 1 || rating > 5) {
    return { error: "Please choose a rating from 1 to 5 stars." };
  }

  const { error } = await supabase.from("class_reviews").insert({
    booking_id: args.bookingId,
    profile_id: args.profileId,
    class_id: args.classId,
    rating,
    comment: args.comment?.trim() || null,
  });

  if (error) {
    console.error("submitClassReview", error);
    return { error: error.message };
  }
  return { error: null };
}
