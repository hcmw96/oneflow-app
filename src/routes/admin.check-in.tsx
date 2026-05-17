import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { QRScanner } from "@/components/admin/QRScanner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { cn } from "@/lib/utils";
import { awardClassesAttendedBadges } from "@/lib/badges";
import { fetchRosterMemberAddonAccess } from "@/components/admin/RosterAddonPills";
import {
  type BookingRow,
  type RosterRow,
  formatClassTime,
  normalizeBooking,
  oneClass,
  oneProfile,
} from "@/lib/checkInRoster";
import { parseQrCheckInToken } from "@/lib/qrCheckIn";

export const Route = createFileRoute("/admin/check-in")({
  validateSearch: (raw: Record<string, unknown>) => ({
    class: typeof raw.class === "string" ? raw.class : undefined,
  }),
  component: CheckInPage,
});

type TodayClass = {
  id: string;
  name: string;
  class_type: string;
  starts_at: string;
  capacity: number;
  booked_count: number;
  location: string | null;
  guide_name: string | null;
  guide_id: string | null;
};

function CheckInPage() {
  const search = Route.useSearch();
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [activeSession, setActiveSession] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const qrDedupeRef = useRef<string | null>(null);
  const qrDedupeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrInvalidToastRef = useRef<string | null>(null);

  useEffect(() => {
    if (search.class) setActiveSession(search.class);
  }, [search.class]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const day = new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, starts_at, capacity, booked_count, location, guide_name, guide_id",
      )
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString())
      .eq("is_cancelled", false)
      .order("starts_at");

    if (classesError) {
      console.error("check-in: classes load failed", classesError);
      toast.error(supabaseErrorMessage(classesError, "Could not load today’s classes"));
      setTodayClasses([]);
      setRoster([]);
      setLoading(false);
      return;
    }

    const rawClasses = (classesData ?? []) as unknown as Record<string, unknown>[];
    const classes: TodayClass[] = rawClasses.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      class_type: String(row.class_type ?? ""),
      starts_at: String(row.starts_at ?? ""),
      capacity: Number(row.capacity ?? 0),
      booked_count: Number(row.booked_count ?? 0),
      location: (row.location as string | null) ?? null,
      guide_name: (row.guide_name as string | null) ?? null,
      guide_id: (row.guide_id as string | null) ?? null,
    }));
    setTodayClasses(classes);

    const classIds = classes.map((c) => c.id);

    if (classIds.length === 0) {
      setRoster([]);
      setLoading(false);
      return;
    }

    const [{ data: bookingsData, error: bookingsError }, addonAccess] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          `
        id,
        status,
        profile_id,
        class_id,
        qr_token,
        payment_method,
        mat_addon,
        towel_addon,
        profiles ( first_name, last_name, avatar_url ),
        classes ( id, name, starts_at, guide_name )
      `,
        )
        .in("class_id", classIds),
      fetchRosterMemberAddonAccess(supabase),
    ]);

    if (bookingsError) {
      console.error("check-in: bookings load failed", bookingsError);
      toast.error(supabaseErrorMessage(bookingsError, "Could not load bookings"));
      setRoster([]);
      setLoading(false);
      return;
    }

    const rows = (bookingsData ?? []) as unknown as BookingRow[];
    const normalized = rows
      .map((row) => normalizeBooking(row, addonAccess))
      .filter((r): r is RosterRow => r !== null);
    setRoster(normalized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-checkin-bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const sessions = useMemo(() => {
    return todayClasses.map((c) => {
      const forClass = roster.filter((b) => b.class_id === c.id);
      const total = forClass.filter((b) => b.status !== "cancelled").length;
      const attended = forClass.filter((b) => b.status === "attended").length;
      return {
        key: c.id,
        label: c.name,
        time: formatClassTime(c.starts_at),
        total,
        attended,
        capacity: c.capacity,
        guideName: c.guide_name,
      };
    });
  }, [todayClasses, roster]);

  const checkedInCount = roster.filter((r) => r.status === "attended").length;
  const totalCapacity = sessions.reduce((s, x) => s + x.capacity, 0);
  const utilisation = totalCapacity ? Math.round((checkedInCount / totalCapacity) * 100) : 0;

  const toastQrIssue = (key: string, message: string, variant: "error" | "warning" = "error") => {
    if (qrInvalidToastRef.current === key) return;
    qrInvalidToastRef.current = key;
    if (qrDedupeTimerRef.current) clearTimeout(qrDedupeTimerRef.current);
    qrDedupeTimerRef.current = setTimeout(() => {
      qrInvalidToastRef.current = null;
    }, 3200);
    if (variant === "warning") {
      toast.warning(message, {
        duration: 3500,
        className:
          "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50",
      });
    } else {
      toast.error(message, {
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      });
    }
  };

  const handleQrScan = async (decodedText: string) => {
    const token = parseQrCheckInToken(decodedText);
    if (!token) return;

    if (qrDedupeRef.current === token) return;
    qrDedupeRef.current = token;
    if (qrDedupeTimerRef.current) clearTimeout(qrDedupeTimerRef.current);
    qrDedupeTimerRef.current = setTimeout(() => {
      qrDedupeRef.current = null;
    }, 3200);

    const { data: booking, error: findError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        profile_id,
        status,
        checked_in,
        qr_used,
        classes ( starts_at ),
        profiles ( first_name, last_name )
      `,
      )
      .eq("qr_token", token)
      .maybeSingle();

    if (findError) {
      console.error("check-in: QR booking lookup failed", findError);
      toast.error(supabaseErrorMessage(findError, "Could not look up booking"));
      return;
    }

    if (!booking?.id) {
      toastQrIssue(
        `missing:${token}`,
        "No booking found for this code. Use the QR from My Bookings in the app.",
      );
      return;
    }

    const status = String(booking.status ?? "");
    const alreadyUsed =
      booking.qr_used === true ||
      booking.checked_in === true ||
      status === "attended";

    if (alreadyUsed) {
      toastQrIssue("already-in", "Already checked in", "warning");
      return;
    }

    if (status === "cancelled") {
      toastQrIssue(`cancelled:${token}`, "This booking was cancelled.");
      return;
    }

    if (status !== "confirmed") {
      toastQrIssue(`status:${token}`, `Booking is ${status.replace(/_/g, " ")} — cannot check in.`);
      return;
    }

    const prof = oneProfile(booking.profiles as BookingRow["profiles"]);
    const firstName = prof?.first_name?.trim() || "Member";
    const checkedAt = new Date().toISOString();
    const { error: upError } = await supabase
      .from("bookings")
      .update({
        status: "attended",
        checked_in: true,
        checked_in_at: checkedAt,
        qr_used: true,
      })
      .eq("id", booking.id);

    if (upError) {
      console.error("check-in: QR check-in update failed", upError);
      toast.error(supabaseErrorMessage(upError, "Could not check in"));
      return;
    }

    const cls = oneClass(booking.classes as BookingRow["classes"]);
    const startsAt = cls?.starts_at;
    if (booking.profile_id && startsAt) {
      await supabase.from("challenge_checkins").insert({
        profile_id: booking.profile_id as string,
        class_date: new Date(startsAt).toISOString().split("T")[0],
        booking_id: booking.id as string,
      });
      void awardClassesAttendedBadges(booking.profile_id as string);
    }

    toast.success(`Welcome ${firstName}! · +10 Flow Points`, {
      duration: 3000,
      className:
        "!border-emerald-600/30 !bg-emerald-600 !px-6 !py-5 !text-lg !font-semibold !text-white !shadow-md",
    });
    await loadData();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title="Check-In" />

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading check-in…</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,260px)_minmax(0,1fr)] gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3">
            <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Today&apos;s classes
            </p>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
              <SessionChip
                active={activeSession === "all"}
                onClick={() => setActiveSession("all")}
                label="All today"
                meta={`${roster.length} booked`}
              />
              {sessions.map((s) => (
                <SessionChip
                  key={s.key}
                  active={activeSession === s.key}
                  onClick={() => setActiveSession(s.key)}
                  label={s.label}
                  meta={`${s.time} · ${s.attended}/${s.total}`}
                  guideName={s.guideName}
                />
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card p-3",
              )}
            >
              <div className="mb-4 flex w-full items-center gap-2 text-sm font-semibold">
                <QrCode className="h-4 w-4 shrink-0 text-[#a3b693]" aria-hidden />
                Self check-in QR
              </div>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1">
                <QRScanner
                  defaultFacing="user"
                  size="large"
                  showFlipButton
                  className="w-full"
                  onScan={(text: string) => void handleQrScan(text)}
                />
              </div>
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Hold the member&apos;s booking QR inside the green frame, about arm&apos;s length
                away.
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2">
              <Stat label="Checked in" value={checkedInCount} />
              <Stat label="Capacity" value={`${utilisation}%`} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionChip({
  active,
  onClick,
  label,
  meta,
  guideName,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  meta: string;
  guideName?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border px-3 py-2 text-left transition-colors",
        active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted",
      )}
    >
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-[10px] text-muted-foreground">{meta}</p>
      {guideName ? (
        <p className="mt-1 text-[10px] font-medium text-[#4a5a42]">Guide · {guideName}</p>
      ) : null}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

