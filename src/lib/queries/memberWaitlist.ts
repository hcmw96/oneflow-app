import { useQuery } from "@tanstack/react-query";
import { fetchMyActiveWaitlistEntries, type WaitlistEntryWithClass } from "@/lib/waitlist";
import { queryKeys } from "./queryKeys";

export async function fetchMemberWaitlist(userId: string): Promise<WaitlistEntryWithClass[]> {
  try {
    return await fetchMyActiveWaitlistEntries(userId);
  } catch (err) {
    console.error("fetchMemberWaitlist", err);
    return [];
  }
}

export function useMemberWaitlist(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.memberWaitlist(userId ?? ""),
    queryFn: () => fetchMemberWaitlist(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
