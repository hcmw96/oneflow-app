import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { QRScanner } from "@/components/admin/QRScanner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { awardClassesAttendedBadges } from "@/lib/badges";
import { checkInBookingByQrRpc } from "@/lib/checkInQr";
import { fetchRosterMemberAddonAccess } from "@/components/admin/RosterAddonPills";
import { jhbDayBounds } from "@/lib/jhbTime";
import { upsertMayChallengeCheckIn } from "@/lib/mayChallengeCheckIn";
import {
  type BookingRow,
  type RosterRow,
  formatClassTime,
  normalizeBooking,
  oneClass,
  oneProfile,
} from "@/lib/checkInRoster";
import { parseQrCheckInToken } from "@/lib/qrCheckIn";
import { pickNextUpcomingClassId } from "@/lib/checkInUpcoming";
import { welcomeCheckInToastMessage } from "@/lib/flowPoints";
import { CheckInRosterList } from "@/components/admin/CheckInRosterList";

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
  ends_at: string;
  capacity: number;
  booked_count: number;
  location: string | null;
  guide_name: string | null;
  guide_id: string | null;
};

function CheckInPage() {
  const isMobile = useIsMobile();
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

  const nextUpcomingClassId = useMemo(
    () => pickNextUpcomingClassId(todayClasses),
    [todayClasses],
  );

  useEffect(() => {
    if (search.class || loading || todayClasses.length === 0) return;
    const nextId = pickNextUpcomingClassId(todayClasses);
    if (nextId) setActiveSession(nextId);
  }, [search.class, loading, todayClasses]);

  const rosterClassId =
    activeSession === "all" ? nextUpcomingClassId : activeSession;

  const rosterForClass = useMemo(() => {
    if (!rosterClassId) return [];
    return roster.filter((b) => b.class_id === rosterClassId && b.status !== "cancelled");
  }, [roster, rosterClassId]);

  const rosterClassLabel = useMemo(() => {
    if (!rosterClassId) return null;
    return todayClasses.find((c) => c.id === rosterClassId) ?? null;
  }, [rosterClassId, todayClasses]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { startUtcIso, endUtcIso } = jhbDayBounds();

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, starts_at, ends_at, capacity, booked_count, location, guide_name, guide_id",
      )
      .gte("starts_at", startUtcIso)
      .lte("starts_at", endUtcIso)
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
      ends_at: String(row.ends_at ?? ""),
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
        profiles ( first_name, last_name, avatar_url, role ),
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

  const finishQrCheckIn = async (args: {
    bookingId: string;
    profileId: string;
    memberName: string;
    memberRole?: string | null;
    classStartsAt: string | null | undefined;
  }) => {
    const { bookingId, profileId, memberName, memberRole, classStartsAt } = args;
    if (profileId && classStartsAt) {
      await upsertMayChallengeCheckIn({
        profileId,
        bookingId,
        classStartsAtIso: classStartsAt,
      });
      void awardClassesAttendedBadges(profileId);
    }

    toast.success(welcomeCheckInToastMessage(memberName, memberRole), {
      duration: 3000,
      className:
        "!border-emerald-600/30 !bg-emerald-600 !px-6 !py-5 !text-lg !font-semibold !text-white !shadow-md",
    });
    await loadData();
  };

  const handleQrScan = async (decodedText: string) => {
    const token = parseQrCheckInToken(decodedText);
    if (!token) {
      toastQrIssue("parse", "Could not read this QR code. Show the code from My Bookings in the app.");
      return;
    }

    if (qrDedupeRef.current === token) return;
    qrDedupeRef.current = token;
    if (qrDedupeTimerRef.current) clearTimeout(qrDedupeTimerRef.current);
    qrDedupeTimerRef.current = setTimeout(() => {
      qrDedupeRef.current = null;
    }, 3200);

    const { result: rpcResult, rpcError } = await checkInBookingByQrRpc(supabase, token);

    if (rpcError) {
      console.error("check-in: QR RPC failed", rpcError);
      toast.error(rpcError);
      return;
    }

    if (rpcResult) {
      if (!rpcResult.ok) {
        const code = rpcResult.code ?? "error";
        const message =
          rpcResult.message ?? "Could not check in with this code.";
        if (code === "already") {
          toastQrIssue("already-in", message, "warning");
        } else {
          toastQrIssue(`${code}:${token}`, message);
        }
        return;
      }

      await finishQrCheckIn({
        bookingId: String(rpcResult.booking_id),
        profileId: String(rpcResult.profile_id),
        memberName: String(rpcResult.member_name ?? "Member"),
        memberRole:
          typeof rpcResult.member_role === "string" ? rpcResult.member_role : null,
        classStartsAt:
          typeof rpcResult.class_starts_at === "string" ? rpcResult.class_starts_at : null,
      });
      return;
    }

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
        profiles ( first_name, last_name, role )
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
    await finishQrCheckIn({
      bookingId: booking.id as string,
      profileId: booking.profile_id as string,
      memberName: firstName,
      memberRole: prof?.role ?? null,
      classStartsAt: cls?.starts_at,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden max-md:overflow-y-auto max-md:scroll-touch">
      <PageHeader title="Check-In" />

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading check-in…</div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-3",
            "max-md:overflow-visible",
            "md:grid md:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] md:overflow-hidden",
          )}
        >
          <div
            className={cn(
              "flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-3",
              "max-md:max-h-52 max-md:shrink-0",
              "md:min-h-0 md:flex-1",
            )}
          >
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

          <div
            className={cn(
              "flex flex-col gap-2",
              "max-md:shrink-0",
              "md:min-h-0 md:overflow-hidden",
            )}
          >
            <div
              className={cn(
                "flex flex-col rounded-2xl border border-border bg-card p-3",
                "max-md:shrink-0",
                "md:min-h-0 md:flex-1",
              )}
            >
              <div className="mb-3 flex w-full items-center gap-2 text-sm font-semibold md:mb-4">
                <QrCode className="h-4 w-4 shrink-0 text-[#a3b693]" aria-hidden />
                Self check-in QR
              </div>
              <div className="flex shrink-0 flex-col items-center px-1">
                <QRScanner
                  defaultFacing={isMobile ? "environment" : "user"}
                  size={isMobile ? "default" : "large"}
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

            {rosterClassId ? (
              <div
                className={cn(
                  "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3",
                  "max-md:max-h-72 md:min-h-0 md:flex-1",
                )}
              >
                <div className="mb-2 shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Roster · check in manually
                  </p>
                  {rosterClassLabel ? (
                    <p className="mt-0.5 text-sm font-semibold">
                      {rosterClassLabel.name}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {formatClassTime(rosterClassLabel.starts_at)}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                  <CheckInRosterList
                    roster={rosterForClass}
                    loading={loading}
                    compact
                    onUpdated={loadData}
                  />
                </div>
              </div>
            ) : null}
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

