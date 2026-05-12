import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Sparkles, Gift, Award, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatDayLabel } from "@/lib/format";
import {
  estimatedRandValueFromPoints,
  parseFlowPointsConversionRate,
} from "@/lib/flowPointsRedemption";
import { getUser, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/rewards")({
  component: RewardsPage,
});

type AwardedBadgeRow = {
  id: string;
  awarded_at: string;
  badges:
    | { name: string; icon: string | null; description: string | null }
    | { name: string; icon: string | null; description: string | null }[]
    | null;
};

function oneBadgeJoin(
  badges: AwardedBadgeRow["badges"],
): { name: string; icon: string | null; description: string | null } | null {
  if (!badges) return null;
  return Array.isArray(badges) ? (badges[0] ?? null) : badges;
}

type HistKind = "earned" | "redeemed";

type HistRow = {
  id: string;
  kind: HistKind;
  at: string;
  title: string;
  points: number;
};

function classLabelFromBooking(raw: Record<string, unknown>): string {
  const cls = raw.classes as
    | { name: string; starts_at: string }
    | { name: string; starts_at: string }[]
    | null;
  const c = Array.isArray(cls) ? cls[0] : cls;
  return c?.name?.trim() || "Class";
}

function RewardsPage() {
  const [balance, setBalance] = useState(0);
  const [conversionRate, setConversionRate] = useState(10);
  const [estimatedZar, setEstimatedZar] = useState(0);
  const [history, setHistory] = useState<HistRow[]>([]);
  const [awardedBadges, setAwardedBadges] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setBalance(0);
      setHistory([]);
      setAwardedBadges([]);
      setEstimatedZar(0);
      setLoading(false);
      return;
    }

    const [
      { data: prof },
      { data: convRow },
      { data: perClassRow },
      { data: attended },
      { data: redeemed },
      { data: badgeRows },
    ] = await Promise.all([
      supabase.from("profiles").select("flow_points").eq("id", user.id).maybeSingle(),
      supabase
        .from("studio_settings")
        .select("value")
        .eq("key", "flow_points_conversion_rate")
        .maybeSingle(),
      supabase
        .from("studio_settings")
        .select("value")
        .eq("key", "flow_points_per_class")
        .maybeSingle(),
      supabase
        .from("bookings")
        .select("id, created_at, checked_in_at, classes ( name, starts_at )")
        .eq("profile_id", user.id)
        .eq("status", "attended")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("flow_points")
        .select("id, points, reason, created_at")
        .eq("profile_id", user.id)
        .lt("points", 0)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("member_badges")
        .select("id, awarded_at, badges ( name, icon )")
        .eq("profile_id", user.id)
        .order("awarded_at", { ascending: false })
        .limit(24),
    ]);

    const conv = parseFlowPointsConversionRate(convRow?.value as string | null | undefined);
    const perClass = Math.max(1, Math.floor(Number(perClassRow?.value) || 10));
    const fp = (prof as { flow_points?: number | null } | null)?.flow_points;
    const bal = typeof fp === "number" && Number.isFinite(fp) ? Math.max(0, fp) : 0;

    setConversionRate(conv);
    setBalance(bal);
    setEstimatedZar(estimatedRandValueFromPoints(bal, conv));

    const badgeList = (badgeRows ?? []).map((raw) => {
      const row = raw as AwardedBadgeRow;
      const b = oneBadgeJoin(row.badges);
      const icon = (b?.icon?.trim() || "🏅").slice(0, 8);
      return {
        id: row.id,
        name: b?.name?.trim() || "Badge",
        icon,
      };
    });
    setAwardedBadges(badgeList);

    const earned: HistRow[] = (attended ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const at =
        (typeof r.checked_in_at === "string" && r.checked_in_at) ||
        (typeof r.created_at === "string" && r.created_at) ||
        new Date().toISOString();
      return {
        id: `b-${String(r.id)}`,
        kind: "earned",
        at,
        title: `Class attended · ${classLabelFromBooking(r)}`,
        points: perClass,
      };
    });

    const redeemedRows: HistRow[] = (redeemed ?? []).map((row) => {
      const r = row as { id: string; points: number; reason: string | null; created_at: string };
      const label =
        r.reason === "pack_redemption"
          ? "Pack purchase (Flow Points)"
          : (r.reason ?? "Redeemed").replace(/_/g, " ");
      return {
        id: r.id,
        kind: "redeemed",
        at: r.created_at,
        title: label,
        points: r.points,
      };
    });

    const merged = [...earned, ...redeemedRows]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 50);

    setHistory(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
            {loading ? "…" : balance.toLocaleString()}
          </p>
          <p className="mt-2 text-sm opacity-90">
            100 points = R{conversionRate} off your next purchase.
          </p>
          {!loading ? (
            <p className="mt-2 text-sm font-medium opacity-95">
              Your points are worth R{estimatedZar.toFixed(2)} toward packs and memberships.
            </p>
          ) : null}
          <Link
            to="/pricing"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-primary-foreground/15 px-4 py-2.5 text-sm font-semibold text-primary-foreground ring-1 ring-inset ring-primary-foreground/25 transition-opacity hover:opacity-95"
          >
            Use points on my next purchase
          </Link>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                <Zap className="h-3.5 w-3.5" /> Spin & Win
              </div>
              <h3 className="mt-1 font-display text-lg font-semibold">Coming soon</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                We may add rewards spins for consistent attendance — nothing to do here yet.
              </p>
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
          {awardedBadges.length === 0 && !loading ? (
            <p className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              Badges awarded by the studio will appear here.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {awardedBadges.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col items-center gap-1 rounded-2xl border border-primary bg-primary-soft p-3 text-center"
                >
                  <div className="text-2xl">{b.icon}</div>
                  <p className="text-[11px] font-medium leading-tight">{b.name}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-semibold">
            <Gift className="h-4 w-4" /> Points history
          </h3>
          {history.length === 0 && !loading ? (
            <p className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              No points history yet. Attend classes to earn Flow Points, or redeem on{" "}
              <Link to="/pricing" className="font-medium text-primary underline-offset-2 hover:underline">
                pricing
              </Link>
              .
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {history.map((h, i) => (
                <li
                  key={h.id}
                  className={
                    "flex items-center justify-between px-4 py-3 " + (i > 0 ? "border-t border-border" : "")
                  }
                >
                  <div>
                    <p className="text-sm font-medium">{h.title}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDayLabel(new Date(h.at))}</p>
                  </div>
                  <span
                    className={
                      "text-sm font-semibold tabular-nums " +
                      (h.points >= 0 ? "text-primary" : "text-destructive")
                    }
                  >
                    {h.points >= 0 ? "+" : ""}
                    {Number(h.points).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
