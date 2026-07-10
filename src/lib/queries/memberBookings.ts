import { useQuery } from "@tanstack/react-query";
import type { BookedClassInterval } from "@/lib/scheduleBooking";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";

export type MemberBookingClassJoin = {
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  ends_at: string;
  guide_name?: string | null;
};

export type MemberBookingRow = {
  id: string;
  status: string;
  qr_token: string | null;
  created_at: string;
  checked_in_at: string | null;
  class_id: string;
  classes: MemberBookingClassJoin | MemberBookingClassJoin[] | null;
};

function oneClass<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function fetchMemberBookings(profileId: string): Promise<MemberBookingRow[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `id, status, qr_token, created_at, checked_in_at, class_id,
       classes ( name, class_type, location, starts_at, ends_at, guide_name )`,
    )
    .eq("profile_id", profileId)
    .in("status", ["confirmed", "attended"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMemberBookings", error);
    return [];
  }
  return (data ?? []) as MemberBookingRow[];
}

/** Future / in-progress confirmed bookings for schedule overlap checks. */
export function confirmedBookingIntervalsFromRows(
  rows: MemberBookingRow[],
  nowMs: number = Date.now(),
): BookedClassInterval[] {
  const out: BookedClassInterval[] = [];
  for (const row of rows) {
    if (row.status !== "confirmed") continue;
    const cls = oneClass(row.classes);
    if (!cls?.starts_at || !cls.ends_at) continue;
    if (new Date(cls.ends_at).getTime() <= nowMs) continue;
    out.push({
      class_id: row.class_id,
      name: cls.name?.trim() || null,
      starts_at: cls.starts_at,
      ends_at: cls.ends_at,
    });
  }
  return out;
}

export function useMemberBookings(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.memberBookings(userId ?? ""),
    queryFn: () => fetchMemberBookings(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
