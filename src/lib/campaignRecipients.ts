import { supabase } from "@/lib/supabase";
import { BOOKABLE_MEMBER_OR_FILTER } from "@/lib/bookableMembers";

export type CampaignRecipientFilter =
  | "all"
  | "active"
  | "lapsed"
  | "role"
  | "specific";

export type CampaignRecipientOptions = {
  filter: CampaignRecipientFilter;
  roleValue?: string;
  /** When role is customer, send to one member only. */
  individualProfileId?: string | null;
  /** When filter is specific, send to these profile ids. */
  specificProfileIds?: string[];
};

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

async function emailsForProfileIds(profileIds: string[]): Promise<string[]> {
  if (profileIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .or(BOOKABLE_MEMBER_OR_FILTER)
    .in("id", profileIds);
  if (error) throw error;
  return normalizeEmails((data ?? []) as { email: string | null }[]);
}

/** Resolve campaign recipient emails for the selected filter (no PostgREST embeds). */
export async function fetchCampaignRecipientEmails(
  options: CampaignRecipientOptions,
): Promise<string[]> {
  const { filter, roleValue = "customer", individualProfileId, specificProfileIds = [] } =
    options;

  if (filter === "specific") {
    return emailsForProfileIds(specificProfileIds);
  }

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
    if (role === "customer" && individualProfileId) {
      return emailsForProfileIds([individualProfileId]);
    }
    let query = supabase.from("profiles").select("email").eq("is_active", true);
    if (role === "customer") {
      query = query.or(BOOKABLE_MEMBER_OR_FILTER);
    } else {
      query = query.eq("role", role);
    }
    const { data, error } = await query;
    if (error) throw error;
    return normalizeEmails((data ?? []) as { email: string | null }[]);
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
    return emailsForProfileIds(profileIds);
  }

  if (filter === "lapsed") {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const [{ data: allMembers, error: membersErr }, { data: recentBookings, error: bookingsErr }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, email")
          .or(BOOKABLE_MEMBER_OR_FILTER)
          .eq("is_active", true),
        supabase
          .from("bookings")
          .select("profile_id")
          .gte("created_at", sinceIso)
          .neq("status", "cancelled"),
      ]);
    if (membersErr) throw membersErr;
    if (bookingsErr) throw bookingsErr;

    const activeIds = new Set(
      (recentBookings ?? []).map((r) => String((r as { profile_id: string }).profile_id)),
    );
    const lapsed = (allMembers ?? []).filter(
      (r) => !activeIds.has(String((r as { id: string }).id)),
    );
    return normalizeEmails(lapsed as { email: string | null }[]);
  }

  return [];
}

export type BookableProfilePick = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export async function fetchBookableProfilesForCampaign(): Promise<BookableProfilePick[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .or(BOOKABLE_MEMBER_OR_FILTER)
    .eq("is_active", true)
    .order("first_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BookableProfilePick[];
}
