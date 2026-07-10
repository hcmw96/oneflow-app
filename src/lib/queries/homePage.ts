import { useQuery } from "@tanstack/react-query";
import { countChallengeStampedDaysForConfig } from "@/lib/mayChallengeCheckIn";
import {
  fetchMovementChallengeConfig,
  type MovementChallengeConfig,
} from "@/lib/movementChallenge";
import { fetchHomeEventCardConfig } from "@/lib/homeEventCard";
import {
  summarizeMemberCreditTypes,
  type MemberCreditRow,
} from "@/lib/memberCreditBalance";
import {
  fetchCafeCredits,
  hasActiveCafeCredits,
  sumCafeCreditsRemaining,
} from "@/lib/cafeCredits";
import {
  fetchMatTowelAccess,
  type MatTowelAccessRow,
} from "@/lib/matTowelAccess";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import {
  classStartsAtInStudioWeek,
  studioWeekBounds,
  weeklyGoalFromProfile,
} from "@/lib/weeklyGoal";
import { fetchMemberBookings, type MemberBookingRow } from "./memberBookings";
import { fetchMemberBadges, type MemberBadgePreview } from "./memberBadges";
import { queryKeys } from "./queryKeys";

export type HomePageData = {
  firstName: string | null;
  creditRows: MemberCreditRow[];
  creditTypeBalances: ReturnType<typeof summarizeMemberCreditTypes>;
  cafeCreditTotal: number;
  cafeUnlimited: boolean;
  matTowelRows: MatTowelAccessRow[];
  completed: number;
  points: number;
  weeklyGoal: number;
  weeklyDone: number;
  challengeStamped: number;
  challengeConfig: MovementChallengeConfig | null;
  upcomingBookings: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    location: string;
    guideName: string | null;
  }[];
  homeEventCard: Awaited<ReturnType<typeof fetchHomeEventCardConfig>> | null;
  badges: MemberBadgePreview[];
};

function oneClass<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function upcomingFromMemberBookings(
  rows: MemberBookingRow[],
  nowMs: number,
  limit = 10,
) {
  const upcoming: HomePageData["upcomingBookings"] = [];
  for (const row of rows) {
    if (row.status !== "confirmed") continue;
    const cls = oneClass(row.classes);
    if (!cls?.starts_at || !cls.ends_at) continue;
    if (new Date(cls.ends_at).getTime() <= nowMs) continue;
    const gn = (cls.guide_name ?? "").trim();
    upcoming.push({
      id: row.id,
      name: (cls.name ?? "Class").trim() || "Class",
      startsAt: cls.starts_at,
      endsAt: cls.ends_at,
      location: (cls.location ?? "—").trim() || "—",
      guideName: gn.length > 0 ? gn : null,
    });
  }
  upcoming.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return upcoming.slice(0, limit);
}

function weeklyDoneFromMemberBookings(rows: MemberBookingRow[]): number {
  const bounds = studioWeekBounds();
  let count = 0;
  for (const row of rows) {
    if (row.status !== "attended") continue;
    const startsAt = oneClass(row.classes)?.starts_at;
    if (startsAt && classStartsAtInStudioWeek(startsAt, bounds)) count += 1;
  }
  return count;
}

export async function fetchHomePageData(userId: string): Promise<HomePageData> {
  const memberBookings = await queryClient.fetchQuery({
    queryKey: queryKeys.memberBookings(userId),
    queryFn: () => fetchMemberBookings(userId),
    staleTime: 30_000,
  });

  const nowMs = Date.now();

  const [
    { data: profile },
    { data: fetchedUserCredits },
    cafeCredits,
    matTowelAccess,
    movementChallenge,
    eventCardConfig,
    badges,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, weekly_goal, flow_points")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_credits")
      .select(
        "id, credits_remaining, is_unlimited, expires_at, product_name, category, mat_access, towel_access",
      )
      .eq("profile_id", userId),
    fetchCafeCredits(userId),
    fetchMatTowelAccess(userId),
    fetchMovementChallengeConfig(),
    fetchHomeEventCardConfig(),
    queryClient.fetchQuery({
      queryKey: queryKeys.memberBadges(userId),
      queryFn: () => fetchMemberBadges(userId),
      staleTime: 60_000,
    }),
  ]);

  const creditRows = (fetchedUserCredits ?? []) as MemberCreditRow[];
  const cafeSum = sumCafeCreditsRemaining(cafeCredits);
  const cafeActive = hasActiveCafeCredits(cafeCredits);
  const fpRaw = (profile as { flow_points?: number | null } | null)?.flow_points;

  const challengeStamped = movementChallenge.enabled
    ? await countChallengeStampedDaysForConfig(userId, movementChallenge)
    : 0;

  return {
    firstName: profile?.first_name?.trim() || null,
    creditRows,
    creditTypeBalances: summarizeMemberCreditTypes(creditRows),
    cafeUnlimited: cafeActive && cafeSum === -1,
    cafeCreditTotal: cafeActive && cafeSum > 0 ? cafeSum : 0,
    matTowelRows: matTowelAccess,
    completed: memberBookings.filter((b) => b.status === "attended").length,
    points: typeof fpRaw === "number" && Number.isFinite(fpRaw) ? Math.max(0, fpRaw) : 0,
    weeklyGoal: weeklyGoalFromProfile(
      (profile as { weekly_goal?: number | null } | null)?.weekly_goal,
    ),
    weeklyDone: weeklyDoneFromMemberBookings(memberBookings),
    challengeStamped,
    challengeConfig: movementChallenge,
    upcomingBookings: upcomingFromMemberBookings(memberBookings, nowMs),
    homeEventCard: eventCardConfig,
    badges,
  };
}

export function useHomePage(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.homePage(userId ?? ""),
    queryFn: () => fetchHomePageData(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
