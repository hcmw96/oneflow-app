import { reviewDismissed } from "@/lib/classReviews";
import { supabase } from "@/lib/supabase";

const SHARE_DISMISS_KEY = "oneflow:practice-share-dismissed";
const SHARE_DONE_KEY = "oneflow:practice-share-done";

/** Only prompt for classes that ended within this window. */
const PROMPT_WINDOW_MS = 48 * 60 * 60 * 1000;

export type PendingPracticeShare = {
  bookingId: string;
  className: string;
  guideName: string | null;
  startsAt: string;
  endsAt: string;
};

export function shareDismissedForSession(bookingId: string): boolean {
  try {
    const raw = sessionStorage.getItem(SHARE_DISMISS_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw) as string[];
    return ids.includes(bookingId);
  } catch {
    return false;
  }
}

export function dismissShareForSession(bookingId: string): void {
  try {
    const raw = sessionStorage.getItem(SHARE_DISMISS_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!ids.includes(bookingId)) ids.push(bookingId);
    sessionStorage.setItem(SHARE_DISMISS_KEY, JSON.stringify(ids.slice(-30)));
  } catch {
    /* ignore */
  }
}

export function markShareCompletedForSession(bookingId: string): void {
  dismissShareForSession(bookingId);
  try {
    const raw = sessionStorage.getItem(SHARE_DONE_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!ids.includes(bookingId)) ids.push(bookingId);
    sessionStorage.setItem(SHARE_DONE_KEY, JSON.stringify(ids.slice(-30)));
  } catch {
    /* ignore */
  }
}

/** Most recently ended attended booking eligible for a story-share prompt. */
export async function fetchPendingPracticeShare(
  profileId: string,
): Promise<PendingPracticeShare | null> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      classes ( name, starts_at, ends_at, guide_name )
    `,
    )
    .eq("profile_id", profileId)
    .eq("status", "attended")
    .order("checked_in_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("fetchPendingPracticeShare bookings", error);
    return null;
  }

  for (const row of bookings ?? []) {
    const raw = row as Record<string, unknown>;
    const bookingId = String(raw.id);
    if (shareDismissedForSession(bookingId)) continue;

    const clsRaw = raw.classes;
    const cls = Array.isArray(clsRaw) ? clsRaw[0] : clsRaw;
    if (!cls || typeof cls !== "object") continue;
    const c = cls as Record<string, unknown>;
    const endsAt = String(c.ends_at ?? "");
    const startsAt = String(c.starts_at ?? "");
    if (!endsAt || endsAt > nowIso) continue;

    const endedMs = new Date(endsAt).getTime();
    if (nowMs - endedMs > PROMPT_WINDOW_MS) continue;

    const { data: reviewRow } = await supabase
      .from("class_reviews")
      .select("id")
      .eq("booking_id", bookingId)
      .maybeSingle();

    const reviewPending = !reviewRow && !reviewDismissed(bookingId);
    if (reviewPending) continue;

    return {
      bookingId,
      className: String(c.name ?? "Class"),
      guideName: typeof c.guide_name === "string" ? c.guide_name : null,
      startsAt,
      endsAt,
    };
  }

  return null;
}
