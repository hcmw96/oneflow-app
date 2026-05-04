import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, CalendarCheck, CreditCard, TrendingUp, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { supabase } from "@/lib/supabase";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import { addDays, startOfDay, startOfWeek } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [{ title: "Reports — One Flow Admin" }],
  }),
  component: ReportsPage,
});

const SAGE = "#a3b693";
const SAGE_DARK = "#7d9268";
const SAGE_LIGHT = "#c5d4b8";
const SAGE_BG = "bg-[#e8efe3]/90";
const SAGE_BORDER = "border-[#c5d4b8]/80";

type PeriodMode = "daily" | "weekly" | "monthly";

const CATEGORY_CHART_KEYS = ["CLASS PACKS", "WELLZONE", "ALL ACCESS"] as const;

function formatPriceZar(zar: number) {
  const n = Number(zar);
  if (!Number.isFinite(n)) return "R—";
  return `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function periodBounds(mode: PeriodMode, anchor = new Date()) {
  if (mode === "daily") {
    const start = startOfDay(anchor);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (mode === "weekly") {
    const start = startOfWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}

function periodLabel(mode: PeriodMode, start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (mode === "daily") return start.toLocaleDateString("en-ZA", { weekday: "long", ...opts });
  if (mode === "weekly") {
    return `${start.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-ZA", opts)}`;
  }
  return start.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function mapProductCategoryToBucket(
  cat: string | null | undefined,
): (typeof CATEGORY_CHART_KEYS)[number] | "Other" {
  const c = (cat ?? "").toLowerCase();
  if (c === "yoga") return "CLASS PACKS";
  if (c === "wellzone") return "WELLZONE";
  if (c === "all_access") return "ALL ACCESS";
  return "Other";
}

type ProductJoin = { price_zar?: number | null; category?: string | null } | null;

type PurchaseRow = {
  id: string;
  created_at: string | null;
  purchased_at?: string | null;
  credits_total?: number | null;
  category?: string | null;
  price_zar?: number | null;
  product_id?: string | null;
  products?: ProductJoin | ProductJoin[];
};

function oneProduct(p: PurchaseRow["products"]): ProductJoin {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

type BookingsCountQuery = PostgrestFilterBuilder<
  Record<string, unknown>,
  Record<string, unknown>,
  "bookings",
  unknown,
  "bookings"
>;

async function sumCountForClassIds(
  classIds: string[],
  apply: (q: BookingsCountQuery) => BookingsCountQuery,
) {
  if (classIds.length === 0) return 0;
  const chunk = 180;
  let total = 0;
  for (let i = 0; i < classIds.length; i += chunk) {
    const slice = classIds.slice(i, i + chunk);
    const base = supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("class_id", slice);
    const { count, error } = await apply(base);
    if (error) {
      console.error("reports bookings chunk", error);
      continue;
    }
    total += count ?? 0;
  }
  return total;
}

async function aggregateWeekdayCheckIns(classIds: string[]) {
  const counts = new Map<number, number>();
  const chunk = 150;
  for (let i = 0; i < classIds.length; i += chunk) {
    const slice = classIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("bookings")
      .select("classes ( starts_at )")
      .eq("status", "attended")
      .in("class_id", slice);
    if (error) {
      console.error("reports weekday chunk", error);
      continue;
    }
    for (const row of (data ?? []) as {
      classes: { starts_at: string } | { starts_at: string }[] | null;
    }[]) {
      const c = row.classes;
      const cls = Array.isArray(c) ? c[0] : c;
      const st = cls?.starts_at;
      if (!st) continue;
      const d = new Date(st);
      const mon0 = (d.getDay() + 6) % 7;
      counts.set(mon0, (counts.get(mon0) ?? 0) + 1);
    }
  }
  return counts;
}

type ReportsState = {
  loading: boolean;
  periodLabel: string;
  revenueZar: number;
  passesSold: number;
  aovZar: number;
  revenueByCategory: { name: string; revenue: number }[];
  checkIns: number;
  topClasses: { name: string; booked: number; capacity: number }[];
  occupancyPct: number | null;
  busiestDay: string | null;
  newSignups: number | null;
  activeMembers: number | null;
  lapsedMembers: number | null;
  creditsSoldUnits: number;
  creditsUsedProxy: number;
  creditsExpiring30d: number;
};

const emptyState = (label: string): ReportsState => ({
  loading: false,
  periodLabel: label,
  revenueZar: 0,
  passesSold: 0,
  aovZar: 0,
  revenueByCategory: CATEGORY_CHART_KEYS.map((name) => ({ name, revenue: 0 })),
  checkIns: 0,
  topClasses: [],
  occupancyPct: null,
  busiestDay: null,
  newSignups: null,
  activeMembers: null,
  lapsedMembers: null,
  creditsSoldUnits: 0,
  creditsUsedProxy: 0,
  creditsExpiring30d: 0,
});

const WEEKDAY_MON0 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function ReportsPage() {
  const [mode, setMode] = useState<PeriodMode>("weekly");
  const [state, setState] = useState<ReportsState>(() => ({
    ...emptyState(""),
    loading: true,
  }));

  const bounds = useMemo(() => periodBounds(mode), [mode]);

  const load = useCallback(async () => {
    const { start, end } = bounds;
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const label = periodLabel(mode, start, end);
    setState((s) => ({ ...s, loading: true }));

    const now = new Date();
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);

    const [purchasesRes, classesRes, signupsRes, membersRes, creditsSnapshotRes, expiringRes] =
      await Promise.all([
        supabase
          .from("user_credits")
          .select(
            "id, created_at, purchased_at, credits_total, category, price_zar, product_id, products ( price_zar, category )",
          )
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase
          .from("classes")
          .select("id, name, booked_count, capacity, starts_at")
          .gte("starts_at", startIso)
          .lte("starts_at", endIso)
          .eq("is_cancelled", false)
          .order("booked_count", { ascending: false }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "member")
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase.from("profiles").select("id").eq("role", "member"),
        supabase
          .from("user_credits")
          .select("profile_id, credits_remaining, is_unlimited, expires_at"),
        supabase
          .from("user_credits")
          .select("credits_remaining")
          .gt("credits_remaining", 0)
          .gte("expires_at", now.toISOString())
          .lte("expires_at", in30.toISOString()),
      ]);

    if (purchasesRes.error) console.error("reports user_credits", purchasesRes.error);
    if (classesRes.error) console.error("reports classes", classesRes.error);
    if (signupsRes.error)
      console.warn("reports new signups (created_at may be missing)", signupsRes.error);
    if (membersRes.error) console.error("reports members", membersRes.error);
    if (creditsSnapshotRes.error)
      console.error("reports credits snapshot", creditsSnapshotRes.error);
    if (expiringRes.error) console.error("reports expiring", expiringRes.error);

    const inPeriodPurchases = (purchasesRes.data ?? []) as PurchaseRow[];

    let revenueZar = 0;
    const byBucket: Record<string, number> = {
      "CLASS PACKS": 0,
      WELLZONE: 0,
      "ALL ACCESS": 0,
      Other: 0,
    };

    for (const row of inPeriodPurchases) {
      const prod = oneProduct(row.products);
      const price = Number(row.price_zar ?? prod?.price_zar ?? 0) || 0;
      revenueZar += price;
      const bucket = mapProductCategoryToBucket(row.category ?? prod?.category ?? null);
      if (bucket === "Other") byBucket.Other += price;
      else byBucket[bucket] += price;
    }

    const passesSold = inPeriodPurchases.length;
    const aovZar = passesSold > 0 ? revenueZar / passesSold : 0;

    const revenueByCategory = [
      ...CATEGORY_CHART_KEYS.map((name) => ({ name, revenue: byBucket[name] ?? 0 })),
      ...(byBucket.Other > 0 ? [{ name: "Other", revenue: byBucket.Other }] : []),
    ];

    const classes = (classesRes.data ?? []) as {
      id: string;
      name: string;
      booked_count: number;
      capacity: number;
      starts_at: string;
    }[];
    const classIds = classes.map((c) => c.id);

    const [checkIns, creditsUsedProxy, weekdayCounts] = await Promise.all([
      sumCountForClassIds(classIds, (q) => q.eq("status", "attended")),
      sumCountForClassIds(classIds, (q) =>
        q.eq("status", "attended").eq("payment_method", "credit"),
      ),
      classIds.length
        ? aggregateWeekdayCheckIns(classIds)
        : Promise.resolve(new Map<number, number>()),
    ]);

    let busiestDay: string | null = null;
    let best = -1;
    let bestD = -1;
    for (const [dow, c] of weekdayCounts) {
      if (c > best) {
        best = c;
        bestD = dow;
      }
    }
    busiestDay = bestD >= 0 && best > 0 ? WEEKDAY_MON0[bestD] : null;

    const topClasses = classes.slice(0, 5).map((c) => ({
      name: c.name,
      booked: c.booked_count ?? 0,
      capacity: c.capacity ?? 0,
    }));

    let occupancyPct: number | null = null;
    const occRows = classes.filter((c) => (c.capacity ?? 0) > 0);
    if (occRows.length) {
      const sum = occRows.reduce(
        (acc, c) => acc + ((c.booked_count ?? 0) / (c.capacity || 1)) * 100,
        0,
      );
      occupancyPct = Math.round(sum / occRows.length);
    }

    const newSignups = signupsRes.error ? null : (signupsRes.count ?? 0);

    const memberIds = new Set((membersRes.data ?? []).map((m: { id: string }) => m.id));
    const activeIds = new Set<string>();
    const t = now.getTime();
    for (const row of creditsSnapshotRes.data ?? []) {
      const pid = row.profile_id as string;
      if (!memberIds.has(pid)) continue;
      const exp = row.expires_at ? new Date(row.expires_at).getTime() : Number.POSITIVE_INFINITY;
      if (exp < t) continue;
      if (row.is_unlimited || Number(row.credits_remaining) > 0) activeIds.add(pid);
    }
    const activeMembers = memberIds.size ? activeIds.size : null;
    const lapsedMembers = memberIds.size ? memberIds.size - activeIds.size : null;

    let creditsSoldUnits = 0;
    for (const row of inPeriodPurchases) {
      const n = Number(row.credits_total);
      creditsSoldUnits += Number.isFinite(n) ? n : 0;
    }

    const creditsExpiring30d = (expiringRes.data ?? []).reduce(
      (acc, r: { credits_remaining: number | null }) => acc + (Number(r.credits_remaining) || 0),
      0,
    );

    setState({
      loading: false,
      periodLabel: label,
      revenueZar,
      passesSold,
      aovZar,
      revenueByCategory,
      checkIns,
      topClasses,
      occupancyPct,
      busiestDay,
      newSignups,
      activeMembers,
      lapsedMembers,
      creditsSoldUnits,
      creditsUsedProxy,
      creditsExpiring30d,
    });
  }, [bounds, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const creditsCompareData = useMemo(
    () => [
      { name: "Sold", value: state.creditsSoldUnits },
      { name: "Used", value: state.creditsUsedProxy },
    ],
    [state.creditsSoldUnits, state.creditsUsedProxy],
  );

  return (
    <div className="min-w-0">
      <PageHeader
        title="Reports"
        description={state.loading ? "Loading metrics…" : state.periodLabel}
        meta={
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => {
              if (v === "daily" || v === "weekly" || v === "monthly") setMode(v);
            }}
            className={cn("rounded-xl border p-1", SAGE_BORDER, SAGE_BG)}
            variant="outline"
            size="sm"
          >
            {(["daily", "weekly", "monthly"] as const).map((m) => (
              <ToggleGroupItem
                key={m}
                value={m}
                className={cn(
                  "rounded-lg px-3 text-xs font-semibold capitalize data-[state=on]:bg-[#a3b693] data-[state=on]:text-white",
                  "data-[state=off]:text-[#3d4f36]",
                )}
              >
                {m}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />

      {state.loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading reports…</div>
      ) : (
        <div className="space-y-10">
          <section>
            <h3
              className="mb-3 font-display text-sm font-bold uppercase tracking-wide"
              style={{ color: SAGE }}
            >
              Revenue
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Total revenue"
                value={formatPriceZar(state.revenueZar)}
                icon={<Banknote className="h-4 w-4" />}
              />
              <StatCard
                label="Passes sold"
                value={state.passesSold.toLocaleString()}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <StatCard
                label="Avg order value"
                value={formatPriceZar(state.aovZar)}
                icon={<CreditCard className="h-4 w-4" />}
              />
            </div>
            <div
              className={cn(
                "mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
                SAGE_BORDER,
                "bg-[#f4f7f0]/80",
              )}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Revenue by product category
              </p>
              <div className="h-[220px] w-full min-w-0 sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={state.revenueByCategory}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={SAGE_LIGHT} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#3d4f36" }}
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#3d4f36" }}
                      tickFormatter={(v) => `R${v}`}
                      width={44}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatPriceZar(value), "Revenue"]}
                      contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                    />
                    <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                      {state.revenueByCategory.map((_, i) => (
                        <Cell
                          key={i}
                          fill={
                            i === 0 ? SAGE : i === 1 ? SAGE_DARK : i === 2 ? SAGE_LIGHT : "#94a3b8"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section>
            <h3
              className="mb-3 font-display text-sm font-bold uppercase tracking-wide"
              style={{ color: SAGE }}
            >
              Attendance
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total check-ins"
                value={state.checkIns.toLocaleString()}
                icon={<CalendarCheck className="h-4 w-4" />}
              />
              <StatCard
                label="Occupancy rate"
                value={state.occupancyPct == null ? "—" : `${state.occupancyPct}%`}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <StatCard
                label="Busiest day"
                value={state.busiestDay ?? "—"}
                icon={<CalendarCheck className="h-4 w-4" />}
              />
            </div>
            <div
              className={cn("mt-4 rounded-2xl border bg-card p-4", SAGE_BORDER, "bg-[#f4f7f0]/80")}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Most popular classes (by booked count)
              </p>
              {state.topClasses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No classes in this period.</p>
              ) : (
                <ol className="space-y-2">
                  {state.topClasses.map((c, i) => (
                    <li
                      key={`${c.name}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#c5d4b8]/60 bg-background/80 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">
                        <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                        {c.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {c.booked} / {c.capacity}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section>
            <h3
              className="mb-3 font-display text-sm font-bold uppercase tracking-wide"
              style={{ color: SAGE }}
            >
              Members
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="New signups"
                value={state.newSignups == null ? "—" : state.newSignups.toLocaleString()}
                icon={<UserPlus className="h-4 w-4" />}
              />
              <StatCard
                label="Active (credits left)"
                value={state.activeMembers == null ? "—" : state.activeMembers.toLocaleString()}
                icon={<Users className="h-4 w-4" />}
              />
              <StatCard
                label="Lapsed (0 credits)"
                value={state.lapsedMembers == null ? "—" : state.lapsedMembers.toLocaleString()}
                icon={<Users className="h-4 w-4" />}
              />
            </div>
          </section>

          <section>
            <h3
              className="mb-3 font-display text-sm font-bold uppercase tracking-wide"
              style={{ color: SAGE }}
            >
              Credits
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Credits expiring (30 days)"
                value={state.creditsExpiring30d.toLocaleString()}
                icon={<CreditCard className="h-4 w-4" />}
              />
            </div>
            <div
              className={cn(
                "mt-4 rounded-2xl border bg-card p-4 sm:p-5",
                SAGE_BORDER,
                "bg-[#f4f7f0]/80",
              )}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Credits sold vs used (period)
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Used = attended check-ins paid with a class credit for sessions in this period.
              </p>
              <div className="h-[200px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={creditsCompareData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={SAGE_LIGHT} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#3d4f36" }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#3d4f36" }}
                      allowDecimals={false}
                      width={36}
                    />
                    <Tooltip
                      formatter={(value: number) => [value.toLocaleString(), "Credits"]}
                      contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {creditsCompareData.map((_, index) => (
                        <Cell key={index} fill={index === 0 ? SAGE : SAGE_DARK} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
