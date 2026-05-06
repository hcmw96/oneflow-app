import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BookingSheet } from "@/components/BookingSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth";
import { supabase } from "@/lib/supabase";
import { addDays, isSameDay, startOfDay, startOfWeekSunday } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  component: SchedulePage,
});

const SAGE = "#a3b693";

type ClassRow = {
  id: string;
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  is_cancelled: boolean;
  guide_name: string | null;
  description: string | null;
};

function scheduleDayKey(day: Date): string {
  const x = new Date(day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function ScheduleRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-2xl" />
      ))}
    </>
  );
}

function useHorizontalDaySwipe(onPrev: () => void, onNext: () => void) {
  const origin = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    origin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!origin.current) return;
    const dx = e.changedTouches[0].clientX - origin.current.x;
    const dy = e.changedTouches[0].clientY - origin.current.y;
    origin.current = null;
    if (Math.abs(dx) < 56) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) onNext();
    else onPrev();
  };

  return {
    onTouchStart,
    onTouchEnd,
    style: { touchAction: "pan-y" } as const,
  };
}

export default function SchedulePage() {
  const { user, authReady } = useAuth();
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [bookingFor, setBookingFor] = useState<ClassRow | null>(null);
  const [userBookings, setUserBookings] = useState<string[]>([]);
  const classesCacheRef = useRef(new Map<string, ClassRow[]>());

  const goPrevDay = useCallback(() => {
    setSelectedDay((d) => startOfDay(addDays(d, -1)));
  }, []);

  const goNextDay = useCallback(() => {
    setSelectedDay((d) => startOfDay(addDays(d, 1)));
  }, []);

  const swipeHandlers = useHorizontalDaySwipe(goPrevDay, goNextDay);

  const loadDayData = useCallback(async (day: Date, uid: string) => {
    const key = scheduleDayKey(day);
    const cached = classesCacheRef.current.get(key);
    if (cached !== undefined) {
      setClasses(cached);
      setLoading(false);
      setRevalidating(true);
    } else {
      setLoading(true);
    }

    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    const isoStart = start.toISOString();
    const isoEnd = end.toISOString();

    const [{ data, error }, bookingsRes] = await Promise.all([
      supabase
        .from("classes")
        .select(
          "id, name, class_type, location, starts_at, ends_at, capacity, booked_count, is_cancelled, guide_name, description",
        )
        .gte("starts_at", isoStart)
        .lte("starts_at", isoEnd)
        .eq("is_cancelled", false)
        .order("starts_at"),
      supabase
        .from("bookings")
        .select("class_id")
        .eq("profile_id", uid)
        .eq("status", "confirmed")
        .gte("created_at", isoStart)
        .lte("created_at", isoEnd),
    ]);

    if (error) {
      console.error(error);
    }

    const now = new Date();
    const isToday = isSameDay(day, now);
    const rows = data ?? [];
    const visible = rows.filter((c) => {
      if (!isToday) return true;
      const classStart = new Date(c.starts_at);
      return classStart.getTime() > now.getTime() - 15 * 60 * 1000;
    }) as unknown as ClassRow[];

    classesCacheRef.current.set(key, visible);
    setClasses(visible);
    setUserBookings((bookingsRes.data ?? []).map((b) => (b as { class_id: string }).class_id));
    setLoading(false);
    setRevalidating(false);
  }, []);

  useEffect(() => {
    if (!authReady || !user?.id) return;
    void loadDayData(selectedDay, user.id);
  }, [authReady, user?.id, selectedDay, loadDayData]);

  const weekStartSunday = useMemo(() => startOfWeekSunday(selectedDay), [selectedDay]);

  const daysInWeek = useMemo(
    () => Array.from({ length: 7 }, (_, i) => startOfDay(addDays(weekStartSunday, i))),
    [weekStartSunday],
  );

  const monthLabel = selectedDay.toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
  });
  const longDayLabel = selectedDay.toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const uid = user?.id;
  const today = startOfDay(new Date());

  if (!authReady || !uid) {
    return (
      <AppShell>
        <header className="safe-top px-5 pt-4 pb-2 text-center">
          <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight">
            Explore the schedule
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">and book classes!</p>
        </header>
        <div className="px-5 pt-4">
          <Skeleton className="mx-auto mb-2 h-4 w-32" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
        <main className="flex-1 space-y-3 px-5 pt-5">
          <Skeleton className="h-7 w-52" />
          <ScheduleRowsSkeleton />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="safe-top px-5 pt-4 pb-2 text-center">
        <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight">
          Explore the schedule
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">and book classes!</p>
      </header>

      <div className="px-5 pt-4">
        <p className="mb-2 text-center text-sm text-muted-foreground">{monthLabel}</p>
        <div className="rounded-2xl border border-border bg-card p-2">
          <div className="flex items-stretch justify-between gap-0.5">
            {daysInWeek.map((d) => {
              const selected = isSameDay(d, selectedDay);
              const isTodayCell = isSameDay(d, today);
              return (
                <button
                  key={scheduleDayKey(d)}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-0.5 py-1.5 transition-all duration-200",
                    selected && "text-white shadow-sm",
                    !selected && isTodayCell && "ring-2 ring-[#a3b693]/80",
                  )}
                  style={
                    selected
                      ? { backgroundColor: SAGE, color: "#fff" }
                      : isTodayCell
                        ? { backgroundColor: "transparent" }
                        : undefined
                  }
                >
                  <span className="font-display text-base font-bold leading-none">
                    {d.getDate()}
                  </span>
                  <span
                    className={cn(
                      "mt-1 text-[10px] font-semibold uppercase tracking-wide",
                      selected ? "text-white/90" : "text-muted-foreground",
                    )}
                  >
                    {d.toLocaleDateString("en-ZA", { weekday: "short" }).slice(0, 3)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Swipe the class list left or right to change day
          </p>
        </div>
      </div>

      <main
        className={cn(
          "flex-1 space-y-3 px-5 pt-5 transition-opacity",
          revalidating && "opacity-80",
        )}
        {...swipeHandlers}
      >
        <h2 className="font-display text-lg font-bold">{longDayLabel}</h2>
        <div
          key={scheduleDayKey(selectedDay)}
          className={cn("space-y-3", !loading && "schedule-content-animate")}
        >
          {loading ? (
            <ScheduleRowsSkeleton />
          ) : classes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              No classes scheduled for this day.
            </div>
          ) : (
            classes.map((c) => (
              <ScheduleRow
                key={c.id}
                session={c}
                alreadyBooked={userBookings.includes(c.id)}
                onReserve={() => setBookingFor(c)}
              />
            ))
          )}
        </div>
      </main>

      <BookingSheet
        session={bookingFor}
        open={bookingFor !== null}
        onOpenChange={(o) => {
          if (!o) {
            setBookingFor(null);
            void loadDayData(selectedDay, uid);
          }
        }}
      />
    </AppShell>
  );
}

function ScheduleRow({
  session,
  alreadyBooked,
  onReserve,
}: {
  session: ClassRow;
  alreadyBooked: boolean;
  onReserve: () => void;
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const desc = session.description?.trim() ?? "";

  const guideName = session.guide_name?.trim() || null;
  const avatarLetter = (guideName?.charAt(0) || session.name.charAt(0) || "?").toUpperCase();
  const time = new Date(session.starts_at)
    .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
  const durationMin = Math.round(
    (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60000,
  );
  const full = session.booked_count >= session.capacity;
  const almostFull = session.booked_count / session.capacity >= 0.8;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="w-14 shrink-0 pt-1 text-xs font-semibold tabular-nums">{time}</div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-bold">
          <span aria-hidden>{avatarLetter}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate font-display text-[15px] font-bold leading-tight">
              {session.name}
            </h3>
            {almostFull && !full && (
              <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                Almost Full
              </span>
            )}
          </div>
          {guideName && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{guideName}</p>
          )}
          {desc ? (
            <div className="mt-1.5 min-w-0">
              <p
                className={cn(
                  "text-xs leading-snug text-muted-foreground",
                  !descExpanded && "line-clamp-2",
                )}
              >
                {desc}
              </p>
              {(desc.length > 72 || descExpanded) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDescExpanded((v) => !v);
                  }}
                  className="mt-0.5 text-[11px] font-semibold"
                  style={{ color: SAGE }}
                >
                  {descExpanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          ) : null}
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{session.location}</span>
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0">{durationMin} mins</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onReserve}
          disabled={alreadyBooked}
          className={cn(
            "shrink-0 self-center rounded-lg px-4 py-2 text-sm font-semibold transition-opacity",
            alreadyBooked
              ? "bg-muted text-muted-foreground"
              : full
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground active:opacity-90",
          )}
        >
          {alreadyBooked ? "Booked" : full ? "Full" : "Reserve"}
        </button>
      </div>
    </div>
  );
}
