import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Percent, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const TZ = "Africa/Johannesburg";

type TodayClassRow = {
  id: string;
  name: string;
  starts_at: string;
  booked_count: number;
  capacity: number;
  guide_name: string | null;
};

function AdminDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </>
  );
}

// Africa/Johannesburg is UTC+2 with no DST, so we can derive day boundaries reliably.
function jhbDayBounds(): { startUtcIso: string; endUtcIso: string; dateKey: string } {
  const now = new Date();
  const jhbNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const y = jhbNow.getFullYear();
  const m = jhbNow.getMonth();
  const d = jhbNow.getDate();
  // 00:00 JHB = 22:00 UTC previous day
  const startUtc = new Date(Date.UTC(y, m, d, -2, 0, 0, 0));
  const endUtc = new Date(Date.UTC(y, m, d + 1, -2, 0, 0, -1));
  const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { startUtcIso: startUtc.toISOString(), endUtcIso: endUtc.toISOString(), dateKey };
}

function AdminDashboard() {
  const [classes, setClasses] = useState<TodayClassRow[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [signInsToday, setSignInsToday] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { startUtcIso, endUtcIso } = jhbDayBounds();

      const [classesRes, memberRes, signInsRes] = await Promise.all([
        supabase
          .from("classes")
          .select("id, name, starts_at, booked_count, capacity, guide_name")
          .gte("starts_at", startUtcIso)
          .lte("starts_at", endUtcIso)
          .eq("is_cancelled", false)
          .order("starts_at"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "customer"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("checked_in", true)
          .gte("checked_in_at", startUtcIso)
          .lte("checked_in_at", endUtcIso),
      ]);

      if (classesRes.error) console.error("admin dashboard classes", classesRes.error);
      if (memberRes.error) console.error("admin dashboard member count", memberRes.error);
      if (signInsRes.error) console.error("admin dashboard sign-ins", signInsRes.error);

      if (classesRes.error || memberRes.error || signInsRes.error) {
        const firstErr = classesRes.error ?? memberRes.error ?? signInsRes.error;
        setErrorMsg(supabaseErrorMessage(firstErr, "Could not load dashboard data."));
      }

      setClasses((classesRes.data ?? []) as TodayClassRow[]);
      setMemberCount(memberRes.count ?? 0);
      setSignInsToday(signInsRes.count ?? 0);
    } catch (error) {
      console.error("admin dashboard load failed", error);
      setClasses([]);
      setMemberCount(0);
      setSignInsToday(0);
      setErrorMsg(supabaseErrorMessage(error, "Could not load dashboard data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const classCount = classes.length;
  const occPcts = classes
    .filter((c) => c.capacity > 0)
    .map((c) => (c.booked_count / c.capacity) * 100);
  const avgOcc =
    occPcts.length > 0 ? Math.round(occPcts.reduce((a, b) => a + b, 0) / occPcts.length) : 0;

  const todayLabel = new Date().toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  });

  return (
    <div>
      <PageHeader title="Dashboard" description={todayLabel} />

      {loading ? (
        <AdminDashboardSkeleton />
      ) : (
        <>
          {errorMsg ? (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Could not load all dashboard data: {errorMsg}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total Sign-ins Today"
              value={signInsToday.toLocaleString()}
              icon={<UserCheck className="h-4 w-4" />}
            />
            <StatCard
              label="Classes Today"
              value={classCount.toLocaleString()}
              icon={<CalendarDays className="h-4 w-4" />}
            />
            <StatCard
              label="Avg Occupancy %"
              value={`${avgOcc}%`}
              icon={<Percent className="h-4 w-4" />}
            />
            <StatCard
              label="Total Members"
              value={(memberCount ?? 0).toLocaleString()}
              icon={<Users className="h-4 w-4" />}
            />
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-display text-lg font-semibold">{"Today's classes"}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Time</th>
                    <th className="px-5 py-3 font-medium">Class name</th>
                    <th className="px-5 py-3 font-medium">Guide</th>
                    <th className="px-5 py-3 font-medium">Booked / Capacity</th>
                    <th className="px-5 py-3 font-medium min-w-[140px]">Occupancy</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                        No classes scheduled for today.
                      </td>
                    </tr>
                  ) : (
                    classes.map((c) => {
                      const pct =
                        c.capacity > 0
                          ? Math.min(100, Math.round((c.booked_count / c.capacity) * 100))
                          : 0;
                      const time = new Date(c.starts_at)
                        .toLocaleTimeString("en-ZA", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                          timeZone: TZ,
                        })
                        .toUpperCase();
                      const guide = c.guide_name?.trim() || "—";
                      return (
                        <tr key={c.id} className="border-t border-border">
                          <td className="whitespace-nowrap px-5 py-3 font-medium tabular-nums">
                            {time}
                          </td>
                          <td className="px-5 py-3 font-medium">{c.name}</td>
                          <td className="px-5 py-3 text-muted-foreground">{guide}</td>
                          <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                            {c.booked_count} / {c.capacity}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    pct >= 100
                                      ? "bg-destructive"
                                      : pct >= 80
                                        ? "bg-warning"
                                        : "bg-primary",
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
