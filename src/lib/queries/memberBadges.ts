import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./queryKeys";

export type MemberBadgePreview = {
  id: string;
  name: string;
  icon: string;
};

export async function fetchMemberBadges(userId: string, limit = 8): Promise<MemberBadgePreview[]> {
  const { data, error } = await supabase
    .from("member_badges")
    .select("id, badges ( name, icon )")
    .eq("profile_id", userId)
    .order("awarded_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchMemberBadges", error);
    return [];
  }

  return (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      badges:
        | { name: string; icon: string | null }
        | { name: string; icon: string | null }[]
        | null;
    };
    const b = Array.isArray(row.badges) ? row.badges[0] : row.badges;
    return {
      id: row.id,
      name: b?.name?.trim() || "Badge",
      icon: b?.icon?.trim() || "🏅",
    };
  });
}

export function useMemberBadges(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.memberBadges(userId ?? ""),
    queryFn: () => fetchMemberBadges(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
}
