import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Clock, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { TypeBadge } from "@/components/TypeBadge";
import { cancelBookingWithPolicy } from "@/lib/bookingCancellation";
import { useTimezone } from "@/hooks/use-timezone";
import { formatClassDateTime, formatShortDateInZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { getUser, supabase } from "@/lib/supabase";
import { displayClassType, type ClassType } from "@/types/studio";
import {
  fetchMyActiveWaitlistEntries,
  leaveWaitlist,
  type WaitlistEntryWithClass,
} from "@/lib/waitlist";

function uuidOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    return undefined;
  }
  return s;
}

export const Route = createFileRoute("/bookings")({
  validateSearch: (raw: Record<string, unknown>) => ({
    /** When set (e.g. from home “Upcoming”), scroll to this booking and show its check-in QR. */
    booking: uuidOrUndefined(raw.booking),
  }),
  component: BookingsPage,
});

type ClassJoin = {
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  guide_name?: string | null;
};

type RawBooking = {
  id: string;
  status: string;
  qr_token: string | null;
  classes: ClassJoin | ClassJoin[] | null;
};

type BookingListRow = {
  id: string;
  status: string;
  qrToken: string | null;
  className: string;
  classType: ClassType;
  location: string;
  startsAt: Date;
  guideFirst: string | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function guideFirstFromClass(cls: ClassJoin | null): string | null {
  const gn = cls?.guide_name?.trim();
  if (!gn) return null;
  return gn.split(/\s+/)[0] ?? null;
}

function BookingsPage() {
  const { timeZone, studioTimeZone } = useTimezone();
  const search = Route.useSearch();
  const bookingHighlightId = search.booking;
  const highlightedRef = useRef<HTMLElement | null>(null);
  const didScrollToBookingRef = useRef(false);

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BookingListRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntryWithClass[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setRows([]);
      setWaitlist([]);
      setLoading(false);
      return;
    }

    const [bookingsRes, waitlistRows] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          `id, status, qr_token,
           classes ( name, class_type, location, starts_at, guide_name )`,
        )
        .eq("profile_id", user.id)
        .in("status", ["confirmed", "attended"])
        .order("created_at", { ascending: false }),
      fetchMyActiveWaitlistEntries(user.id).catch((err) => {
        console.error("[bookings] waitlist load failed", err);
        return [] as WaitlistEntryWithClass[];
      }),
    ]);

    if (bookingsRes.error) {
      console.error(bookingsRes.error);
      setRows([]);
      setWaitlist(waitlistRows);
      setLoading(false);
      return;
    }

    const mapped: BookingListRow[] =
      (bookingsRes.data as unknown as RawBooking[] | null)?.map((raw) => {
        const cls = one(raw.classes);
        return {
          id: raw.id,
          status: raw.status,
          qrToken: raw.qr_token ?? null,
          className: cls?.name ?? "Class",
          classType: displayClassType(cls?.class_type),
          location: cls?.location ?? "",
          startsAt: new Date(cls?.starts_at ?? Date.now()),
          guideFirst: guideFirstFromClass(cls),
        };
      }) ?? [];

    mapped.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    setRows(mapped);
    setWaitlist(waitlistRows);
    setLoading(false);
  }, []);

  const upcoming = useMemo(
    () => rows.filter((r) => r.status === "confirmed" && r.startsAt.getTime() >= Date.now()),
    [rows],
  );
  const past = useMemo(() => rows.filter((r) => r.status === "attended"), [rows]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    didScrollToBookingRef.current = false;
  }, [bookingHighlightId]);

  useEffect(() => {
    if (!bookingHighlightId) {
      return;
    }
    setTab("upcoming");
  }, [bookingHighlightId]);

  useEffect(() => {
    if (!bookingHighlightId || loading || didScrollToBookingRef.current) return;
    const inUpcoming = upcoming.some((b) => b.id === bookingHighlightId);
    if (!inUpcoming) {
      didScrollToBookingRef.current = true;
      return;
    }
    const el = highlightedRef.current;
    if (!el) return;
    didScrollToBookingRef.current = true;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [bookingHighlightId, loading, rows, upcoming]);

  const leaveClassWaitlist = async (entryId: string) => {
    try {
      await leaveWaitlist(entryId);
      setWaitlist((prev) => prev.filter((w) => w.id !== entryId));
      toast.success("Left the waitlist");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not leave waitlist");
    }
  };

  const cancelBooking = async (bookingId: string) => {
    const confirmText = `Please read carefully:
- Cancellations more than 2 hours before class: your credit will be returned.
- Late cancellations (within 2 hours): your credit will be returned, but a R100 fee applies on your next transaction.
Are you sure you want to cancel?`;

    if (!window.confirm(confirmText)) return;

    try {
      const result = await cancelBookingWithPolicy({
        bookingId,
        cancellationReason: "customer_cancelled",
      });
      toast.success(
        result.lateCancel
          ? "Booking cancelled. Late cancellation fee will apply on next transaction."
          : "Booking cancelled. Credit returned.",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel booking");
    }
  };

  return (
    <AppShell>
      <header className="safe-top px-5 pt-3 pb-3">
        <h1 className="font-display text-2xl font-semibold">My bookings</h1>
      </header>

      <div className="px-5">
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 space-y-3 px-5 pt-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {tab === "upcoming" && waitlist.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  On the waitlist
                </h2>
                {waitlist.map((w) => (
                  <article
                    key={w.id}
                    className="rounded-2xl border border-dashed border-[#a3b693]/60 bg-[#f4f7f0]/70 p-4"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <TypeBadge type={displayClassType(w.classType)} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#4a6b3c]">
                        #{w.position} on waitlist
                      </span>
                    </div>
                    <h3 className="truncate font-display text-lg font-semibold">{w.className}</h3>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatShortDateInZone(new Date(w.startsAt), timeZone)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" aria-hidden />{" "}
                        {formatClassDateTime(w.startsAt, timeZone, studioTimeZone).time}
                      </span>
                      <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />{" "}
                        <span className="min-w-0 break-words">{w.location}</span>
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      We'll book you in automatically and email you if a spot opens.
                    </p>
                    <button
                      onClick={() => void leaveClassWaitlist(w.id)}
                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      <X className="h-3 w-3 shrink-0" aria-hidden /> Leave waitlist
                    </button>
                  </article>
                ))}
              </section>
            )}
            {tab === "upcoming" && upcoming.length === 0 && waitlist.length === 0 && (
              <Empty text="No upcoming bookings yet — head to Schedule to book." />
            )}
            {tab === "upcoming" &&
              upcoming.map((b) => (
                <article
                  key={b.id}
                  ref={bookingHighlightId === b.id ? highlightedRef : undefined}
                  className={cn(
                    "rounded-2xl border bg-card p-4",
                    bookingHighlightId === b.id
                      ? "border-[#a3b693] shadow-md ring-2 ring-[#a3b693]/40"
                      : "border-border",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <TypeBadge type={b.classType} />
                  </div>
                  <h3 className="truncate font-display text-lg font-semibold">{b.className}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatShortDateInZone(b.startsAt, timeZone)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden />{" "}
                      {formatClassDateTime(b.startsAt.toISOString(), timeZone, studioTimeZone).time}
                    </span>
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />{" "}
                      <span className="min-w-0 break-words">{b.location}</span>
                    </span>
                    {b.guideFirst && <span>with {b.guideFirst}</span>}
                  </div>
                  {b.qrToken && (
                    <div className="mt-4 flex flex-col items-center border-t border-border pt-4">
                      <div className="flex min-h-[200px] min-w-[200px] items-center justify-center rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                        <QRCodeSVG
                          value={b.qrToken}
                          size={200}
                          level="M"
                          includeMargin
                          title="Class check-in code"
                          className="h-[200px] w-[200px] max-w-full"
                        />
                      </div>
                      <p className="mt-3 max-w-[260px] text-center text-sm font-medium text-muted-foreground">
                        Show this at the desk to check in
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => void cancelBooking(b.id)}
                    className="mt-3 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    <X className="h-3 w-3 shrink-0" aria-hidden /> Cancel booking
                  </button>
                </article>
              ))}

            {tab === "past" && past.length === 0 && (
              <Empty text="No past classes yet — your attended sessions will show here." />
            )}
            {tab === "past" &&
              past.map((b) => (
                <article
                  key={b.id}
                  className="rounded-2xl border border-border bg-card p-4 opacity-90"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <TypeBadge type={b.classType} />
                    <span className="text-[10px] uppercase tracking-wide text-success">
                      Attended
                    </span>
                  </div>
                  <h3 className="truncate font-display text-lg font-semibold">{b.className}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatShortDateInZone(b.startsAt, timeZone)}
                  </div>
                </article>
              ))}
          </>
        )}
      </main>
    </AppShell>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
