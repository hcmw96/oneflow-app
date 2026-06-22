import { supabase } from "@/lib/supabase";
import { BOOKABLE_MEMBER_OR_FILTER } from "@/lib/bookableMembers";

export type CampaignRecipientFilter = "all" | "active" | "with_credits" | "role";

function normalizeEmails(rows: { email: string | null }[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (email && email.includes("@")) out.add(email);
  }
  return [...out];
}

function isActiveCreditRow(row: {
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
}): boolean {
  if (row.expires_at) {
    const t = new Date(row.expires_at).getTime();
    if (Number.isFinite(t) && t <= Date.now()) return false;
  }
  if (row.is_unlimited) return true;
  const rem = Number(row.credits_remaining);
  return Number.isFinite(rem) && rem > 0;
}

/** Resolve campaign recipient emails for the selected filter (no PostgREST embeds). */
export async function fetchCampaignRecipientEmails(
  filter: CampaignRecipientFilter,
  roleValue: string,
): Promise<string[]> {
  if (filter === "all") {
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .or(BOOKABLE_MEMBER_OR_FILTER)
      .eq("is_active", true);
    if (error) throw error;
    return normalizeEmails((data ?? []) as { email: string | null }[]);
  }

  if (filter === "role") {
    const role = roleValue.trim() || "customer";
    let query = supabase.from("profiles").select("email");
    if (role === "customer") {
      query = query.or(BOOKABLE_MEMBER_OR_FILTER);
    } else {
      query = query.eq("role", role);
    }
    const { data, error } = await query;
    if (error) throw error;
    return normalizeEmails((data ?? []) as { email: string | null }[]);
  }

  if (filter === "with_credits") {
    const { data: creditRows, error: creditsErr } = await supabase
      .from("user_credits")
      .select("profile_id, credits_remaining, is_unlimited, expires_at");
    if (creditsErr) throw creditsErr;

    const profileIds = [
      ...new Set(
        (creditRows ?? [])
          .filter((r) => isActiveCreditRow(r as Parameters<typeof isActiveCreditRow>[0]))
          .map((r) => String((r as { profile_id: string }).profile_id))
          .filter(Boolean),
      ),
    ];
    if (profileIds.length === 0) return [];

    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("email")
      .or(BOOKABLE_MEMBER_OR_FILTER)
      .in("id", profileIds);
    if (profilesErr) throw profilesErr;
    return normalizeEmails((profiles ?? []) as { email: string | null }[]);
  }

  if (filter === "active") {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: bookingRows, error: bookingsErr } = await supabase
      .from("bookings")
      .select("profile_id")
      .gte("created_at", since.toISOString())
      .neq("status", "cancelled");
    if (bookingsErr) throw bookingsErr;

    const profileIds = [
      ...new Set(
        (bookingRows ?? [])
          .map((r) => String((r as { profile_id: string }).profile_id))
          .filter(Boolean),
      ),
    ];
    if (profileIds.length === 0) return [];

    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("email")
      .or(BOOKABLE_MEMBER_OR_FILTER)
      .in("id", profileIds);
    if (profilesErr) throw profilesErr;
    return normalizeEmails((profiles ?? []) as { email: string | null }[]);
  }

  return [];
}
