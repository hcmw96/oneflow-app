import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { ChallengeCheckIn, ChallengeType } from "@/types/studio";
import { displayClassType } from "@/types/studio";
import { cn } from "@/lib/utils";
import challengeBg from "@/assets/challenge-bg.jpg";
import { getUser, supabase } from "@/lib/supabase";
import { startOfDay } from "@/lib/format";

export const Route = createFileRoute("/challenge")({
  head: () => ({
    meta: [
      { title: "31 Days of Movement — One Flow" },
      {
        name: "description",
        content:
          "Track your May challenge: earn up to 2 stamps per day when you check in during May 2026.",
      },
      { property: "og:title", content: "31 Days of Movement — One Flow" },
      {
        property: "og:description",
        content: "Earn up to 2 stamps per day when you check in across May 2026.",
      },
    ],
  }),
  component: ChallengePage,
});

const CHALLENGE_YEAR = 2026;
const CHALLENGE_MONTH_INDEX = 4;
const MAY_START = "2026-05-01";
const MAY_END = "2026-05-31";
const TOTAL_DAYS = 31;
const SAGE = "#a3b693";

type CheckInApiRow = {
  id: string;
  class_date: string;
  booking_id: string;
  bookings: {
    id: string;
    classes:
      | { name: string; class_type: string | null }
      | { name: string; class_type: string | null }[]
      | null;
  } | null;
};

function oneBookingClass(
  bookings: CheckInApiRow["bookings"],
): { name: string; class_type: string | null } | null {
  if (!bookings?.classes) return null;
  const c = bookings.classes;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

function dayFromClassDate(classDate: string): number {
  const d = Number(classDate.slice(8, 10));
  return Number.isFinite(d) ? d : 0;
}

function mapRowToChallengeCheckIn(row: CheckInApiRow): ChallengeCheckIn {
  const cls = oneBookingClass(row.bookings);
  const label = displayClassType(cls?.class_type);
  const type: ChallengeType = label === "Sauna Journey" ? "Sauna Journey" : "Yoga";
  return {
    id: row.id,
    date: new Date(`${row.class_date}T12:00:00`),
    type,
    className: cls?.name?.trim() || "Class",
  };
}

function ChallengePage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [checkins, setCheckins] = useState<CheckInApiRow[]>([]);
  const [activeDay, setActiveDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setSignedIn(false);
      setCheckins([]);
      setLoading(false);
      return;
    }
    setSignedIn(true);

    const { data, error } = await supabase
      .from("challenge_checkins")
      .select(
        `
        id,
        class_date,
        booking_id,
        bookings (
          id,
          classes ( name, class_type )
        )
      `,
      )
      .eq("profile_id", user.id)
      .gte("class_date", MAY_START)
      .lte("class_date", MAY_END)
      .order("class_date", { ascending: true });

    if (error) {
      console.error(error);
      setCheckins([]);
      setLoading(false);
      return;
    }

    setCheckins((data ?? []) as CheckInApiRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stampedDays = useMemo(() => {
    const s = new Set<number>();
    for (const row of checkins) {
      const d = dayFromClassDate(row.class_date);
      if (d >= 1 && d <= TOTAL_DAYS) s.add(d);
    }
    return s;
  }, [checkins]);

  const stampedCount = stampedDays.size;
  const pct = Math.min(100, (stampedCount / TOTAL_DAYS) * 100);

  const today = new Date();
  const startToday = startOfDay(today);
  const inMay2026 =
    today.getFullYear() === CHALLENGE_YEAR && today.getMonth() === CHALLENGE_MONTH_INDEX;
  const todayDay = inMay2026 ? today.getDate() : 0;

  const dayCheckIns: ChallengeCheckIn[] = useMemo(() => {
    if (activeDay == null) return [];
    const ymd = `${CHALLENGE_YEAR}-05-${String(activeDay).padStart(2, "0")}`;
    return checkins.filter((r) => r.class_date === ymd).map(mapRowToChallengeCheckIn);
  }, [activeDay, checkins]);

  const days = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1);

  return (
    <AppShell>
      <div className="flex items-center px-5 pt-3">
        <Link
          to="/"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>

      <main className="flex-1 space-y-5 px-5 pt-3 pb-10">
        {!signedIn && !loading && (
          <p className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Sign in to see your May challenge progress.
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-[#c5d4b8]/80 bg-[#f4f7f0]/90 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#3d4f36]">
                  {stampedCount}/{TOTAL_DAYS} days stamped
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-[#c5d4b8]/60">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: SAGE }}
                />
              </div>
            </section>

            <section className="relative overflow-hidden rounded-3xl">
              <img
                src={challengeBg}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-black/30" />
              <div className="relative p-6">
                <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white ring-1 ring-white/40">
                  MAY CHALLENGE
                </span>
                <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-white">
                  31 Days of Movement
                </h1>
                <p className="mt-2 text-sm text-white/85">
                  May 2026 · Check in at the studio to collect your daily stamp.
                </p>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Your stamp card</h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {stampedCount}/{TOTAL_DAYS}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-2 sm:gap-3">
                {days.map((day) => {
                  const cellStart = startOfDay(
                    new Date(CHALLENGE_YEAR, CHALLENGE_MONTH_INDEX, day),
                  );
                  const isStamped = stampedDays.has(day);
                  const isToday = todayDay === day && inMay2026;
                  const isFuture = cellStart.getTime() > startToday.getTime();
                  const isPast = cellStart.getTime() < startToday.getTime();

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => isStamped && setActiveDay(day)}
                      disabled={!isStamped}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl py-2 transition-transform",
                        isStamped && "cursor-pointer active:scale-[0.98]",
                        !isStamped && "cursor-default",
                      )}
                      aria-label={`Day ${day}${isStamped ? ", stamped" : ""}`}
                    >
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12",
                          isStamped && "bg-[#a3b693] text-white shadow-sm",
                          !isStamped &&
                            isToday &&
                            "border-2 border-[#a3b693] bg-background text-foreground shadow-sm",
                          !isStamped &&
                            isPast &&
                            "border-2 border-dashed border-muted-foreground/45 bg-transparent text-muted-foreground",
                          !isStamped &&
                            isFuture &&
                            "border border-muted-foreground/25 bg-muted/25 text-muted-foreground/60",
                        )}
                      >
                        {isStamped ? (
                          <Check className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.5} aria-hidden />
                        ) : (
                          <span className="text-xs font-bold tabular-nums sm:text-sm">{day}</span>
                        )}
                      </span>
                      {isStamped && (
                        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {day}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
                Stamps appear when you&apos;re checked in at the desk during May 2026. One stamp per
                calendar day (up to 2 per day).
              </p>
            </section>
          </>
        )}
      </main>

      <Sheet open={activeDay != null} onOpenChange={(o) => !o && setActiveDay(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl border-0 bg-background p-0">
          <div className="px-6 pb-8 pt-6">
            <SheetHeader className="text-center">
              <SheetTitle className="font-display text-2xl font-bold">May {activeDay}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {dayCheckIns.length} stamp{dayCheckIns.length === 1 ? "" : "s"} earned
              </SheetDescription>
            </SheetHeader>
            <ul className="mt-5 space-y-2">
              {dayCheckIns.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.className}</p>
                    <p className="text-xs text-muted-foreground">{c.type}</p>
                  </div>
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: SAGE }}
                  >
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

// Reward UI removed (May challenge no longer shows completion reward card).
