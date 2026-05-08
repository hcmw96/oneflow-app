import { supabase } from "@/lib/supabase";

/**
 * After a member checks in, award any classes_attended badges they have earned but not yet
 * received. Runs best-effort — failures are logged but never block the check-in flow.
 */
export async function awardClassesAttendedBadges(profileId: string): Promise<void> {
  if (!profileId) return;
  try {
    const [{ count: attendedCount, error: attendedErr }, badgesRes, ownedRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("status", "attended"),
      supabase
        .from("badges")
        .select("id, criteria_value")
        .eq("criteria_type", "classes_attended")
        .eq("is_active", true),
      supabase.from("member_badges").select("badge_id").eq("profile_id", profileId),
    ]);

    if (attendedErr) {
      console.warn("badges: count attended", attendedErr);
      return;
    }
    if (badgesRes.error) {
      console.warn("badges: list", badgesRes.error);
      return;
    }
    if (ownedRes.error) {
      console.warn("badges: owned", ownedRes.error);
      return;
    }

    const owned = new Set((ownedRes.data ?? []).map((r: { badge_id: string }) => r.badge_id));
    const eligible = (badgesRes.data ?? [])
      .filter((b: { id: string; criteria_value: number | null }) => {
        if (b.criteria_value == null) return false;
        return (attendedCount ?? 0) >= b.criteria_value;
      })
      .filter((b: { id: string }) => !owned.has(b.id));

    if (eligible.length === 0) return;

    const inserts = eligible.map((b: { id: string }) => ({
      profile_id: profileId,
      badge_id: b.id,
      awarded_at: new Date().toISOString(),
    }));

    const { error: insErr } = await supabase.from("member_badges").insert(inserts);
    if (insErr) console.warn("badges: insert", insErr);
  } catch (e) {
    console.warn("badges auto-award failed", e);
  }
}
