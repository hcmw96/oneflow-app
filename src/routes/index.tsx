import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Coffee, MapPin, QrCode, Sparkles, Ticket } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth";
import { countChallengeStampedDaysForConfig } from "@/lib/mayChallengeCheckIn";
import {
  fetchMovementChallengeConfig,
  movementChallengeTotalDays,
  type MovementChallengeConfig,
} from "@/lib/movementChallenge";
import { HomeSpotlightCard, homeSpotlightCardVisible } from "@/components/HomeSpotlightCard";
import { supabase } from "@/lib/supabase";
import {
  fetchCafeCredits,
  hasActiveCafeCredits,
  isCafeCredit,
  sumCafeCreditsRemaining,
} from "@/lib/cafeCredits";
import { useTimezone } from "@/hooks/use-timezone";
import {
  fetchUpcomingHomeBookings,
  type HomeUpcomingBooking,
} from "@/lib/homeUpcomingBookings";
import {
  civilAddDaysYmd,
  dayBoundsForDateKey,
  formatClassDateTime,
  formatShortDateInZone,
  STUDIO_TIMEZONE,
  todayDateKey,
  weekSundayDateKey,
  ymdInTimeZone,
} from "@/lib/timezone";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function upcomingDayLabel(iso: string, timeZone: string): string {
  const classYmd = ymdInTimeZone(iso, STUDIO_TIMEZONE);
  const todayYmd = todayDateKey(STUDIO_TIMEZONE);
  const tomorrowYmd = civilAddDaysYmd(todayYmd, 1);
  if (classYmd === tomorrowYmd) return "Tomorrow";
  return formatShortDateInZone(iso, timeZone);
}

function HomeSkeleton() {
  return (
    <main className="flex-1 space-y-5 px-5 pt-6">
      <Skeleton className="mx-auto h-[52px] w-64 max-w-full" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-52 w-full rounded-2xl" />
    </main>
  );
}

type UserCreditHomeRow = {
  id: string;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
  product_name: string | null;
  category: string | null;
};

function HomePage() {
  const navigate = useNavigate();
  const { user, authReady } = useAuth();
  const { timeZone, studioTimeZone } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [creditRows, setCreditRows] = useState<UserCreditHomeRow[]>([]);
  const [cafeCreditTotal, setCafeCreditTotal] = useState(0);
  const [cafeUnlimited, setCafeUnlimited] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [points, setPoints] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [weeklyDone, setWeeklyDone] = useState(0);
  const [challengeStamped, setChallengeStamped] = useState(0);
  const [challengeConfig, setChallengeConfig] = useState<MovementChallengeConfig | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<HomeUpcomingBooking[]>([]);
  const challengeTotalDays = challengeConfig
    ? movementChallengeTotalDays(challengeConfig)
    : 31;
  const SAGE = "#a3b693";
  const goalPct = weeklyGoal > 0 ? Math.min(100, (weeklyDone / weeklyGoal) * 100) : 0;
  const remaining = Math.max(0, weeklyGoal - weeklyDone);
  const showCafeTile = cafeUnlimited || cafeCreditTotal > 0;

  const { hasUnlimited, totalCredits } = useMemo(() => {
    const credits = creditRows;
    const now = new Date();
    /** Matches "active" credits: null expiry never expires. */
    const notExpired = (expires_at: string | null) =>
      expires_at == null || new Date(expires_at) > now;

    const hasUnlimited = (credits ?? []).some(
      (c) => Boolean(c.is_unlimited) && notExpired(c.expires_at),
    );
    const classCredits = (credits ?? []).filter((c) => !isCafeCredit(c));
    const hasUnlimitedClass = classCredits.some(
      (c) => Boolean(c.is_unlimited) && notExpired(c.expires_at),
    );
    const totalCredits = classCredits
      .filter((c) => !c.is_unlimited && notExpired(c.expires_at))
      .reduce((sum, c) => {
        const n = Number(c.credits_remaining);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
    return { hasUnlimited: hasUnlimitedClass, totalCredits };
  }, [creditRows]);

  const loadHome = useCallback(async () => {
    if (!authReady) return;

    setLoading(true);
    setCreditRows([]);
    setCafeCreditTotal(0);
    setCafeUnlimited(false);
    setCompleted(0);
    setPoints(0);
    setFirstName(null);
    setWeeklyGoal(3);
    setWeeklyDone(0);
    setChallengeStamped(0);
    setChallengeConfig(null);
    setUpcomingBookings([]);

    if (!user) {
      setLoading(false);
      return;
    }

    const uid = user.id;
    const todayKey = todayDateKey(STUDIO_TIMEZONE);
    const weekSundayKey = weekSundayDateKey(todayKey, STUDIO_TIMEZONE);
    const nextSundayKey = civilAddDaysYmd(weekSundayKey, 7);
    const weekStartIso = dayBoundsForDateKey(weekSundayKey, STUDIO_TIMEZONE).startUtcIso;
    const weekEndIso = dayBoundsForDateKey(nextSundayKey, STUDIO_TIMEZONE).startUtcIso;

    const [
      { data: profile },
      { data: fetchedUserCredits },
      cafeCredits,
      { count: attendedCount, error: attendedErr },
      { count: weeklyAttended, error: weeklyErr },
      upcoming,
      movementChallenge,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, weekly_goal, flow_points")
        .eq("id", uid)
        .maybeSingle(),
      supabase
        .from("user_credits")
        .select("id, credits_remaining, is_unlimited, expires_at, product_name, category")
        .eq("profile_id", uid),
      fetchCafeCredits(uid),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", uid)
        .eq("status", "attended"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", uid)
        .eq("status", "attended")
        .not("checked_in_at", "is", null)
        .gte("checked_in_at", weekStartIso)
        .lt("checked_in_at", weekEndIso),
      fetchUpcomingHomeBookings(supabase, uid),
      fetchMovementChallengeConfig(),
    ]);

    if (attendedErr) console.error(attendedErr);
    if (weeklyErr) console.error(weeklyErr);

    setFirstName(profile?.first_name?.trim() || null);
    setCreditRows((fetchedUserCredits ?? []) as UserCreditHomeRow[]);
    const cafeSum = sumCafeCreditsRemaining(cafeCredits);
    const cafeActive = hasActiveCafeCredits(cafeCredits);
    setCafeUnlimited(cafeActive && cafeSum === -1);
    setCafeCreditTotal(cafeActive && cafeSum > 0 ? cafeSum : 0);
    setCompleted(attendedCount ?? 0);
    const wgRaw = (profile as { weekly_goal?: number | null } | null)?.weekly_goal;
    const wg =
      typeof wgRaw === "number" && Number.isFinite(wgRaw)
        ? Math.min(14, Math.max(1, Math.round(wgRaw)))
        : 3;
    setWeeklyGoal(wg);
    setWeeklyDone(weeklyAttended ?? 0);
    const fpRaw = (profile as { flow_points?: number | null } | null)?.flow_points;
    setPoints(typeof fpRaw === "number" && Number.isFinite(fpRaw) ? Math.max(0, fpRaw) : 0);
    setChallengeConfig(movementChallenge);
    const stampedDays = movementChallenge.enabled
      ? await countChallengeStampedDaysForConfig(uid, movementChallenge)
      : 0;
    setChallengeStamped(stampedDays);
    setUpcomingBookings(upcoming);
    setLoading(false);
  }, [authReady, user]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("home-bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void loadHome();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, loadHome]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadHome();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadHome]);

  if (!authReady || loading) {
    return (
      <AppShell>
        <HomeSkeleton />
      </AppShell>
    );
  }

  const welcomeTitle = firstName ? `Welcome ${firstName}!` : "Welcome!";

  return (
    <AppShell>
      <main className="flex-1 space-y-5 px-5 pt-6">
        <h1 className="text-center font-display text-[44px] font-bold leading-tight tracking-tight">
          {welcomeTitle}
        </h1>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Your bookings</h2>
              <Link
                to="/bookings"
                className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                View all
              </Link>
          </div>
          {upcomingBookings.length > 0 ? (
            <ul className="space-y-3">
              {upcomingBookings.map((b) => {
                const dateStr = upcomingDayLabel(b.startsAt, timeZone);
                const { time: timeStr } = formatClassDateTime(
                  b.startsAt,
                  timeZone,
                  studioTimeZone,
                );
                const timeLabel = timeStr.toUpperCase();
                return (
                  <li key={b.id}>
                    <Link
                      to="/bookings"
                      search={{ booking: b.id }}
                      className="flex flex-col gap-1 rounded-xl border border-border bg-muted/20 px-3 py-3 text-left text-sm transition-colors active:bg-muted/50"
                      aria-label={`Open check-in QR for ${b.name}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold leading-snug">{b.name}</span>
                          {b.guideName ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              with {b.guideName}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: SAGE }}
                        >
                          <QrCode className="h-3.5 w-3.5" aria-hidden />
                          QR
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {dateStr} · {timeLabel}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {b.location}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              No upcoming classes booked.{" "}
              <Link to="/schedule" className="font-semibold text-primary underline-offset-2">
                Book a class
              </Link>
            </p>
          )}
        </section>

        <Link
          to="/schedule"
          className="block rounded-xl bg-primary px-6 py-4 text-center text-base font-medium text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
        >
          Book a Class
        </Link>

        {challengeConfig && homeSpotlightCardVisible(challengeConfig) ? (
          <HomeSpotlightCard
            config={challengeConfig}
            challengeStamped={challengeStamped}
            challengeTotalDays={challengeTotalDays}
          />
        ) : null}

        <section className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center justify-between rounded-2xl border border-border bg-card p-5 text-center">
            <div>
              <p className="font-display text-5xl font-bold leading-none">{completed}</p>
              <p className="mt-3 text-sm font-semibold leading-tight">
                Classes
                <br />
                Completed
              </p>
            </div>
            <Link
              to="/goals"
              className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              View Goals
            </Link>
          </div>

          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/15" />
            <div className="relative flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Flow Points</span>
            </div>
            <p className="relative mt-3 font-display text-4xl font-bold leading-none">{points}</p>
            <p className="relative mt-2 text-xs text-muted-foreground">
              Earn more by attending classes
            </p>
            <Link
              to="/rewards"
              className="relative mt-4 block rounded-full border border-border bg-background px-4 py-2 text-center text-xs font-medium"
            >
              View Rewards
            </Link>
          </div>
        </section>

        {showCafeTile ? (
          <Link
            to="/cafe"
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 transition-colors active:bg-muted/40"
          >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${SAGE}22` }}
            >
              <Coffee className="h-5 w-5" style={{ color: SAGE }} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Café</p>
              <p className="text-xs text-muted-foreground">
                {cafeUnlimited
                  ? "Unlimited café credits"
                  : `${cafeCreditTotal} café credit${cafeCreditTotal === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: SAGE }}
          >
            <QrCode className="h-3.5 w-3.5" aria-hidden />
            QR
          </span>
          </Link>
        ) : null}

        <div className="rounded-2xl border border-border bg-card px-5 py-5">
          <div className="mb-3 flex items-center gap-2">
            <Ticket className="h-4 w-4 text-[#a3b693]" />
            <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Class credits
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              {hasUnlimited ? (
                <>
                  <p className="font-display text-5xl font-extrabold leading-none tracking-tight text-foreground">
                    ∞
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">unlimited credits</p>
                </>
              ) : (
                <>
                  <p className="font-display text-5xl font-extrabold leading-none tracking-tight text-foreground">
                    {totalCredits}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {totalCredits === 1 ? "credit remaining" : "credits remaining"}
                  </p>
                </>
              )}
            </div>

            {!hasUnlimited && totalCredits === 0 && (
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                Out of credits
              </span>
            )}
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => void navigate({ to: "/pricing" })}
              className="flex-1 rounded-xl border border-[#a3b693] py-2.5 text-sm font-semibold text-[#a3b693] transition-opacity active:opacity-70"
            >
              Top up
            </button>
            <button
              type="button"
              onClick={() => void navigate({ to: "/schedule" })}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-70"
              style={{ backgroundColor: "#a3b693" }}
            >
              Book a class →
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-2xl font-bold">Your Weekly Goal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {weeklyDone} of {weeklyGoal} classes this week
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${goalPct}%`, backgroundColor: SAGE }}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {remaining} more classes to reach your goal
          </p>
          <Link
            to="/goals"
            className="mt-4 block rounded-xl border border-border bg-background px-4 py-2.5 text-center text-sm font-medium"
          >
            View Goals & Streaks
          </Link>
        </section>
      </main>
    </AppShell>
  );
}
