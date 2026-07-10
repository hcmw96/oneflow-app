import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "./queryKeys";

export function invalidateMemberBookingCaches(userId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.memberBookings(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.homePage(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.memberWaitlist(userId) });
}
