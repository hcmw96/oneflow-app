import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeUpcomingBooking = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  location: string;
  guideName: string | null;
};

type ClassJoin = {
  name: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  guide_name: string | null;
} | null;

function oneClass(raw: ClassJoin | ClassJoin[] | null): ClassJoin {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

/** Confirmed bookings for classes that have not ended yet (matches schedule “booked” rules). */
export async function fetchUpcomingHomeBookings(
  client: SupabaseClient,
  profileId: string,
  options?: { limit?: number; nowMs?: number },
): Promise<HomeUpcomingBooking[]> {
  const limit = options?.limit ?? 10;
  const nowMs = options?.nowMs ?? Date.now();

  const { data, error } = await client
    .from("bookings")
    .select(
      `
      id,
      status,
      classes ( name, starts_at, ends_at, location, guide_name )
    `,
    )
    .eq("profile_id", profileId)
    .in("status", ["confirmed", "attended"]);

  if (error) {
    console.error("fetchUpcomingHomeBookings", error);
    return [];
  }

  const upcoming: HomeUpcomingBooking[] = [];

  for (const row of data ?? []) {
    const raw = row as {
      id: string;
      classes: ClassJoin | ClassJoin[];
    };
    const c = oneClass(raw.classes);
    if (!c?.starts_at || !c.ends_at) continue;
    if (new Date(c.ends_at).getTime() <= nowMs) continue;

    const gn = (c.guide_name ?? "").trim();
    upcoming.push({
      id: raw.id,
      name: (c.name ?? "Class").trim() || "Class",
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      location: (c.location ?? "—").trim() || "—",
      guideName: gn.length > 0 ? gn : null,
    });
  }

  upcoming.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return upcoming.slice(0, limit);
}
