import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { user } from "@/data/mock";

export const Route = createFileRoute("/goals")({
  component: GoalsPage,
});

function GoalsPage() {
  const pct = Math.min(100, (user.thisWeekCount / user.weeklyGoal) * 100);
  return (
    <AppShell>
      <header className="safe-top px-5 pt-3 pb-3">
        <h1 className="font-display text-2xl font-semibold">Goals & Streaks</h1>
      </header>
      <main className="flex-1 space-y-4 px-5">
        <section className="rounded-3xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">This week</p>
          <p className="mt-1 font-display text-3xl font-semibold">
            {user.thisWeekCount} / {user.weeklyGoal}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </section>
        <section className="rounded-3xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Streak</p>
          <p className="mt-1 font-display text-3xl font-semibold">{user.streak} weeks</p>
        </section>
        <Link to="/schedule" className="block rounded-2xl bg-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground">
          Book a class
        </Link>
      </main>
    </AppShell>
  );
}
