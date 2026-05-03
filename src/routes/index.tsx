import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { user, challenge, getStampedDays } from "@/data/mock";
import challengeBg from "@/assets/challenge-bg.jpg";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const completed = 0;
  const lifetimePoints = 0;
  const points = 0;
  const credits = 40;
  const weeklyGoal = 3;
  const weeklyDone = 0;
  const goalPct = Math.min(100, (weeklyDone / weeklyGoal) * 100);
  const remaining = Math.max(0, weeklyGoal - weeklyDone);
  const stampedCount = getStampedDays().size;

  return (
    <AppShell>
      <main className="flex-1 space-y-5 px-5 pt-6">
        {/* Welcome */}
        <h1 className="text-center font-display text-[44px] font-bold leading-tight tracking-tight">
          Welcome {user.name}!
        </h1>

        {/* Book CTA */}
        <Link
          to="/schedule"
          className="block rounded-xl bg-primary px-6 py-4 text-center text-base font-medium text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
        >
          Book a Class
        </Link>

        {/* 31 Days of Movement */}
        <Link
          to="/challenge"
          className="relative block overflow-hidden rounded-2xl"
        >
          <img
            src={challengeBg}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
          <div className="relative p-5">
            <span className="inline-block rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
              May Challenge
            </span>
            <h3 className="mt-2 font-display text-2xl font-bold text-white">
              31 Days of Movement
            </h3>
            <p className="mt-1 text-xs text-white/80">
              {stampedCount}/{challenge.totalDays} days · Tap to view →
            </p>
          </div>
        </Link>

        {/* Stats grid */}
        <section className="grid grid-cols-2 gap-3">
          {/* Classes Completed */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-border bg-card p-5 text-center">
            <div>
              <p className="font-display text-5xl font-bold leading-none">{completed}</p>
              <p className="mt-3 text-sm font-semibold leading-tight">
                Classes
                <br />
                Completed
              </p>
            </div>
            <Link to="/goals" className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:underline">
              View Goals
            </Link>
          </div>

          {/* Flow Points */}
          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/15" />
            <div className="relative flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Flow Points</span>
            </div>
            <p className="relative mt-3 font-display text-4xl font-bold leading-none">{points}</p>
            <p className="relative mt-2 text-xs text-muted-foreground">
              Lifetime: {lifetimePoints} pts earned
            </p>
            <Link
              to="/rewards"
              className="relative mt-4 block rounded-full border border-border bg-background px-4 py-2 text-center text-xs font-medium"
            >
              View Rewards
            </Link>
          </div>
        </section>

        {/* Credits */}
        <Link
          to="/pricing"
          className="block rounded-2xl border border-border bg-card px-5 py-4 text-center"
        >
          <p className="font-display text-lg font-bold">{credits} credits remaining</p>
          <p className="mt-1 text-sm text-muted-foreground">View passes</p>
        </Link>

        {/* Weekly Goal */}
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
