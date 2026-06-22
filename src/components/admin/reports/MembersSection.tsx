import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, UserMinus, UserPlus, Users, UserX, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { BOOKABLE_MEMBER_OR_FILTER } from "@/lib/bookableMembers";
import { supabase } from "@/lib/supabase";
import { downloadReportCsv } from "@/lib/reportsCsv";
import type { PeriodBounds } from "@/lib/reportsPeriod";
import { cn } from "@/lib/utils";

const SAGE = "#a3b693";
const SAGE_DARK = "#7d9268";
const SAGE_LIGHT = "#c5d4b8";
const SAGE_BORDER = "border-[#c5d4b8]/80";
const AMBER = "#f59e0b";
const RED = "#dc2626";

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: string | null;
};

type CreditRow = {
  profile_id: string;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
};

type AttendanceRow = {
  profile_id: string | null;
  checked_in_at: string | null;
};

type LtvRow = {
  profile_id: string | null;
  products?:
    | { price_zar: number | null }
    | { price_zar: number | null }[]
    | null;
};

type SegmentRow = {
  id: string;
  name: string;
  email: string;
  lastAttended: string | null;
  daysSince: number | null;
};

type SectionState = {
  loading: boolean;
  newSignups: number;
  totalCustomers: number;
  activeCount: number;
  lapsedCount: number;
  churnedCount: number;
  avgLtv: number;
  segments: { name: string; value: number; color: string }[];
  frequency: { name: string; value: number }[];
  lapsedRows: SegmentRow[];
  churnedRows: SegmentRow[];
  topLtvRows: { name: string; email: string; ltv: number }[];
  errorMsg: string | null;
};

const EMPTY: SectionState = {
  loading: true,
  newSignups: 0,
  totalCustomers: 0,
  activeCount: 0,
  lapsedCount: 0,
  churnedCount: 0,
  avgLtv: 0,
  segments: [],
  frequency: [
    { name: "1× / week", value: 0 },
    { name: "2–3× / week", value: 0 },
    { name: "4+× / week", value: 0 },
  ],
  lapsedRows: [],
  churnedRows: [],
  topLtvRows: [],
  errorMsg: null,
};

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function fullName(c: CustomerRow): string {
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return n || c.email || "—";
}

function formatRand(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MembersSection({ bounds }: { bounds: PeriodBounds }) {
  const [state, setState] = useState<SectionState>(EMPTY);
  const { startUtcIso, endUtcIso } = bounds;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, errorMsg: null }));

    void (async () => {
      const now = Date.now();
      const days30 = now - 30 * 86400_000;
      const days60 = now - 60 * 86400_000;
      const attendanceWindowStart = new Date(now - 90 * 86400_000).toISOString();
      const fourWeeksAgoStart = new Date(now - 28 * 86400_000).toISOString();

      const [customersRes, creditsRes, attendanceRes, ltvRes] = await Promise.all([
        // Customers (includes staff with secondary_roles: ['customer']).
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, created_at")
          .or(BOOKABLE_MEMBER_OR_FILTER),
        // Active credits (refunded rows excluded).
        supabase
          .from("user_credits")
          .select("profile_id, credits_remaining, is_unlimited, expires_at")
          .is("refunded_at", null),
        // Attendance over the last 90 days drives active/lapsed/churned + frequency.
        supabase
          .from("bookings")
          .select("profile_id, checked_in_at")
          .eq("status", "attended")
          .not("checked_in_at", "is", null)
          .gte("checked_in_at", attendanceWindowStart),
        // Lifetime purchases joined to products(price_zar) for LTV.
        supabase
          .from("user_credits")
          .select("profile_id, products ( price_zar )")
          .is("refunded_at", null),
      ]);

      if (cancelled) return;

      if (customersRes.error) console.error("members customers", customersRes.error);
      if (creditsRes.error) console.error("members credits", creditsRes.error);
      if (attendanceRes.error) console.error("members attendance", attendanceRes.error);
      if (ltvRes.error) console.error("members ltv", ltvRes.error);

      const firstErr =
        customersRes.error ?? creditsRes.error ?? attendanceRes.error ?? ltvRes.error ?? null;

      const customers = (customersRes.data ?? []) as CustomerRow[];

      // hasActiveCredits[id]
      const hasActiveCredits = new Set<string>();
      for (const row of (creditsRes.data ?? []) as CreditRow[]) {
        const pid = row.profile_id;
        if (!pid) continue;
        const exp = row.expires_at ? Date.parse(row.expires_at) : Number.POSITIVE_INFINITY;
        if (Number.isFinite(exp) && exp < now) continue;
        if (row.is_unlimited || Number(row.credits_remaining ?? 0) > 0) {
          hasActiveCredits.add(pid);
        }
      }

      // lastAttended[id] + attended-in-last-4-weeks count for frequency.
      const lastAttended = new Map<string, number>();
      const lastFourWeekVisits = new Map<string, number>();
      const fourWeeksAgoMs = Date.parse(fourWeeksAgoStart);
      for (const row of (attendanceRes.data ?? []) as AttendanceRow[]) {
        const pid = row.profile_id;
        const ts = row.checked_in_at;
        if (!pid || !ts) continue;
        const ms = Date.parse(ts);
        if (!Number.isFinite(ms)) continue;
        const prev = lastAttended.get(pid) ?? 0;
        if (ms > prev) lastAttended.set(pid, ms);
        if (ms >= fourWeeksAgoMs) {
          lastFourWeekVisits.set(pid, (lastFourWeekVisits.get(pid) ?? 0) + 1);
        }
      }

      // ltvByProfile[id]
      const ltvByProfile = new Map<string, number>();
      for (const row of (ltvRes.data ?? []) as LtvRow[]) {
        const pid = row.profile_id;
        if (!pid) continue;
        const prod = pickOne(row.products);
        const price = Number(prod?.price_zar ?? 0) || 0;
        ltvByProfile.set(pid, (ltvByProfile.get(pid) ?? 0) + price);
      }

      // Bucket each customer.
      let active = 0;
      let lapsed = 0;
      let churned = 0;
      const lapsedRows: SegmentRow[] = [];
      const churnedRows: SegmentRow[] = [];

      // New signups in period.
      let newSignups = 0;

      // Frequency buckets, summed across active members only.
      let freq1 = 0;
      let freq23 = 0;
      let freq4plus = 0;

      for (const c of customers) {
        if (c.created_at && c.created_at >= startUtcIso && c.created_at <= endUtcIso) {
          newSignups += 1;
        }

        const last = lastAttended.get(c.id) ?? null;
        const hasCredits = hasActiveCredits.has(c.id);
        const isActive = hasCredits || (last !== null && last >= days30);

        if (isActive) {
          active += 1;
          const visits = lastFourWeekVisits.get(c.id) ?? 0;
          // visits over 4 weeks → per-week rate
          const perWeek = visits / 4;
          if (perWeek >= 4) freq4plus += 1;
          else if (perWeek >= 2) freq23 += 1;
          else if (perWeek >= 0.5) freq1 += 1; // ~2 visits in 4 weeks = "~1×/week"
        } else if (last !== null && last >= days60 && last < days30) {
          lapsed += 1;
          lapsedRows.push({
            id: c.id,
            name: fullName(c),
            email: c.email ?? "",
            lastAttended: new Date(last).toISOString(),
            daysSince: Math.floor((now - last) / 86400_000),
          });
        } else {
          churned += 1;
          if (last !== null) {
            churnedRows.push({
              id: c.id,
              name: fullName(c),
              email: c.email ?? "",
              lastAttended: new Date(last).toISOString(),
              daysSince: Math.floor((now - last) / 86400_000),
            });
          } else {
            // never attended — still churned if no credits + no attendance
            churnedRows.push({
              id: c.id,
              name: fullName(c),
              email: c.email ?? "",
              lastAttended: null,
              daysSince: null,
            });
          }
        }
      }

      lapsedRows.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
      churnedRows.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));

      // Top 10 LTV among customers (skip zero-LTV).
      const topLtvRows = customers
        .map((c) => ({
          name: fullName(c),
          email: c.email ?? "",
          ltv: ltvByProfile.get(c.id) ?? 0,
        }))
        .filter((r) => r.ltv > 0)
        .sort((a, b) => b.ltv - a.ltv)
        .slice(0, 10);

      const totalLtv = [...ltvByProfile.values()].reduce((acc, v) => acc + v, 0);
      const ltvDenom = [...ltvByProfile.values()].filter((v) => v > 0).length;
      const avgLtv = ltvDenom > 0 ? totalLtv / ltvDenom : 0;

      setState({
        loading: false,
        newSignups,
        totalCustomers: customers.length,
        activeCount: active,
        lapsedCount: lapsed,
        churnedCount: churned,
        avgLtv,
        segments: [
          { name: "Active", value: active, color: SAGE },
          { name: "Lapsed", value: lapsed, color: AMBER },
          { name: "Churned", value: churned, color: RED },
        ],
        frequency: [
          { name: "1× / week", value: freq1 },
          { name: "2–3× / week", value: freq23 },
          { name: "4+× / week", value: freq4plus },
        ],
        lapsedRows,
        churnedRows,
        topLtvRows,
        errorMsg: firstErr ? firstErr.message : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [startUtcIso, endUtcIso]);

  const exportSegmentCsv = (rows: SegmentRow[], filename: string) => {
    const header = ["Name", "Email", "Last attended", "Days since last visit"];
    const body = rows.map((r) => [
      r.name,
      r.email,
      r.lastAttended ? shortDate(r.lastAttended) : "—",
      r.daysSince == null ? "" : r.daysSince,
    ]);
    downloadReportCsv(`${filename}-${new Date().toISOString().slice(0, 10)}.csv`, [
      header,
      ...body,
    ]);
  };

  const exportLtvCsv = () => {
    const header = ["Rank", "Name", "Email", "Lifetime value (ZAR)"];
    const body = state.topLtvRows.map((r, i) => [i + 1, r.name, r.email, Math.round(r.ltv)]);
    downloadReportCsv(`top-ltv-${new Date().toISOString().slice(0, 10)}.csv`, [
      header,
      ...body,
    ]);
  };

  return (
    <section>
      <h3
        className="mb-3 font-display text-sm font-bold uppercase tracking-wide"
        style={{ color: SAGE }}
      >
        Members & Retention
      </h3>

      {state.errorMsg ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.errorMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {state.loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="New signups"
              value={state.newSignups.toLocaleString()}
              icon={<UserPlus className="h-4 w-4" />}
            />
            <StatCard
              label="Active"
              value={state.activeCount.toLocaleString()}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Lapsed (30–60d)"
              value={state.lapsedCount.toLocaleString()}
              icon={<UserMinus className="h-4 w-4" />}
            />
            <StatCard
              label="Churned (60d+)"
              value={state.churnedCount.toLocaleString()}
              icon={<UserX className="h-4 w-4" />}
            />
            <StatCard
              label="Avg lifetime value"
              value={formatRand(state.avgLtv)}
              icon={<Wallet className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Active = has unused credits OR attended in last 30 days. Lapsed = last attendance between 30
        and 60 days ago. Churned = no attendance in the past 60 days. LTV = sum of pack prices the
        member has paid for (refunded packs excluded).
      </p>

      {/* Distribution charts */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className={cn(
            "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
            SAGE_BORDER,
            "bg-[#f4f7f0]/80",
          )}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Member status breakdown
          </p>
          {state.loading ? (
            <Skeleton className="h-[220px] w-full rounded-xl" />
          ) : state.totalCustomers === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No customers yet.</p>
          ) : (
            <div className="h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={state.segments}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {state.segments.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name) => [`${value} members`, name]}
                    contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
                {state.segments.map((s) => (
                  <span key={s.name} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}: <span className="font-semibold tabular-nums">{s.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className={cn(
            "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
            SAGE_BORDER,
            "bg-[#f4f7f0]/80",
          )}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Visit frequency (active members, last 4 weeks)
          </p>
          {state.loading ? (
            <Skeleton className="h-[220px] w-full rounded-xl" />
          ) : (
            <div className="h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={state.frequency}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#3d4f36" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#3d4f36" }}
                    allowDecimals={false}
                    width={36}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value} members`, "Frequency"]}
                    contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={SAGE_DARK} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Win-back tables */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {([
          {
            title: `Lapsed (${state.lapsedRows.length})`,
            rows: state.lapsedRows,
            filename: "lapsed-members",
            tone: "border-orange-200/60 bg-orange-50/30",
          },
          {
            title: `Churned (${state.churnedRows.length})`,
            rows: state.churnedRows,
            filename: "churned-members",
            tone: "border-rose-200/60 bg-rose-50/30",
          },
        ] as const).map((bucket) => (
          <div
            key={bucket.filename}
            className={cn(
              "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
              bucket.tone,
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {bucket.title}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => exportSegmentCsv([...bucket.rows], bucket.filename)}
                disabled={state.loading || bucket.rows.length === 0}
              >
                <Download className="h-3 w-3" /> CSV
              </Button>
            </div>
            {state.loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : bucket.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nobody in this bucket — nice.
              </p>
            ) : (
              <div className="max-h-[260px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">Member</th>
                      <th className="px-2 py-2 font-medium">Last visit</th>
                      <th className="px-2 py-2 text-right font-medium">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.rows.slice(0, 25).map((r) => (
                      <tr key={r.id} className="border-t border-[#c5d4b8]/40">
                        <td className="px-2 py-2 font-medium">
                          {r.name}
                          {r.email ? (
                            <span className="ml-1 block text-[10px] text-muted-foreground">
                              {r.email}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {r.lastAttended ? shortDate(r.lastAttended) : "Never"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.daysSince == null ? "—" : r.daysSince}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bucket.rows.length > 25 ? (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    Showing 25 of {bucket.rows.length}. Use CSV to see all.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Top 10 LTV */}
      <div
        className={cn(
          "mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Top 10 lifetime value
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={exportLtvCsv}
            disabled={state.loading || state.topLtvRows.length === 0}
          >
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>
        {state.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : state.topLtvRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Member</th>
                  <th className="px-2 py-2 text-right font-medium">Lifetime value</th>
                </tr>
              </thead>
              <tbody>
                {state.topLtvRows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-t border-[#c5d4b8]/40">
                    <td className="px-2 py-2 font-medium">
                      <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                      {r.name}
                      {r.email ? (
                        <span className="ml-1 block text-[10px] text-muted-foreground">
                          {r.email}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatRand(r.ltv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
