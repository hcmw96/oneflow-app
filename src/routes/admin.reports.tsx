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
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { PeriodToggle } from "@/components/admin/reports/PeriodToggle";
import { RevenueSection } from "@/components/admin/reports/RevenueSection";
import { AttendanceSection } from "@/components/admin/reports/AttendanceSection";
import { MembersSection } from "@/components/admin/reports/MembersSection";
import { GuidesSection } from "@/components/admin/reports/GuidesSection";
import { supabase } from "@/lib/supabase";
import {
  jhbPeriodBounds,
  type PeriodBounds,
  type PeriodMode,
} from "@/lib/reportsPeriod";
import { STUDIO_TIMEZONE, todayDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [{ title: "Reports — One Flow Admin" }],
  }),
  component: ReportsPage,
});

const SAGE = "#a3b693";
const SAGE_DARK = "#7d9268";
const SAGE_LIGHT = "#c5d4b8";
const SAGE_BORDER = "border-[#c5d4b8]/80";

type LegacyState = {
  loading: boolean;
  creditsSoldUnits: number;
  creditsUsedProxy: number;
  creditsExpiring30d: number;
};

const EMPTY_LEGACY: LegacyState = {
  loading: true,
  creditsSoldUnits: 0,
  creditsUsedProxy: 0,
  creditsExpiring30d: 0,
};

function ReportsPage() {
  const [mode, setMode] = useState<PeriodMode>("weekly");
  const today = useMemo(() => todayDateKey(STUDIO_TIMEZONE), []);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [state, setState] = useState<LegacyState>(EMPTY_LEGACY);

  const bounds: PeriodBounds = useMemo(
    () => jhbPeriodBounds(mode, { fromDateKey: customFrom, toDateKey: customTo }),
    [mode, customFrom, customTo],
  );

  const load = useCallback(async () => {
    const { startUtcIso, endUtcIso } = bounds;
    setState((s) => ({ ...s, loading: true }));

    const now = new Date();
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);

    const [expiringRes, creditsSoldRes, attendedCreditCountRes] = await Promise.all([
      supabase
        .from("user_credits")
        .select("credits_remaining")
        .gt("credits_remaining", 0)
        .gte("expires_at", now.toISOString())
        .lte("expires_at", in30.toISOString())
        .is("refunded_at", null),
      supabase
        .from("user_credits")
        .select("credits_total")
        .gte("purchased_at", startUtcIso)
        .lte("purchased_at", endUtcIso)
        .is("refunded_at", null),
      supabase
        .from("bookings")
        .select("id, classes!inner(starts_at)", { count: "exact", head: true })
        .eq("status", "attended")
        .eq("payment_method", "credit")
        .gte("classes.starts_at", startUtcIso)
        .lte("classes.starts_at", endUtcIso),
    ]);

    if (expiringRes.error) console.error("reports expiring", expiringRes.error);
    if (creditsSoldRes.error) console.error("reports credits sold", creditsSoldRes.error);
    if (attendedCreditCountRes.error)
      console.error("reports credits used proxy", attendedCreditCountRes.error);

    let creditsSoldUnits = 0;
    for (const row of creditsSoldRes.data ?? []) {
      const n = Number((row as { credits_total?: number | null }).credits_total);
      creditsSoldUnits += Number.isFinite(n) ? n : 0;
    }

    const creditsExpiring30d = (expiringRes.data ?? []).reduce(
      (acc, r: { credits_remaining: number | null }) => acc + (Number(r.credits_remaining) || 0),
      0,
    );

    setState({
      loading: false,
      creditsSoldUnits,
      creditsUsedProxy: attendedCreditCountRes.count ?? 0,
      creditsExpiring30d,
    });
  }, [bounds]);

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
        description={state.loading ? "Loading metrics…" : bounds.label}
        meta={
          <PeriodToggle
            mode={mode}
            customFrom={customFrom}
            customTo={customTo}
            onModeChange={setMode}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        }
      />

      <div className="space-y-10">
        {/* Section 1: Revenue & Sales (rebuilt — runs its own queries) */}
        <RevenueSection bounds={bounds} />

        {/* Section 2: Attendance & Occupancy (rebuilt — runs its own queries) */}
        <AttendanceSection bounds={bounds} />

        {/* Section 3: Members & Retention (rebuilt — runs its own queries) */}
        <MembersSection bounds={bounds} />

        {/* Section 4: Guides / Instructors (rebuilt — runs its own queries) */}
        <GuidesSection bounds={bounds} />

        {/* Credits (legacy until rebuild approval) */}
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
                <BarChart data={creditsCompareData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
    </div>
  );
}
