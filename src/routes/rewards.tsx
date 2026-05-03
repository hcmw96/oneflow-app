import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Gift, Award, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { user, pointsHistory } from "@/data/mock";
import { formatDayLabel } from "@/lib/format";

export const Route = createFileRoute("/rewards")({
  component: RewardsPage,
});

const badges = [
  { name: "Yoga 50", earned: true, icon: "🧘" },
  { name: "Sculpt 50", earned: true, icon: "💪" },
  { name: "Sauna 50", earned: false, icon: "🔥" },
  { name: "First Beginner", earned: true, icon: "🌱" },
  { name: "Member of Month", earned: false, icon: "⭐" },
  { name: "Yoga 100", earned: false, icon: "🧘" },
];

function RewardsPage() {
  return (
    <AppShell>
      <header className="safe-top px-5 pt-3 pb-3">
        <h1 className="font-display text-2xl font-semibold">Rewards</h1>
      </header>

      <main className="flex-1 space-y-5 px-5">
        <section className="rounded-3xl bg-primary p-5 text-primary-foreground">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest opacity-80">
            <Sparkles className="h-3.5 w-3.5" /> Flow Points
          </div>
          <p className="mt-1 font-display text-5xl font-semibold leading-none">
            {user.pointsBalance.toLocaleString()}
          </p>
          <p className="mt-2 text-sm opacity-80">100 pts = R10, redeemable at One Flow.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                <Zap className="h-3.5 w-3.5" /> Spin & Win
              </div>
              <h3 className="mt-1 font-display text-lg font-semibold">Unlocks at week 4</h3>
              <p className="mt-1 text-xs text-muted-foreground">Stay consistent — 2 weeks to go.</p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-2xl">
              🎡
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-semibold">
            <Award className="h-4 w-4" /> Your badges
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {badges.map((b) => (
              <div
                key={b.name}
                className={
                  "flex flex-col items-center gap-1 rounded-2xl border p-3 text-center " +
                  (b.earned
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-card opacity-50")
                }
              >
                <div className="text-2xl">{b.icon}</div>
                <p className="text-[11px] font-medium leading-tight">{b.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-semibold">
            <Gift className="h-4 w-4" /> Recent activity
          </h3>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            {pointsHistory.map((p, i) => (
              <li
                key={p.id}
                className={"flex items-center justify-between px-4 py-3 " + (i > 0 ? "border-t border-border" : "")}
              >
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDayLabel(p.date)}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  +{p.delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
