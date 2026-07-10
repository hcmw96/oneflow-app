import { useQuery } from "@tanstack/react-query";
import { BOOKABLE_MEMBER_OR_FILTER } from "@/lib/bookableMembers";
import { jhbDayBounds } from "@/lib/jhbTime";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";

export type AdminDashboardClassRow = {
  id: string;
  name: string;
  starts_at: string;
  booked_count: number;
  capacity: number;
  guide_name: string | null;
};

export type AdminDashboardData = {
  classes: AdminDashboardClassRow[];
  memberCount: number;
  signInsToday: number;
};

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  const { startUtcIso, endUtcIso } = jhbDayBounds();

  const [classesRes, memberRes, signInsRes] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, starts_at, booked_count, capacity, guide_name")
      .gte("starts_at", startUtcIso)
      .lte("starts_at", endUtcIso)
      .eq("is_cancelled", false)
      .order("starts_at"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .or(BOOKABLE_MEMBER_OR_FILTER),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("checked_in", true)
      .gte("checked_in_at", startUtcIso)
      .lte("checked_in_at", endUtcIso),
  ]);

  if (classesRes.error) console.error("admin dashboard classes", classesRes.error);
  if (memberRes.error) console.error("admin dashboard member count", memberRes.error);
  if (signInsRes.error) console.error("admin dashboard sign-ins", signInsRes.error);

  return {
    classes: (classesRes.data ?? []) as AdminDashboardClassRow[],
    memberCount: memberRes.count ?? 0,
    signInsToday: signInsRes.count ?? 0,
  };
}

export function useAdminDashboard(enabled = true) {
  return useQuery({
    queryKey: queryKeys.adminDashboard(),
    queryFn: fetchAdminDashboard,
    enabled,
    staleTime: 30_000,
  });
}
