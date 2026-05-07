import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Flame, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getUser, supabase } from "@/lib/supabase";
import { startOfWeek, addDays } from "@/lib/format";

export const Route = createFileRoute("/goals")({
  component: GoalsPage,
});

const DEFAULT_WEEKLY_GOAL = 4;
const clampGoal = (n: number) => Math.min(14, Math.max(1, Math.round(n)));

function GoalsPage() {
  const [weeklyGoal, setWeeklyGoal] = useState(DEFAULT_WEEKLY_GOAL);
  const [thisWeekCount, setThisWeekCount] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(DEFAULT_WEEKLY_GOAL));
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    const user = await getUser();
    if (!user) {
      setWeeklyGoal(DEFAULT_WEEKLY_GOAL);
      setThisWeekCount(0);
      setStreakWeeks(0);
      setLongestStreak(0);
      return;
    }

    const weekStart = startOfWeek(new Date());
    const weekEnd = addDays(weekStart, 7);

    const [{ data: prof, error: profErr }, { data, error }] = await Promise.all([
      supabase
        .from("profiles")
        .select("weekly_goal, current_streak, longest_streak")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("bookings")
        .select("id, classes ( starts_at )")
        .eq("profile_id", user.id)
        .eq("status", "attended"),
    ]);

    if (profErr || error) {
      if (profErr) console.error(profErr);
      console.error(error);
      setWeeklyGoal(DEFAULT_WEEKLY_GOAL);
      setThisWeekCount(0);
      setStreakWeeks(0);
      setLongestStreak(0);
      return;
    }

    const wgRaw = (prof as { weekly_goal?: number | null } | null)?.weekly_goal;
    const wg =
      typeof wgRaw === "number" && Number.isFinite(wgRaw) ? clampGoal(wgRaw) : DEFAULT_WEEKLY_GOAL;
    const curStreak = Number(
      (prof as { current_streak?: number | null } | null)?.current_streak ?? 0,
    );
    const maxStreak = Number(
      (prof as { longest_streak?: number | null } | null)?.longest_streak ?? 0,
    );
    setWeeklyGoal(wg);
    setGoalInput(String(wg));
    setStreakWeeks(Number.isFinite(curStreak) ? Math.max(0, curStreak) : 0);
    setLongestStreak(Number.isFinite(maxStreak) ? Math.max(0, maxStreak) : 0);

    const rows = (data ?? []) as { classes: { starts_at: string } | { starts_at: string }[] }[];
    let weekCount = 0;
    for (const row of rows) {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      const t = cls?.starts_at ? new Date(cls.starts_at) : null;
      if (t && t >= weekStart && t < weekEnd) weekCount += 1;
    }
    setThisWeekCount(weekCount);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = Math.min(100, (thisWeekCount / weeklyGoal) * 100);

  const saveGoal = async () => {
    const user = await getUser();
    if (!user) return;
    const n = Number.parseInt(goalInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 14) {
      toast.error("Enter a weekly goal between 1 and 14.");
      return;
    }
    const next = clampGoal(n);
    setSavingGoal(true);
    const { error } = await supabase.from("profiles").update({ weekly_goal: next }).eq("id", user.id);
    setSavingGoal(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Weekly goal saved");
    setWeeklyGoal(next);
    setGoalInput(String(next));
    setEditingGoal(false);
  };

  return (
    <AppShell>
      <header className="safe-top px-5 pt-3 pb-3">
        <h1 className="font-display text-2xl font-semibold">Goals & Streaks</h1>
      </header>
      <main className="flex-1 space-y-4 px-5">
        <section className="rounded-3xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">This week</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-display text-3xl font-semibold">
              {thisWeekCount} / {weeklyGoal}
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
              onClick={() => setEditingGoal((v) => !v)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editingGoal ? "Close" : "Edit"}
            </button>
          </div>
          {editingGoal ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={14}
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => void saveGoal()}
                disabled={savingGoal}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {savingGoal ? "Saving…" : "Save"}
              </button>
            </div>
          ) : null}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </section>
        <section className="rounded-3xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Streak</p>
          {streakWeeks > 0 ? (
            <>
              <p className="mt-1 inline-flex items-center gap-2 font-display text-3xl font-semibold">
                <Flame className="h-7 w-7 text-orange-500" /> {streakWeeks} weeks
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Longest streak: {longestStreak} weeks</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Start your streak this week!</p>
          )}
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
