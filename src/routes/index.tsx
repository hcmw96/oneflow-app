import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, MapPin, QrCode, Sparkles, Ticket } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import challengeBg from "@/assets/challenge-bg.jpg";
import { useAuth } from "@/contexts/auth";
import { countMayChallengeStampedDays } from "@/lib/mayChallengeCheckIn";
import { supabase } from "@/lib/supabase";
import { addDays, startOfWeekSunday } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const HOME_TZ = "Africa/Johannesburg";

function ymdInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Civil calendar +1 day for YYYY-MM-DD strings (Gregorian). */
function civilAddOneDayYmd(ymd: string): string {
  const [y, M, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, M - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function upcomingDayLabel(iso: string): string {
  const classYmd = ymdInTimeZone(iso, HOME_TZ);
  const todayYmd = ymdInTimeZone(new Date().toISOString(), HOME_TZ);
  const tomorrowYmd = civilAddOneDayYmd(todayYmd);
  if (classYmd === tomorrowYmd) return "Tomorrow";
  const d = new Date(iso);
  return d
    .toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: HOME_TZ,
    })
    .replace(/,/g, "")
    .trim();
}

function upcomingTimeSast(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-ZA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: HOME_TZ,
    })
    .toUpperCase();
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

function HomePage() {
  const navigate = useNavigate();
  const { user, authReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [points, setPoints] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [weeklyDone, setWeeklyDone] = useState(0);
  const [challengeStamped, setChallengeStamped] = useState(0);
  const [upcomingBookings, setUpcomingBookings] = useState<
    {
      id: string;
      name: string;
      startsAt: string;
      location: string;
      guideName: string | null;
    }[]
  >([]);
  const challengeTotalDays = 31;
  const SAGE = "#a3b693";
  const goalPct = weeklyGoal > 0 ? Math.min(100, (weeklyDone / weeklyGoal) * 100) : 0;
  const remaining = Math.max(0, weeklyGoal - weeklyDone);

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setCredits(0);
      setCompleted(0);
      setPoints(0);
      setFirstName(null);
      setWeeklyGoal(3);
      setWeeklyDone(0);
      setChallengeStamped(0);
      setUpcomingBookings([]);

      if (!user || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      const uid = user.id;
      const weekStart = startOfWeekSunday(new Date());
      const weekEnd = addDays(weekStart, 7);

      const [
        { data: profile },
        { data: creditRows },
        { count: attendedCount, error: attendedErr },
        { count: weeklyAttended, error: weeklyErr },
        { data: bookingRows },
        stampedDays,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name, weekly_goal, flow_points")
          .eq("id", uid)
          .maybeSingle(),
        supabase
          .from("user_credits")
          .select("credits_remaining, is_unlimited")
          .eq("profile_id", uid),
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
          .gte("checked_in_at", weekStart.toISOString())
          .lt("checked_in_at", weekEnd.toISOString()),
        supabase
          .from("bookings")
          .select(
            `
            id,
            status,
            classes ( name, starts_at, location, guide_name )
          `,
          )
          .eq("profile_id", uid)
          .eq("status", "confirmed"),
        countMayChallengeStampedDays(uid),
      ]);

      if (cancelled) return;

      if (attendedErr) console.error(attendedErr);
      if (weeklyErr) console.error(weeklyErr);

      const creditSum = (creditRows ?? []).reduce((acc, row) => {
        if (row.is_unlimited) return acc;
        const n = Number(row.credits_remaining);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);

      setFirstName(profile?.first_name?.trim() || null);
      setCredits(creditSum);
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
      setChallengeStamped(stampedDays);

      const nowT = Date.now();
      type ClassJoin = {
        name: string;
        starts_at: string;
        location: string;
        guide_name: string | null;
      } | null;
      const upcoming = (bookingRows ?? [])
        .map((row) => {
          const raw = row as { id: string; classes: ClassJoin | ClassJoin[] | null };
          const c = Array.isArray(raw.classes) ? raw.classes[0] : raw.classes;
          if (!c?.starts_at) return null;
          const gn = (c.guide_name ?? "").trim();
          return {
            id: raw.id,
            name: c.name ?? "Class",
            startsAt: c.starts_at,
            location: c.location ?? "—",
            guideName: gn.length > 0 ? gn : null,
          };
        })
        .filter(
          (x): x is NonNullable<typeof x> => x != null && new Date(x.startsAt).getTime() > nowT,
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .slice(0, 2);
      setUpcomingBookings(upcoming);

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

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

        {upcomingBookings.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold">Upcoming</h2>
              <Link
                to="/bookings"
                className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                View all
              </Link>
            </div>
            <ul className="space-y-3">
              {upcomingBookings.map((b) => {
                const dateStr = upcomingDayLabel(b.startsAt);
                const timeStr = upcomingTimeSast(b.startsAt);
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
                          {dateStr} · {timeStr}
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
          </section>
        ) : null}

        <Link
          to="/schedule"
          className="block rounded-xl bg-primary px-6 py-4 text-center text-base font-medium text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
        >
          Book a Class
        </Link>

        <Link to="/challenge" className="relative block overflow-hidden rounded-2xl">
          <img src={challengeBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
          <div className="relative p-5">
            <span className="inline-block rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
              May Challenge
            </span>
            <h3 className="mt-2 font-display text-2xl font-bold text-white">31 Days of Movement</h3>
            <p className="mt-1 text-xs text-white/80">
              {challengeStamped}/{challengeTotalDays} days · Tap to view →
            </p>
          </div>
        </Link>

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

        <div className="rounded-2xl border border-border bg-card px-5 py-5">
          <div className="mb-3 flex items-center gap-2">
            <Ticket className="h-4 w-4 text-[#a3b693]" />
            <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Credits
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="font-display text-5xl leading-none font-extrabold tracking-tight text-foreground">
                {credits}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {credits === 1 ? "credit remaining" : "credits remaining"}
              </p>
            </div>

            {credits === 0 && (
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
