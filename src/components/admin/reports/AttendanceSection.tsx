import { useEffect, useMemo, useState } from "react";
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
import { CalendarCheck, Download, TrendingUp, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { supabase } from "@/lib/supabase";
import { displayClassType } from "@/types/studio";
import { downloadReportCsv } from "@/lib/reportsCsv";
import type { PeriodBounds } from "@/lib/reportsPeriod";
import { STUDIO_TIMEZONE } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const SAGE = "#a3b693";
const SAGE_LIGHT = "#c5d4b8";
const SAGE_BORDER = "border-[#c5d4b8]/80";
const AMBER = "#f59e0b";
const RED = "#dc2626";

const HEATMAP_HOURS: readonly number[] = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
];
const WEEKDAY_LABELS_MON0 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type ClassRow = {
  id: string;
  name: string;
  class_type: string | null;
  capacity: number | null;
  starts_at: string;
};

type BookingRow = {
  id: string;
  class_id: string;
  status: string;
};

type SectionState = {
  loading: boolean;
  totalCheckIns: number;
  avgOccupancyPct: number | null;
  busiestDay: string | null;
  noShowPct: number | null;
  byClassType: { name: string; occupancy: number; sessions: number }[];
  byWeekday: { name: string; occupancy: number; attended: number }[];
  heatmap: number[][]; // [weekday 0..6][hourIdx 0..HEATMAP_HOURS.length]
  heatmapMax: number;
  topClasses: { name: string; attended: number; capacity: number; sessions: number }[];
  errorMsg: string | null;
};

const EMPTY: SectionState = {
  loading: true,
  totalCheckIns: 0,
  avgOccupancyPct: null,
  busiestDay: null,
  noShowPct: null,
  byClassType: [],
  byWeekday: WEEKDAY_LABELS_MON0.map((d) => ({ name: d, occupancy: 0, attended: 0 })),
  heatmap: Array.from({ length: 7 }, () => Array(HEATMAP_HOURS.length).fill(0)),
  heatmapMax: 0,
  topClasses: [],
  errorMsg: null,
};

const HOUR_INDEX = new Map<number, number>(HEATMAP_HOURS.map((h, i) => [h, i]));

/** Returns { weekdayMon0, hour } in JHB for an instant ISO. */
function jhbWeekdayHour(iso: string): { weekday: number; hour: number } {
  const dt = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(dt);
  const hourPart = parts.find((p) => p.type === "hour");
  const weekdayPart = parts.find((p) => p.type === "weekday");
  const hourRaw = Number(hourPart?.value ?? 0);
  const hour = Number.isFinite(hourRaw) ? hourRaw % 24 : 0;
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const weekday = map[weekdayPart?.value ?? "Mon"] ?? 0;
  return { weekday, hour };
}

async function fetchAttendanceBookings(classIds: string[]): Promise<BookingRow[]> {
  if (classIds.length === 0) return [];
  const chunk = 180;
  const all: BookingRow[] = [];
  for (let i = 0; i < classIds.length; i += chunk) {
    const slice = classIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("bookings")
      .select("id, class_id, status")
      .in("class_id", slice)
      .in("status", ["confirmed", "attended"]);
    if (error) {
      console.error("attendance bookings chunk", error);
      continue;
    }
    all.push(...((data ?? []) as BookingRow[]));
  }
  return all;
}

function sageScale(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "#f4f7f0";
  const t = Math.min(1, value / max);
  // light -> sage gradient
  const fromR = 244, fromG = 247, fromB = 240;
  const toR = 0x7d, toG = 0x92, toB = 0x68; // SAGE_DARK
  const r = Math.round(fromR + (toR - fromR) * t);
  const g = Math.round(fromG + (toG - fromG) * t);
  const b = Math.round(fromB + (toB - fromB) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function AttendanceSection({ bounds }: { bounds: PeriodBounds }) {
  const [state, setState] = useState<SectionState>(EMPTY);
  const { startUtcIso, endUtcIso } = bounds;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, errorMsg: null }));

    void (async () => {
      const nowMs = Date.now();

      const classesRes = await supabase
        .from("classes")
        .select("id, name, class_type, capacity, starts_at")
        .gte("starts_at", startUtcIso)
        .lte("starts_at", endUtcIso)
        .eq("is_cancelled", false);

      if (cancelled) return;

      if (classesRes.error) {
        console.error("attendance classes", classesRes.error);
        setState((s) => ({ ...s, loading: false, errorMsg: classesRes.error?.message ?? null }));
        return;
      }

      const classes = (classesRes.data ?? []) as ClassRow[];
      const classIds = classes.map((c) => c.id);
      const bookings = await fetchAttendanceBookings(classIds);
      if (cancelled) return;

      // Per-class counts: total booked (confirmed + attended) and attended only.
      const bookedPerClass = new Map<string, number>();
      const attendedPerClass = new Map<string, number>();
      for (const b of bookings) {
        bookedPerClass.set(b.class_id, (bookedPerClass.get(b.class_id) ?? 0) + 1);
        if (b.status === "attended") {
          attendedPerClass.set(b.class_id, (attendedPerClass.get(b.class_id) ?? 0) + 1);
        }
      }

      // Total check-ins.
      let totalCheckIns = 0;
      for (const n of attendedPerClass.values()) totalCheckIns += n;

      // Average occupancy across classes with capacity > 0.
      let occSum = 0;
      let occCount = 0;
      for (const c of classes) {
        const cap = Number(c.capacity ?? 0);
        if (cap <= 0) continue;
        const booked = bookedPerClass.get(c.id) ?? 0;
        occSum += (booked / cap) * 100;
        occCount += 1;
      }
      const avgOccupancyPct = occCount > 0 ? Math.round(occSum / occCount) : null;

      // No-show rate (past classes only).
      let pastBooked = 0;
      let pastAttended = 0;
      for (const c of classes) {
        const ms = Date.parse(c.starts_at);
        if (!Number.isFinite(ms) || ms > nowMs) continue;
        pastBooked += bookedPerClass.get(c.id) ?? 0;
        pastAttended += attendedPerClass.get(c.id) ?? 0;
      }
      const noShowPct = pastBooked > 0
        ? Math.round(((pastBooked - pastAttended) / pastBooked) * 100)
        : null;

      // By class type: weighted occupancy.
      const typeCapSum = new Map<string, number>();
      const typeBookedSum = new Map<string, number>();
      const typeSessions = new Map<string, number>();
      for (const c of classes) {
        const cap = Number(c.capacity ?? 0);
        if (cap <= 0) continue;
        const t = displayClassType(c.class_type);
        typeCapSum.set(t, (typeCapSum.get(t) ?? 0) + cap);
        typeBookedSum.set(t, (typeBookedSum.get(t) ?? 0) + (bookedPerClass.get(c.id) ?? 0));
        typeSessions.set(t, (typeSessions.get(t) ?? 0) + 1);
      }
      const byClassType = [...typeCapSum.entries()]
        .map(([name, capSum]) => {
          const booked = typeBookedSum.get(name) ?? 0;
          const occupancy = capSum > 0 ? Math.round((booked / capSum) * 100) : 0;
          return { name, occupancy, sessions: typeSessions.get(name) ?? 0 };
        })
        .sort((a, b) => b.occupancy - a.occupancy);

      // By weekday (JHB) — sum attended + cap by weekday so occupancy is weighted.
      const weekdayAttended = Array(7).fill(0);
      const weekdayCap = Array(7).fill(0);
      const weekdayBooked = Array(7).fill(0);
      for (const c of classes) {
        const { weekday } = jhbWeekdayHour(c.starts_at);
        const cap = Number(c.capacity ?? 0);
        const booked = bookedPerClass.get(c.id) ?? 0;
        const attended = attendedPerClass.get(c.id) ?? 0;
        weekdayCap[weekday] += cap;
        weekdayBooked[weekday] += booked;
        weekdayAttended[weekday] += attended;
      }
      const byWeekday = WEEKDAY_LABELS_MON0.map((name, i) => ({
        name,
        occupancy: weekdayCap[i] > 0 ? Math.round((weekdayBooked[i] / weekdayCap[i]) * 100) : 0,
        attended: weekdayAttended[i],
      }));

      // Busiest weekday = max attended.
      let bestDow = -1;
      let bestAttended = -1;
      for (let i = 0; i < 7; i++) {
        if (weekdayAttended[i] > bestAttended) {
          bestAttended = weekdayAttended[i];
          bestDow = i;
        }
      }
      const busiestDay =
        bestDow >= 0 && bestAttended > 0 ? WEEKDAY_LABELS_MON0[bestDow] : null;

      // Heatmap: [weekday][hourIdx] attended count.
      const heatmap: number[][] = Array.from({ length: 7 }, () =>
        Array(HEATMAP_HOURS.length).fill(0),
      );
      let heatmapMax = 0;
      for (const c of classes) {
        const { weekday, hour } = jhbWeekdayHour(c.starts_at);
        const idx = HOUR_INDEX.get(hour);
        if (idx == null) continue;
        const attended = attendedPerClass.get(c.id) ?? 0;
        heatmap[weekday][idx] += attended;
        if (heatmap[weekday][idx] > heatmapMax) heatmapMax = heatmap[weekday][idx];
      }

      // Top classes (group by name + class_type so recurring sessions roll up).
      const grouped = new Map<
        string,
        { name: string; attended: number; capacity: number; sessions: number }
      >();
      for (const c of classes) {
        const key = `${c.name}__${displayClassType(c.class_type)}`;
        const entry = grouped.get(key) ?? {
          name: c.name,
          attended: 0,
          capacity: 0,
          sessions: 0,
        };
        entry.attended += attendedPerClass.get(c.id) ?? 0;
        entry.capacity += Number(c.capacity ?? 0);
        entry.sessions += 1;
        grouped.set(key, entry);
      }
      const topClasses = [...grouped.values()]
        .sort((a, b) => b.attended - a.attended || b.capacity - a.capacity)
        .slice(0, 10);

      setState({
        loading: false,
        totalCheckIns,
        avgOccupancyPct,
        busiestDay,
        noShowPct,
        byClassType,
        byWeekday,
        heatmap,
        heatmapMax,
        topClasses,
        errorMsg: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [startUtcIso, endUtcIso]);

  const exportTopClassesCsv = () => {
    const header = ["Rank", "Class", "Sessions", "Attended", "Capacity (sum)"];
    const body = state.topClasses.map((c, i) => [
      i + 1,
      c.name,
      c.sessions,
      c.attended,
      c.capacity,
    ]);
    downloadReportCsv(
      `top-classes-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...body],
    );
  };

  const occupancyColor = (pct: number) =>
    pct >= 100 ? RED : pct >= 80 ? AMBER : SAGE;

  return (
    <section>
      <h3
        className="mb-3 font-display text-sm font-bold uppercase tracking-wide"
        style={{ color: SAGE }}
      >
        Attendance & Occupancy
      </h3>

      {state.errorMsg ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.errorMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {state.loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total check-ins"
              value={state.totalCheckIns.toLocaleString()}
              icon={<CalendarCheck className="h-4 w-4" />}
            />
            <StatCard
              label="Avg occupancy"
              value={state.avgOccupancyPct == null ? "—" : `${state.avgOccupancyPct}%`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Busiest day"
              value={state.busiestDay ?? "—"}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="No-show rate"
              value={state.noShowPct == null ? "—" : `${state.noShowPct}%`}
              icon={<UserMinus className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Occupancy uses a live count of confirmed + attended bookings vs capacity, not the cached
        classes.booked_count. No-show rate is computed only over classes whose start time has passed.
      </p>

      {/* Charts row: occupancy by class type + by weekday */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className={cn(
            "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
            SAGE_BORDER,
            "bg-[#f4f7f0]/80",
          )}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Occupancy by class type
          </p>
          {state.loading ? (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          ) : state.byClassType.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No data in this period.</p>
          ) : (
            <div className="h-[240px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={state.byClassType}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={SAGE_LIGHT} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#3d4f36" }}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#3d4f36" }}
                    tickFormatter={(v) => `${v}%`}
                    width={42}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Occupancy"]}
                    contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                  />
                  <Bar dataKey="occupancy" radius={[6, 6, 0, 0]}>
                    {state.byClassType.map((d, i) => (
                      <Cell key={i} fill={occupancyColor(d.occupancy)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
            Occupancy by day of week
          </p>
          {state.loading ? (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          ) : (
            <div className="h-[240px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={state.byWeekday}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={SAGE_LIGHT} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#3d4f36" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#3d4f36" }}
                    tickFormatter={(v) => `${v}%`}
                    width={42}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number, _name, ctx) => {
                      const row = ctx?.payload as { attended?: number } | undefined;
                      return [
                        `${value}% · ${row?.attended ?? 0} attended`,
                        "Occupancy",
                      ];
                    }}
                    contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                  />
                  <Bar dataKey="occupancy" radius={[6, 6, 0, 0]}>
                    {state.byWeekday.map((d, i) => (
                      <Cell key={i} fill={occupancyColor(d.occupancy)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div
        className={cn(
          "mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Check-ins by day × hour (JHB)
        </p>
        {state.loading ? (
          <Skeleton className="h-[200px] w-full rounded-xl" />
        ) : (
          <div className="overflow-x-auto">
            <div
              className="inline-grid gap-[2px] text-[10px] tabular-nums"
              style={{
                gridTemplateColumns: `48px repeat(${HEATMAP_HOURS.length}, minmax(28px, 1fr))`,
              }}
            >
              <span aria-hidden />
              {HEATMAP_HOURS.map((h) => (
                <span
                  key={`h-${h}`}
                  className="px-1 py-1 text-center text-muted-foreground"
                  title={formatHour(h)}
                >
                  {h.toString().padStart(2, "0")}
                </span>
              ))}
              {WEEKDAY_LABELS_MON0.map((wd, wdi) => (
                <>
                  <span
                    key={`wd-${wdi}`}
                    className="px-1 py-1 text-right font-semibold text-muted-foreground"
                  >
                    {wd}
                  </span>
                  {HEATMAP_HOURS.map((h, hi) => {
                    const v = state.heatmap[wdi]?.[hi] ?? 0;
                    return (
                      <span
                        key={`c-${wdi}-${hi}`}
                        className="flex h-7 items-center justify-center rounded-sm text-[10px] font-semibold"
                        style={{
                          backgroundColor: sageScale(v, state.heatmapMax),
                          color: v > state.heatmapMax * 0.55 ? "#f8faf6" : "#3d4f36",
                        }}
                        title={`${wd} ${formatHour(h)} — ${v} check-in${v === 1 ? "" : "s"}`}
                      >
                        {v || ""}
                      </span>
                    );
                  })}
                </>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Darker cells = more attendees. Max in period: {state.heatmapMax}.
            </p>
          </div>
        )}
      </div>

      {/* Top classes table */}
      <div
        className={cn(
          "mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Most popular classes (top 10 by attendance)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={exportTopClassesCsv}
            disabled={state.loading || state.topClasses.length === 0}
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
        ) : state.topClasses.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No attendance in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Class</th>
                  <th className="px-2 py-2 text-right font-medium">Sessions</th>
                  <th className="px-2 py-2 text-right font-medium">Attended</th>
                  <th className="px-2 py-2 text-right font-medium">Capacity</th>
                </tr>
              </thead>
              <tbody>
                {state.topClasses.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className="border-t border-[#c5d4b8]/40">
                    <td className="px-2 py-2 font-medium">
                      <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                      {c.name}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{c.sessions}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{c.attended}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{c.capacity}</td>
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
