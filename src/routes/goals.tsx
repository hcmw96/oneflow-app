import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getUser, supabase } from "@/lib/supabase";
import { startOfWeek, addDays } from "@/lib/format";

export const Route = createFileRoute("/goals")({
  component: GoalsPage,
});

const WEEKLY_GOAL = 4;

function GoalsPage() {
  const [thisWeekCount, setThisWeekCount] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState(0);

  const load = useCallback(async () => {
    const user = await getUser();
    if (!user) {
      setThisWeekCount(0);
      setStreakWeeks(0);
      return;
    }

    const weekStart = startOfWeek(new Date());
    const weekEnd = addDays(weekStart, 7);

    const { data, error } = await supabase
      .from("bookings")
      .select("id, classes ( starts_at )")
      .eq("profile_id", user.id)
      .eq("status", "attended");

    if (error) {
      console.error(error);
      setThisWeekCount(0);
      setStreakWeeks(0);
      return;
    }

    const rows = (data ?? []) as { classes: { starts_at: string } | { starts_at: string }[] }[];
    let weekCount = 0;
    for (const row of rows) {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      const t = cls?.starts_at ? new Date(cls.starts_at) : null;
      if (t && t >= weekStart && t < weekEnd) weekCount += 1;
    }
    setThisWeekCount(weekCount);
    setStreakWeeks(0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = Math.min(100, (thisWeekCount / WEEKLY_GOAL) * 100);

  return (
    <AppShell>
      <header className="safe-top px-5 pt-3 pb-3">
        <h1 className="font-display text-2xl font-semibold">Goals & Streaks</h1>
      </header>
      <main className="flex-1 space-y-4 px-5">
        <section className="rounded-3xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">This week</p>
          <p className="mt-1 font-display text-3xl font-semibold">
            {thisWeekCount} / {WEEKLY_GOAL}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </section>
        <section className="rounded-3xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Streak</p>
          <p className="mt-1 font-display text-3xl font-semibold">{streakWeeks} weeks</p>
          <p className="mt-2 text-xs text-muted-foreground">Streak tracking coming soon.</p>
        </section>
        <Link
          to="/schedule"
          className="block rounded-2xl bg-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground"
        >
          Book a class
        </Link>
      </main>
    </AppShell>
  );
}
