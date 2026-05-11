import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { getUser, supabase } from "@/lib/supabase";
import { addDays, isSameDay, startOfDay } from "@/lib/format";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cancelBookingWithPolicy } from "@/lib/bookingCancellation";
import { deleteMayChallengeCheckInForBooking } from "@/lib/mayChallengeCheckIn";
import {
  bookingConfirmationEmailData,
  bookingConfirmationTemplateForClassType,
} from "@/lib/bookingConfirmationEmail";
import {
  fetchTheSageCreditProfileIds,
  RosterAddonPills,
} from "@/components/admin/RosterAddonPills";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsPage,
});

const SAGE = "#a3b693";

type BookingStatus = "confirmed" | "attended" | "cancelled" | "no-show";

type WeekClassRow = {
  id: string;
  name: string;
  class_type: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  location: string | null;
  guide_name: string | null;
};

type BookingRowRaw = {
  id: string;
  status: string;
  profile_id: string | null;
  class_id: string;
  payment_method: string | null;
  mat_addon: boolean | null;
  towel_addon: boolean | null;
  profiles:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
  classes:
    | { id: string; name: string; starts_at: string; ends_at: string }
    | { id: string; name: string; starts_at: string; ends_at: string }[]
    | null;
};

type AdminBookingRow = {
  id: string;
  profile_id: string | null;
  class_id: string;
  memberFull: string;
  memberShort: string;
  status: BookingStatus;
  classStartsAtIso: string;
  creditLabel: string;
  matAddon: boolean;
  towelAddon: boolean;
  hasSageCredit: boolean;
};

function startOfCalendarWeekSunday(d: Date) {
  const x = startOfDay(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  return x;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function formatClassTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
}

function shortMemberName(first: string, last: string) {
  const f = first.trim();
  const L = last.trim().charAt(0).toUpperCase();
  if (!f) return L ? `${L}.` : "Member";
  return L ? `${f} ${L}.` : f;
}

function normalizeBooking(
  raw: BookingRowRaw,
  sageProfileIds: Set<string>,
): AdminBookingRow | null {
  const prof = one(raw.profiles);
  const fn = prof?.first_name?.trim() ?? "";
  const ln = prof?.last_name?.trim() ?? "";
  const memberFull = fn || ln ? `${fn} ${ln}`.trim() : "Unknown member";
  const cls = one(raw.classes);
  if (!cls?.starts_at) return null;
  const st = String(raw.status);
  const status = (
    ["confirmed", "attended", "cancelled", "no-show"].includes(st) ? st : "confirmed"
  ) as BookingStatus;
  const pid = raw.profile_id;
  return {
    id: raw.id,
    profile_id: raw.profile_id,
    class_id: raw.class_id,
    memberFull,
    memberShort: shortMemberName(fn, ln || ""),
    status,
    classStartsAtIso: cls.starts_at,
    creditLabel: raw.payment_method?.replace(/_/g, " ") ?? "—",
    matAddon: Boolean(raw.mat_addon),
    towelAddon: Boolean(raw.towel_addon),
    hasSageCredit: Boolean(pid && sageProfileIds.has(pid)),
  };
}

function rosterStatusLabel(status: BookingStatus): string {
  if (status === "confirmed") return "Booked";
  if (status === "attended") return "Attended";
  if (status === "cancelled") return "Cancelled";
  return "No-show";
}

function rosterStatusClass(status: BookingStatus) {
  return cn(
    "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
    status === "attended" &&
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-50",
    status === "confirmed" &&
      "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100",
    status === "cancelled" && "bg-destructive/15 text-destructive",
    status === "no-show" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  );
}

function CapacityDonut({ booked, capacity }: { booked: number; capacity: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = capacity > 0 ? Math.min(1, booked / capacity) : 0;
  const dash = pct * c;
  return (
    <div className="relative mx-auto shrink-0" style={{ width: 92, height: 92 }}>
      <svg width="92" height="92" viewBox="0 0 92 92" className="block -rotate-90" aria-hidden>
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-neutral-200 dark:text-neutral-700"
          strokeWidth="9"
        />
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke={SAGE}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className="font-display text-lg font-bold leading-none text-foreground">
          {booked}
        </span>
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          / {capacity}
        </span>
      </div>
    </div>
  );
}

function stripLetter(dow: number) {
  const letters = ["S", "M", "T", "W", "T", "F", "S"];
  return letters[dow] ?? "?";
}

function BookingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [viewWeekStart, setViewWeekStart] = useState(() => startOfCalendarWeekSunday(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [weekClasses, setWeekClasses] = useState<WeekClassRow[]>([]);
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminBookingRow | null>(null);
  const [waiveLateFee, setWaiveLateFee] = useState(false);
  const [removing, setRemoving] = useState(false);

  const stripDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(viewWeekStart, i)),
    [viewWeekStart],
  );
  const isGuide = (role ?? "").toLowerCase() === "guide";

  useEffect(() => {
    void (async () => {
      const user = await getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setRole((data?.role as string | null) ?? null);
    })();
  }, []);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    const ws = startOfDay(viewWeekStart);
    const we = addDays(ws, 7);

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, starts_at, ends_at, capacity, booked_count, location, guide_name, is_cancelled",
      )
      .gte("starts_at", ws.toISOString())
      .lt("starts_at", we.toISOString())
      .eq("is_cancelled", false)
      .order("starts_at");

    if (classesError) {
      console.error(classesError);
      toast.error("Could not load classes");
      setWeekClasses([]);
      setBookings([]);
      setLoading(false);
      return;
    }

    const classes = (classesData ?? []) as WeekClassRow[];
    setWeekClasses(classes);
    const classIds = classes.map((c) => c.id);

    if (classIds.length === 0) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const [{ data: bookingsData, error: bookingsError }, sageProfileIds] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          `
        id,
        status,
        profile_id,
        class_id,
        payment_method,
        mat_addon,
        towel_addon,
        profiles ( first_name, last_name ),
        classes ( id, name, starts_at, ends_at )
      `,
        )
        .in("class_id", classIds),
      fetchTheSageCreditProfileIds(supabase),
    ]);

    if (bookingsError) {
      console.error(bookingsError);
      toast.error("Could not load bookings");
      setBookings([]);
      setLoading(false);
      return;
    }

    const rawRows = (bookingsData ?? []) as unknown as BookingRowRaw[];
    const mapped = rawRows
      .map((row) => normalizeBooking(row, sageProfileIds))
      .filter((r): r is AdminBookingRow => r !== null);
    setBookings(mapped);
    setLoading(false);
  }, [viewWeekStart]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const daySessions = useMemo(() => {
    const out = weekClasses.filter((c) => isSameDay(new Date(c.starts_at), selectedDay));
    out.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return out;
  }, [weekClasses, selectedDay]);

  const bookingsByClass = useMemo(() => {
    const m = new Map<string, AdminBookingRow[]>();
    for (const b of bookings) {
      if (!isSameDay(new Date(b.classStartsAtIso), selectedDay)) continue;
      const list = m.get(b.class_id) ?? [];
      list.push(b);
      m.set(b.class_id, list);
    }
    for (const list of m.values()) {
      list.sort((a, x) => a.memberFull.localeCompare(x.memberFull));
    }
    return m;
  }, [bookings, selectedDay]);

  const qNorm = query.trim().toLowerCase();
  const walkInSessions = daySessions;

  const visibleSessions = useMemo(() => {
    return daySessions.filter((session) => {
      const roster = bookingsByClass.get(session.id) ?? [];
      if (!qNorm) return true;
      return roster.some((b) => b.memberFull.toLowerCase().includes(qNorm));
    });
  }, [daySessions, bookingsByClass, qNorm]);

  const exportCsv = () => {
    const header = ["Class", "Time", "Member", "Short name", "Status", "Credit"];
    const rows: string[] = [];
    for (const session of daySessions) {
      const roster = bookingsByClass.get(session.id) ?? [];
      const filtered = qNorm
        ? roster.filter((b) => b.memberFull.toLowerCase().includes(qNorm))
        : roster;
      for (const b of filtered) {
        rows.push(
          [
            session.name,
            `${formatClassTime(session.starts_at)} – ${formatClassTime(session.ends_at)}`,
            b.memberFull,
            b.memberShort,
            rosterStatusLabel(b.status),
            b.creditLabel,
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        );
      }
    }
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-${selectedDay.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateBookingStatus = async (id: string, status: "attended" | "confirmed") => {
    const patch =
      status === "attended"
        ? {
            status: "attended" as const,
            checked_in: true,
            checked_in_at: new Date().toISOString(),
          }
        : {
            status: "confirmed" as const,
            checked_in: false,
            checked_in_at: null as string | null,
          };
    const { error } = await supabase.from("bookings").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (status === "attended") {
      const row = bookings.find((r) => r.id === id);
      if (row?.profile_id && row.classStartsAtIso) {
        await supabase.from("challenge_checkins").insert({
          profile_id: row.profile_id,
          class_date: new Date(row.classStartsAtIso).toISOString().split("T")[0],
          booking_id: id,
        });
      }
    } else {
      await deleteMayChallengeCheckInForBooking(id);
    }
    toast.success(status === "attended" ? "Checked in" : "Undone");
    await loadWeek();
  };

  const confirmRemoveBooking = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await cancelBookingWithPolicy({
        bookingId: removeTarget.id,
        cancellationReason: "admin_cancelled",
        waiveLateFee,
      });
      toast.success(
        res.lateCancel && !res.waived
          ? "Booking removed. Late cancellation fee pending."
          : "Booking removed and credit returned.",
      );
      setRemoveTarget(null);
      setWaiveLateFee(false);
      await loadWeek();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove booking");
    } finally {
      setRemoving(false);
    }
  };

  const isExpanded = (id: string) => expanded[id] !== false;

  const toggleGroup = (id: string) => {
    setExpanded((e) => ({ ...e, [id]: !isExpanded(id) }));
  };

  const today = startOfDay(new Date());

  return (
    <div className="pb-10">
      <PageHeader
        title="Bookings"
        description="Daily rosters by class"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setWalkInOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 sm:px-4"
              style={{ backgroundColor: SAGE }}
            >
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
              Walk-in
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl border-2 bg-card px-3.5 py-2 text-sm font-semibold transition hover:bg-muted/60 sm:px-4"
              style={{ borderColor: SAGE, color: SAGE }}
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden /> Export CSV
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => {
            const n = addDays(viewWeekStart, -7);
            setViewWeekStart(n);
            setSelectedDay((d) => addDays(d, -7));
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-border bg-card px-2 py-3 sm:px-3">
          <div className="flex justify-between gap-1 sm:gap-2">
            {stripDays.map((d) => {
              const isSel = isSameDay(d, selectedDay);
              const isToday = isSameDay(d, today);
              return (
                <button
                  key={d.getTime()}
                  type="button"
                  onClick={() => setSelectedDay(startOfDay(d))}
                  className={cn(
                    "flex min-w-[40px] flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-semibold transition sm:min-w-[48px] sm:py-2.5",
                    isSel && "text-white shadow-md",
                    !isSel &&
                      isToday &&
                      "ring-2 ring-[#a3b693] ring-offset-2 ring-offset-background text-[#5f6b52]",
                    !isSel && !isToday && "text-muted-foreground hover:bg-muted/80",
                  )}
                  style={isSel ? { backgroundColor: SAGE } : undefined}
                >
                  <span className="text-[10px] uppercase opacity-80 sm:text-[11px]">
                    {stripLetter(d.getDay())}
                  </span>
                  <span className="font-display text-base sm:text-lg">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          aria-label="Next week"
          onClick={() => {
            const n = addDays(viewWeekStart, 7);
            setViewWeekStart(n);
            setSelectedDay((d) => addDays(d, 7));
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members for this day…"
          className="w-full rounded-xl border-2 border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#a3b693]"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Loading bookings…
        </div>
      ) : daySessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No classes scheduled for this day.
        </div>
      ) : visibleSessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No members match &ldquo;{query.trim()}&rdquo; for classes on this day.
        </div>
      ) : (
        <ul className="space-y-3 sm:space-y-4">
          {visibleSessions.map((session) => {
            const roster = bookingsByClass.get(session.id) ?? [];
            const filtered = qNorm
              ? roster.filter((b) => b.memberFull.toLowerCase().includes(qNorm))
              : roster;

            const open = isExpanded(session.id);

            return (
              <li
                key={session.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(session.id)}
                  className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-muted/30 sm:gap-4 sm:p-4"
                  aria-expanded={open}
                >
                  <div className="sm:pt-0.5">
                    {open ? (
                      <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <ChevronRight
                        className="h-5 w-5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </div>
                  <CapacityDonut booked={session.booked_count} capacity={session.capacity} />
                  <div className="min-w-0 flex-1 pt-1">
                    <p
                      className="font-mono text-sm font-semibold tracking-tight"
                      style={{ color: SAGE }}
                    >
                      {formatClassTime(session.starts_at)} — {formatClassTime(session.ends_at)}
                    </p>
                    <p className="mt-1 font-display text-base font-bold leading-snug text-foreground sm:text-lg">
                      {session.name}
                    </p>
                    {session.guide_name?.trim() && (
                      <p className="text-sm text-muted-foreground">
                        with {session.guide_name.trim()}
                      </p>
                    )}
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {session.location?.trim() || "—"}
                    </p>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-border bg-muted/20 px-3 py-3 sm:px-4 sm:pb-4">
                    {filtered.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No bookings yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/70">
                        {filtered.map((b) => {
                          const isIn = b.status === "attended";
                          const isCancelled = b.status === "cancelled";
                          const isNoShow = b.status === "no-show";
                          return (
                            <li
                              key={b.id}
                              className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0 sm:flex-nowrap sm:gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="flex min-w-0 flex-wrap items-center gap-1.5 font-medium text-foreground">
                                  <span className="min-w-0 truncate">{b.memberShort}</span>
                                  <RosterAddonPills
                                    mat={b.matAddon}
                                    towel={b.towelAddon}
                                    cafe={b.hasSageCredit}
                                  />
                                </p>
                              </div>
                              <span className={rosterStatusClass(b.status)}>
                                {rosterStatusLabel(b.status)}
                              </span>
                              <div className="flex w-full justify-end gap-2 sm:w-auto sm:flex-none">
                                {isIn ? (
                                  <button
                                    type="button"
                                    onClick={() => void updateBookingStatus(b.id, "confirmed")}
                                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted sm:flex-none sm:py-1.5"
                                  >
                                    <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Undo
                                  </button>
                                ) : isCancelled ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRemoveTarget(b);
                                        setWaiveLateFee(false);
                                      }}
                                      hidden={isGuide}
                                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition hover:bg-destructive/20 sm:flex-none sm:py-1.5"
                                    >
                                      <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      Remove
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void updateBookingStatus(b.id, "attended")}
                                      className={cn(
                                        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 sm:flex-none sm:py-1.5",
                                        isNoShow && "opacity-90",
                                      )}
                                      style={{ backgroundColor: SAGE }}
                                    >
                                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      Check in
                                    </button>
                                  </>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <WalkInSheet
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        dayClasses={walkInSessions}
        onDone={() => void loadWeek()}
      />
      <Sheet
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
            setWaiveLateFee(false);
          }
        }}
      >
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle>Remove booking</SheetTitle>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              This applies the booking cancellation policy and refunds credits. For late
              cancellations (within 2 hours), fee pending is set unless waived.
            </p>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={waiveLateFee}
                onChange={(e) => setWaiveLateFee(e.target.checked)}
              />
              <span className="text-sm font-medium">Waive fee</span>
            </label>
          </div>
          <SheetFooter className="mt-8">
            <SheetClose asChild>
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </SheetClose>
            <button
              type="button"
              onClick={() => void confirmRemoveBooking()}
              disabled={removing}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {removing ? "Removing..." : "Remove booking"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WalkInSheet({
  open,
  onOpenChange,
  dayClasses,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dayClasses: WeekClassRow[];
  onDone: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setEmail("");
  }, [open]);

  useEffect(() => {
    if (dayClasses[0]?.id) {
      setClassId((id) => id || dayClasses[0].id);
    }
  }, [dayClasses]);

  const submit = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim().toLowerCase();
    if (!fn || !ln || !em) {
      toast.error("First name, last name, and email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (!classId) {
      toast.error("Choose a class.");
      return;
    }

    const displayName = `${fn} ${ln}`.trim();

    setSaving(true);

    const { data: existing, error: findErr } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", em)
      .maybeSingle();

    if (findErr) {
      console.error(findErr);
      toast.error(findErr.message);
      setSaving(false);
      return;
    }

    let profileId = existing?.id as string | undefined;

    if (!profileId) {
      const { data: created, error: createErr } = await supabase
        .from("profiles")
        .insert({
          first_name: fn,
          last_name: ln,
          email: em,
          role: "customer",
        })
        .select("id")
        .single();

      if (createErr || !created?.id) {
        console.error(createErr);
        toast.error(createErr?.message ?? "Could not create profile.");
        setSaving(false);
        return;
      }
      profileId = created.id as string;
    }

    const session = dayClasses.find((c) => c.id === classId);
    const checkedAt = new Date().toISOString();
    const { data: newBooking, error: bookErr } = await supabase
      .from("bookings")
      .insert({
        profile_id: profileId,
        class_id: classId,
        status: "attended",
        payment_method: "drop_in",
        qr_token: globalThis.crypto.randomUUID(),
        checked_in: true,
        checked_in_at: checkedAt,
      })
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (bookErr) {
      toast.error(bookErr.message);
      return;
    }
    if (newBooking?.id && profileId && session?.starts_at) {
      await supabase.from("challenge_checkins").insert({
        profile_id: profileId,
        class_date: new Date(session.starts_at).toISOString().split("T")[0],
        booking_id: newBooking.id as string,
      });
    }
    if (session?.starts_at) {
      await supabase.functions.invoke("send-email", {
        body: {
          to: em,
          template: bookingConfirmationTemplateForClassType(session.class_type),
          data: bookingConfirmationEmailData({
            className: session.name,
            startsAtIso: session.starts_at,
            guideName: session.guide_name,
            location: session.location,
            matAddon: false,
            towelAddon: false,
          }),
        },
      });
    }
    toast.success(`${displayName} checked in`);
    onOpenChange(false);
    onDone();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle>Walk-in</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              First name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Last name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Class
            </label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Pick a class" />
              </SelectTrigger>
              <SelectContent>
                {dayClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {formatClassTime(c.starts_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter className="mt-6 flex-row justify-end gap-2">
          <SheetClose asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </SheetClose>
          <button
            type="button"
            disabled={saving || dayClasses.length === 0}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: SAGE }}
          >
            <Check className="h-4 w-4 shrink-0" aria-hidden /> Add walk-in
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
