import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BookingSheet } from "@/components/BookingSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth";
import { supabase } from "@/lib/supabase";
import { useTimezone } from "@/hooks/use-timezone";
import {
  civilAddDaysYmd,
  dayBoundsForDateKey,
  dayOfMonthFromDateKey,
  formatClassDateTime,
  formatLongDayFromDateKey,
  formatMonthYearFromDateKey,
  formatWeekdayShortFromDateKey,
  todayDateKey,
  weekDateKeysFromSunday,
  weekSundayDateKey,
  ymdInTimeZone,
} from "@/lib/timezone";
import {
  type BookedClassInterval,
  fetchConfirmedBookingIntervals,
  findOverlappingBooking,
  isFreeBeginnerClass,
  isPastScheduleClass,
  isPastScheduleDay,
} from "@/lib/scheduleBooking";
import { cn } from "@/lib/utils";
import { TypeBadge } from "@/components/TypeBadge";
import { displayClassType } from "@/types/studio";
import { fetchMyActiveWaitlistEntries } from "@/lib/waitlist";

function uuidOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    return undefined;
  }
  return s;
}

export const Route = createFileRoute("/schedule")({
  validateSearch: (raw: Record<string, unknown>) => ({
    class: uuidOrUndefined(raw.class),
  }),
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
  description?: string;
  product_id?: string | null;
};

/** Denormalized `classes.guide_name` from PostgREST (text); never guess a label when missing. */
function guideNameFromRow(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function ScheduleRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-2xl" />
      ))}
    </>
  );
}

const SWIPE_MIN_PX = 44;

function useHorizontalDaySwipe(onPrev: () => void, onNext: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  onPrevRef.current = onPrev;
  onNextRef.current = onNext;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const origin = { x: 0, y: 0 };
    let locked: "h" | "v" | null = null;

    const reset = () => {
      locked = null;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      origin.x = e.touches[0].clientX;
      origin.y = e.touches[0].clientY;
      locked = null;
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || locked === "v") return;
      const dx = e.touches[0].clientX - origin.x;
      const dy = e.touches[0].clientY - origin.y;
      if (!locked) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (locked === "h") e.preventDefault();
    };

    const onEnd = (e: TouchEvent) => {
      if (locked !== "h") {
        reset();
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) {
        reset();
        return;
      }
      const dx = touch.clientX - origin.x;
      reset();
      if (Math.abs(dx) < SWIPE_MIN_PX) return;
      if (dx < 0) onNextRef.current();
      else onPrevRef.current();
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd, { passive: true });
    node.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return containerRef;
}

export default function SchedulePage() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { timeZone, studioTimeZone } = useTimezone();
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayDateKey(studioTimeZone));
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [bookingFor, setBookingFor] = useState<ClassRow | null>(null);
  /** Confirmed booking `class_id`s for this user (any day — not filtered by booking `created_at`). */
  const [bookedClassIds, setBookedClassIds] = useState<Set<string>>(() => new Set());
  const [bookedIntervals, setBookedIntervals] = useState<BookedClassInterval[]>([]);
  const [waitlistedClassIds, setWaitlistedClassIds] = useState<Set<string>>(() => new Set());
  const [pendingOpenClassId, setPendingOpenClassId] = useState<string | null>(null);
  const [daySlide, setDaySlide] = useState<"from-left" | "from-right" | null>(null);
  const classesCacheRef = useRef(new Map<string, ClassRow[]>());

  const goPrevDay = useCallback(() => {
    setDaySlide("from-left");
    setSelectedDateKey((k) => civilAddDaysYmd(k, -1));
  }, []);

  const goNextDay = useCallback(() => {
    setDaySlide("from-right");
    setSelectedDateKey((k) => civilAddDaysYmd(k, 1));
  }, []);

  const swipeContainerRef = useHorizontalDaySwipe(goPrevDay, goNextDay);

  useEffect(() => {
    if (!daySlide) return;
    const t = window.setTimeout(() => setDaySlide(null), 320);
    return () => window.clearTimeout(t);
  }, [daySlide, selectedDateKey]);

  const loadDayData = useCallback(
    async (dateKey: string, uid: string) => {
    const cached = classesCacheRef.current.get(dateKey);
    if (cached !== undefined) {
      setClasses(cached);
      setLoading(false);
      setRevalidating(true);
    } else {
      setLoading(true);
    }

    const { startUtcIso: isoStart, endUtcIso: isoEnd } = dayBoundsForDateKey(dateKey, studioTimeZone);

    const now = new Date();
    const nowT = now.getTime();

    const [{ data, error }, nextIntervals, waitlistEntries] = await Promise.all([
      supabase
        .from("classes")
        .select(
          "id, name, guide_name, class_type, location, starts_at, ends_at, capacity, booked_count, is_cancelled, description, product_id",
        )
        .gte("starts_at", isoStart)
        .lte("starts_at", isoEnd)
        .eq("is_cancelled", false)
        .order("starts_at"),
      fetchConfirmedBookingIntervals(supabase, uid, nowT),
      fetchMyActiveWaitlistEntries(uid).catch((err) => {
        console.error("[schedule] waitlist load failed", err);
        return [];
      }),
    ]);

    if (error) {
      console.error(error);
    }
    const rows = data ?? [];
    const mapped = rows
      .map((c) => {
        const raw = c as Record<string, unknown>;
        return {
          ...(c as ClassRow),
          guide_name: guideNameFromRow(raw.guide_name),
        };
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

    const visible = mapped.filter((c) => !isPastScheduleClass(c.starts_at, nowT));

    classesCacheRef.current.set(dateKey, visible);
    setClasses(visible);
    setBookedClassIds(new Set(nextIntervals.map((b) => b.class_id)));
    setBookedIntervals(nextIntervals);
    setWaitlistedClassIds(new Set(waitlistEntries.map((w) => w.classId)));
    setLoading(false);
    setRevalidating(false);
  },
    [studioTimeZone],
  );

  useEffect(() => {
    if (!authReady || !user?.id) return;
    void loadDayData(selectedDateKey, user.id);
  }, [authReady, user?.id, selectedDateKey, loadDayData]);

  useEffect(() => {
    const classId = search.class;
    if (!authReady || !user?.id || !classId) {
      if (!classId) setPendingOpenClassId(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, starts_at, is_cancelled")
        .eq("id", classId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        toast.error("Class not found.");
        void navigate({ to: "/schedule", search: { class: undefined }, replace: true });
        return;
      }

      if (data.is_cancelled) {
        toast.error("This class has been cancelled.");
        void navigate({ to: "/schedule", search: { class: undefined }, replace: true });
        return;
      }

      const ts = String(data.starts_at);
      setSelectedDateKey(ymdInTimeZone(ts, studioTimeZone));
      setPendingOpenClassId(classId);
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id, search.class, navigate, studioTimeZone]);

  useEffect(() => {
    if (!pendingOpenClassId || loading || revalidating || !user?.id) return;

    const row = classes.find((c) => c.id === pendingOpenClassId);
    if (row) {
      if (isPastScheduleClass(row.starts_at)) {
        toast.error("This class has already passed — you can’t book it.");
      } else {
        setBookingFor(row);
      }
      setPendingOpenClassId(null);
      void navigate({ to: "/schedule", search: { class: undefined }, replace: true });
      return;
    }

    setPendingOpenClassId(null);
    void navigate({ to: "/schedule", search: { class: undefined }, replace: true });
    toast.info(
      "That class isn’t on this day’s list — find it on the day it runs or pick another.",
      {
        duration: 6000,
      },
    );
  }, [pendingOpenClassId, loading, revalidating, classes, navigate, user?.id]);

  const weekSundayKey = useMemo(
    () => weekSundayDateKey(selectedDateKey, studioTimeZone),
    [selectedDateKey, studioTimeZone],
  );

  const daysInWeek = useMemo(() => weekDateKeysFromSunday(weekSundayKey), [weekSundayKey]);

  const monthLabel = formatMonthYearFromDateKey(selectedDateKey, studioTimeZone);
  const longDayLabel = formatLongDayFromDateKey(selectedDateKey, studioTimeZone);

  const uid = user?.id;
  const todayKey = todayDateKey(studioTimeZone);
  const selectedDayIsPast = isPastScheduleDay(selectedDateKey, studioTimeZone);

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
        <main className="flex-1 space-y-5 px-5 pt-5">
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

      <div ref={swipeContainerRef} className="flex min-h-0 flex-1 flex-col touch-pan-y">
      <div className="px-5 pt-4">
        <p className="mb-2 text-center text-sm text-muted-foreground">{monthLabel}</p>
        <div className="rounded-2xl border border-border bg-card p-2">
          <div className="flex items-stretch justify-between gap-0.5">
            {daysInWeek.map((dayKey) => {
              const selected = dayKey === selectedDateKey;
              const isTodayCell = dayKey === todayKey;
              const dayIsPast = isPastScheduleDay(dayKey, studioTimeZone);
              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setSelectedDateKey(dayKey)}
                  className={cn(
                    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-0.5 py-1.5 transition-all duration-200",
                    selected && !dayIsPast && "text-white shadow-sm",
                    selected && dayIsPast && "bg-muted text-muted-foreground shadow-sm",
                    !selected && isTodayCell && "ring-2 ring-[#a3b693]/80",
                    !selected && dayIsPast && "opacity-45",
                  )}
                  style={
                    selected && !dayIsPast
                      ? { backgroundColor: SAGE, color: "#fff" }
                      : selected && dayIsPast
                        ? undefined
                        : isTodayCell
                          ? { backgroundColor: "transparent" }
                          : undefined
                  }
                >
                  <span className="font-display text-base font-bold leading-none">
                    {dayOfMonthFromDateKey(dayKey)}
                  </span>
                  <span
                    className={cn(
                      "mt-1 text-[10px] font-semibold uppercase tracking-wide",
                      selected && !dayIsPast && "text-white/90",
                      (!selected || dayIsPast) && "text-muted-foreground",
                    )}
                  >
                    {formatWeekdayShortFromDateKey(dayKey, studioTimeZone)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Swipe left or right to change day
          </p>
        </div>
      </div>

      <main
        className={cn(
          "flex-1 space-y-5 px-5 pt-5 transition-opacity",
          revalidating && "opacity-80",
        )}
      >
        <h2
          className={cn(
            "font-display text-lg font-bold",
            selectedDayIsPast && "text-muted-foreground",
          )}
        >
          {longDayLabel}
        </h2>
        <div
          key={selectedDateKey}
          className={cn(
            "space-y-5",
            !loading &&
              (daySlide === "from-left"
                ? "schedule-slide-from-left"
                : daySlide === "from-right"
                  ? "schedule-slide-from-right"
                  : "schedule-content-animate"),
          )}
        >
          {loading ? (
            <ScheduleRowsSkeleton />
          ) : classes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              No classes scheduled for this day.
            </div>
          ) : (
            classes.map((c) => {
              const classIsPast =
                selectedDayIsPast || isPastScheduleClass(c.starts_at);
              const overlapBooking = findOverlappingBooking(c, bookedIntervals, c.id);
              return (
                <ScheduleRow
                  key={c.id}
                  session={c}
                  displayTimeZone={timeZone}
                  studioTimeZone={studioTimeZone}
                  alreadyBooked={bookedClassIds.has(c.id)}
                  onWaitlist={waitlistedClassIds.has(c.id)}
                  overlapBooking={overlapBooking}
                  isPast={classIsPast}
                  onReserve={() => {
                    if (classIsPast || overlapBooking) return;
                    setBookingFor(c);
                  }}
                />
              );
            })
          )}
        </div>
      </main>
      </div>

      <BookingSheet
        session={bookingFor}
        open={bookingFor !== null}
        onBookingConfirmed={(classId) => {
          setBookedClassIds((prev) => new Set(prev).add(classId));
          if (bookingFor && bookingFor.id === classId) {
            setBookedIntervals((prev) => [
              ...prev.filter((b) => b.class_id !== classId),
              {
                class_id: classId,
                name: bookingFor.name,
                starts_at: bookingFor.starts_at,
                ends_at: bookingFor.ends_at,
              },
            ]);
          }
        }}
        onOpenChange={(o) => {
          if (!o) {
            setBookingFor(null);
            void loadDayData(selectedDateKey, uid);
          }
        }}
      />
    </AppShell>
  );
}

function ScheduleRow({
  session,
  displayTimeZone,
  studioTimeZone,
  alreadyBooked,
  onWaitlist,
  overlapBooking,
  isPast,
  onReserve,
}: {
  session: ClassRow;
  displayTimeZone: string;
  studioTimeZone: string;
  alreadyBooked: boolean;
  onWaitlist: boolean;
  overlapBooking: BookedClassInterval | null;
  isPast?: boolean;
  onReserve: () => void;
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const desc = session.description?.trim() ?? "";

  const guideName = guideNameFromRow(session.guide_name);
  const badgeType = displayClassType(session.class_type);
  const { time, zoneLabel } = formatClassDateTime(
    session.starts_at,
    displayTimeZone,
    studioTimeZone,
  );
  const timeLabel = time.toUpperCase();
  const durationMin = Math.round(
    (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60000,
  );
  const full = session.booked_count >= session.capacity;
  const almostFull = session.booked_count / session.capacity >= 0.8;
  const hasOverlap = Boolean(overlapBooking);
  const canReserve = !isPast && !alreadyBooked && !full && !hasOverlap;
  // When full + not booked + no overlap, the button opens the sheet to
  // join the waitlist (or manage an existing entry).
  const canWaitlist = !isPast && !alreadyBooked && full && !hasOverlap;
  const isFreeClass = isFreeBeginnerClass(session.class_type);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card px-5 py-5",
        isPast && "opacity-55 saturate-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isFreeClass && (
              <span className="inline-flex rounded-full bg-[#a3b693]/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3d4f36]">
                FREE
              </span>
            )}
            {almostFull && !full && !isPast && (
              <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                Almost Full
              </span>
            )}
          </div>
        </div>
        <TypeBadge
          type={badgeType}
          className="shrink-0 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
        />
      </div>

      <h3 className="mt-2 font-display text-lg font-bold leading-snug tracking-tight break-words text-foreground">
        {session.name}
      </h3>

      {guideName ? (
        <p className="mt-1.5 text-sm font-medium leading-snug" style={{ color: SAGE }}>
          {guideName}
        </p>
      ) : null}

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted-foreground">
        <span className="inline-flex flex-wrap items-center gap-1 font-medium tabular-nums">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {timeLabel}
          {zoneLabel ? (
            <span className="font-normal text-muted-foreground/80">({zoneLabel})</span>
          ) : null}
        </span>
        <span className="text-muted-foreground/40" aria-hidden>
          ·
        </span>
        <span className="inline-flex min-w-0 items-center gap-1">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="break-words">{session.location}</span>
        </span>
        <span className="text-muted-foreground/40" aria-hidden>
          ·
        </span>
        <span className="tabular-nums">{durationMin} mins</span>
      </p>

      {desc ? (
        <div className="mt-3 min-w-0">
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

      <button
        type="button"
        onClick={onReserve}
        disabled={!canReserve && !canWaitlist}
        className={cn(
          "mt-4 w-full rounded-xl py-3 text-sm font-semibold transition-opacity",
          isPast || alreadyBooked || hasOverlap
            ? "cursor-not-allowed bg-muted text-muted-foreground"
            : canWaitlist
              ? onWaitlist
                ? "border border-[#a3b693]/60 bg-[#e8efe3] text-[#3d4f36] active:opacity-90"
                : "border border-[#a3b693]/60 bg-card text-[#3d4f36] active:opacity-90"
              : isFreeClass
                ? "bg-[#a3b693] text-white active:opacity-90"
                : "bg-primary text-primary-foreground active:opacity-90",
        )}
      >
        {isPast
          ? "Past"
          : alreadyBooked
            ? "Booked"
            : hasOverlap
              ? "Time conflict"
              : full
                ? onWaitlist
                  ? "On waitlist"
                  : "Join Waitlist"
                : isFreeClass
                  ? "Book Free"
                  : "Reserve"}
      </button>
    </div>
  );
}
