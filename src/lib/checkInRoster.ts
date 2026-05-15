import type { SupabaseClient } from "@supabase/supabase-js";
import { awardClassesAttendedBadges } from "@/lib/badges";
import { deleteMayChallengeCheckInForBooking } from "@/lib/mayChallengeCheckIn";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";

export type BookingStatus = "attended" | "confirmed" | "cancelled" | "no-show";

export type ProfileJoinRow = {
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
};

export type BookingRow = {
  id: string;
  status: string;
  profile_id: string;
  class_id: string;
  qr_token: string | null;
  qr_used?: boolean | null;
  checked_in?: boolean | null;
  payment_method: string | null;
  mat_addon?: boolean | null;
  towel_addon?: boolean | null;
  profiles: ProfileJoinRow | ProfileJoinRow[] | null;
  classes:
    | { id: string; name: string; starts_at: string; guide_name: string | null }
    | { id: string; name: string; starts_at: string; guide_name: string | null }[]
    | null;
};

export type RosterRow = {
  id: string;
  status: BookingStatus;
  member: string;
  profileId: string;
  class_id: string;
  className: string;
  classStartsAt: string;
  startsAtLabel: string;
  creditLabel: string;
  matAddon: boolean;
  towelAddon: boolean;
  hasSageCredit: boolean;
  avatarUrl: string | null;
};

export function oneProfile(p: BookingRow["profiles"]): ProfileJoinRow | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

export function oneClass(c: BookingRow["classes"]) {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

export function rosterInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Normalize mat/towel flags from PostgREST (boolean, 0/1, or legacy string). */
export function rosterAddonTruthy(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "t" || s === "1" || s === "yes";
  }
  return false;
}

export function formatClassTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
}

export function normalizeBooking(raw: BookingRow, sageProfileIds: Set<string>): RosterRow | null {
  const prof = oneProfile(raw.profiles);
  const member =
    prof && `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim()
      ? `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim()
      : "Unknown member";
  const cls = oneClass(raw.classes);
  if (!cls) return null;
  const status = raw.status as BookingStatus;
  if (!["attended", "confirmed", "cancelled", "no-show"].includes(status)) return null;
  const matV = (raw as Record<string, unknown>).mat_addon;
  const towelV = (raw as Record<string, unknown>).towel_addon;
  const matAddon = rosterAddonTruthy(matV);
  const towelAddon = rosterAddonTruthy(towelV);
  const avatarRaw = prof?.avatar_url;
  const avatarUrl = typeof avatarRaw === "string" && avatarRaw.trim() ? avatarRaw.trim() : null;
  return {
    id: raw.id,
    status,
    member,
    profileId: raw.profile_id,
    class_id: raw.class_id,
    className: cls.name,
    classStartsAt: cls.starts_at,
    startsAtLabel: `Today · ${formatClassTime(cls.starts_at)}`,
    creditLabel: raw.payment_method?.replace(/_/g, " ") ?? "—",
    matAddon,
    towelAddon,
    hasSageCredit: sageProfileIds.has(raw.profile_id),
    avatarUrl,
  };
}

export async function patchBookingAttendance(
  client: SupabaseClient,
  args: {
    bookingId: string;
    status: "attended" | "confirmed";
    context: { profileId: string; classStartsAt: string } | null;
  },
): Promise<{ error: string | null }> {
  const { bookingId, status, context } = args;
  const patch =
    status === "attended"
      ? {
          status,
          checked_in: true,
          checked_in_at: new Date().toISOString(),
        }
      : {
          status,
          checked_in: false,
          checked_in_at: null as string | null,
          qr_used: false,
        };
  const { error } = await client.from("bookings").update(patch).eq("id", bookingId);
  if (error) {
    console.error("check-in: booking status update failed", error);
    return { error: supabaseErrorMessage(error, "Could not update booking") };
  }
  if (status === "attended" && context) {
    await client.from("challenge_checkins").insert({
      profile_id: context.profileId,
      class_date: new Date(context.classStartsAt).toISOString().split("T")[0],
      booking_id: bookingId,
    });
    void awardClassesAttendedBadges(context.profileId);
  } else if (status === "confirmed") {
    await deleteMayChallengeCheckInForBooking(bookingId);
  }
  return { error: null };
}
