import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import challengeBg from "@/assets/challenge-bg.jpg";
import { useAuth } from "@/contexts/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  component: HomePage,
});

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
  const { user, authReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [points, setPoints] = useState(0);
  const stampedCount = 0;
  const challengeTotalDays = 31;
  const weeklyGoal = 3;
  const weeklyDone = 0;
  const goalPct = Math.min(100, (weeklyDone / weeklyGoal) * 100);
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

      if (!user || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      const uid = user.id;

      const [
        { data: profile },
        { data: creditRows },
        { count: attendedCount, error: attendedErr },
        { data: pointsRow },
      ] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", uid).maybeSingle(),
        supabase
          .from("user_credits")
          .select("credits_remaining, is_unlimited")
          .eq("profile_id", uid),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", uid)
          .eq("status", "attended"),
        supabase.from("flow_points_balance").select("balance").eq("profile_id", uid).maybeSingle(),
      ]);

      if (cancelled) return;

      if (attendedErr) console.error(attendedErr);

      const creditSum = (creditRows ?? []).reduce((acc, row) => {
        if (row.is_unlimited) return acc;
        const n = Number(row.credits_remaining);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);

      setFirstName(profile?.first_name?.trim() || null);
      setCredits(creditSum);
      setCompleted(attendedCount ?? 0);
      setPoints(pointsRow?.balance ?? 0);
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
              {stampedCount}/{challengeTotalDays} days · Tap to view →
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

        <Link
          to="/pricing"
          className="block rounded-2xl border border-border bg-card px-5 py-4 text-center"
        >
          <p className="font-display text-lg font-bold">{credits} credits remaining</p>
          <p className="mt-1 text-sm text-muted-foreground">View passes</p>
        </Link>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-2xl font-bold">Your Weekly Goal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {weeklyDone} of {weeklyGoal} classes this week
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
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
