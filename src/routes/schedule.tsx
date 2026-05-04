import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BookingSheet } from "@/components/BookingSheet";
import { supabase } from "@/lib/supabase";
import { addDays, isSameDay, startOfDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  component: SchedulePage,
});

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
};

export default function SchedulePage() {
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingFor, setBookingFor] = useState<ClassRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userBookings, setUserBookings] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.assign("/auth");
        return;
      }
      setUserId(user.id);
    });
  }, []);

  const loadClasses = useCallback(async (day: Date) => {
    setLoading(true);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, location, starts_at, ends_at, capacity, booked_count, is_cancelled, guide_name",
      )
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString())
      .eq("is_cancelled", false)
      .order("starts_at");

    const now = new Date();
    const isToday = isSameDay(day, now);
    const visible = (data ?? []).filter((c) => {
      if (!isToday) return true;
      const classStart = new Date(c.starts_at);
      return classStart.getTime() > now.getTime() - 15 * 60 * 1000;
    });

    setClasses(visible as unknown as ClassRow[]);
    setLoading(false);
  }, []);

  const loadUserBookings = useCallback(
    async (day: Date) => {
      if (!userId) return;
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("bookings")
        .select("class_id")
        .eq("profile_id", userId)
        .eq("status", "confirmed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      setUserBookings((data ?? []).map((b) => b.class_id));
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) return;
    void loadClasses(selectedDay);
  }, [userId, selectedDay, loadClasses]);

  useEffect(() => {
    if (!userId) return;
    void loadUserBookings(selectedDay);
  }, [userId, selectedDay, loadUserBookings]);

  const windowStart = useMemo(() => addDays(selectedDay, -2), [selectedDay]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i));
  const monthLabel = selectedDay.toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
  });
  const longDayLabel = selectedDay.toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

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
        <div className="flex items-center gap-1 rounded-2xl border border-border bg-card px-1 py-2">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setSelectedDay(addDays(selectedDay, -1))}
            className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-stretch justify-between gap-0.5">
            {days.map((d) => {
              const active = isSameDay(d, selectedDay);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  <span className="font-display text-base font-bold leading-none">
                    {d.getDate()}
                  </span>
                  <span
                    className={cn(
                      "mt-1 text-[10px] font-semibold uppercase tracking-wide",
                      active ? "opacity-90" : "text-muted-foreground",
                    )}
                  >
                    {d.toLocaleDateString("en-ZA", { weekday: "short" }).slice(0, 3)}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setSelectedDay(addDays(selectedDay, 1))}
            className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <main className="flex-1 space-y-3 px-5 pt-5">
        <h2 className="font-display text-lg font-bold">{longDayLabel}</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
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
      </main>

      <BookingSheet
        session={bookingFor}
        open={bookingFor !== null}
        onOpenChange={(o) => {
          if (!o) {
            setBookingFor(null);
            void loadClasses(selectedDay);
            void loadUserBookings(selectedDay);
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
