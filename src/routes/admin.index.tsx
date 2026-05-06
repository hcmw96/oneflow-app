import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Percent, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

type GuideJoin = {
  profiles:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
} | null;

type TodayClassRow = {
  id: string;
  name: string;
  starts_at: string;
  booked_count: number;
  capacity: number;
  guides: GuideJoin | GuideJoin[] | null;
};

function guideLabel(guides: TodayClassRow["guides"]): string {
  if (!guides) return "—";
  const g = Array.isArray(guides) ? guides[0] : guides;
  if (!g?.profiles) return "—";
  const p = Array.isArray(g.profiles) ? g.profiles[0] : g.profiles;
  if (!p) return "—";
  const name = `${p.first_name} ${p.last_name}`.trim();
  return name || "—";
}

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

function AdminDashboard() {
  const [classes, setClasses] = useState<TodayClassRow[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const day = new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const [{ data: classData, error: classError }, { count, error: countError }] =
      await Promise.all([
        supabase
          .from("classes")
          .select(
            "id, name, starts_at, booked_count, capacity, guides ( id, profiles ( first_name, last_name ) )",
          )
          .gte("starts_at", start.toISOString())
          .lte("starts_at", end.toISOString())
          .eq("is_cancelled", false)
          .order("starts_at"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "member"),
      ]);

    if (classError) console.error("admin dashboard classes", classError);
    if (countError) console.error("admin dashboard member count", countError);

    setClasses((classData ?? []) as TodayClassRow[]);
    setMemberCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSignIns = classes.reduce((sum, c) => sum + (c.booked_count ?? 0), 0);
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
  });

  return (
    <div>
      <PageHeader title="Dashboard" description={todayLabel} />

      {loading ? (
        <AdminDashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total Sign-ins Today"
              value={totalSignIns.toLocaleString()}
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
                        })
                        .toUpperCase();
                      return (
                        <tr key={c.id} className="border-t border-border">
                          <td className="whitespace-nowrap px-5 py-3 font-medium tabular-nums">
                            {time}
                          </td>
                          <td className="px-5 py-3 font-medium">{c.name}</td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {guideLabel(c.guides)}
                          </td>
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
