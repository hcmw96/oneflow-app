import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, QrCode, UserPlus, Check, Undo2, X, Filter } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { QRScanner } from "@/components/admin/QRScanner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { awardClassesAttendedBadges } from "@/lib/badges";
import {
  fetchRosterMemberAddonAccess,
  RosterAddonPills,
} from "@/components/admin/RosterAddonPills";
import {
  bookingConfirmationEmailData,
  bookingConfirmationTemplateForClassType,
} from "@/lib/bookingConfirmationEmail";
import { CheckInRosterMemberAvatar } from "@/components/admin/CheckInRosterMemberAvatar";
import { CheckInRosterStatusPill } from "@/components/admin/CheckInRosterStatusPill";
import {
  type BookingRow,
  type RosterRow,
  formatClassTime,
  normalizeBooking,
  oneClass,
  oneProfile,
  patchBookingAttendance,
} from "@/lib/checkInRoster";

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

type RosterCheckFilter = "all" | "checked_in" | "not_yet";

function CheckInPage() {
  const search = Route.useSearch();
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [query, setQuery] = useState("");
  const [rosterCheckFilter, setRosterCheckFilter] = useState<RosterCheckFilter>("all");
  const [filterMatAddon, setFilterMatAddon] = useState(false);
  const [filterTowelAddon, setFilterTowelAddon] = useState(false);
  const [activeSession, setActiveSession] = useState<string>("all");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const qrDedupeRef = useRef<string | null>(null);
  const qrDedupeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const checkInFilterCount =
    Number(activeSession !== "all") +
    Number(rosterCheckFilter !== "all") +
    Number(filterMatAddon) +
    Number(filterTowelAddon) +
    Number(query.trim().length > 0);

  const clearCheckInFilters = () => {
    setActiveSession("all");
    setRosterCheckFilter("all");
    setFilterMatAddon(false);
    setFilterTowelAddon(false);
    setQuery("");
  };

  const filtered = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return roster.filter((b) => {
      if (activeSession !== "all" && b.class_id !== activeSession) return false;
      if (ql && !b.member.toLowerCase().includes(ql)) return false;
      if (rosterCheckFilter === "checked_in") {
        if (b.status !== "attended") return false;
      } else if (rosterCheckFilter === "not_yet") {
        if (b.status === "attended" || b.status === "cancelled") return false;
      }
      if (filterMatAddon && !b.matAddon) return false;
      if (filterTowelAddon && !b.towelAddon) return false;
      return true;
    });
  }, [roster, activeSession, query, rosterCheckFilter, filterMatAddon, filterTowelAddon]);

  const checkedInCount = roster.filter((r) => r.status === "attended").length;
  const totalCapacity = sessions.reduce((s, x) => s + x.capacity, 0);
  const utilisation = totalCapacity ? Math.round((checkedInCount / totalCapacity) * 100) : 0;

  const updateBookingStatus = async (id: string, status: "attended" | "confirmed") => {
    const row = roster.find((r) => r.id === id);
    const ctx =
      row?.profileId && row.classStartsAt
        ? { profileId: row.profileId, classStartsAt: row.classStartsAt }
        : null;
    const { error } = await patchBookingAttendance(supabase, {
      bookingId: id,
      status,
      context: ctx,
    });
    if (error) {
      toast.error(error);
      return;
    }
    if (status === "attended") {
      toast.success("Checked in · +10 Flow Points");
    } else {
      toast.success("Reverted to confirmed");
    }
    await loadData();
  };

  const handleQrScan = async (decodedText: string) => {
    const token = decodedText.trim();
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
      .eq("status", "confirmed")
      .maybeSingle();

    if (findError) {
      console.error("check-in: QR booking lookup failed", findError);
      toast.error(supabaseErrorMessage(findError, "Could not look up booking"));
      return;
    }

    if (!booking?.id) {
      const { data: existingBooking } = await supabase
        .from("bookings")
        .select("id, status, checked_in, qr_used")
        .eq("qr_token", token)
        .maybeSingle();

      const alreadyUsed =
        !!existingBooking &&
        (existingBooking.qr_used === true ||
          existingBooking.checked_in === true ||
          existingBooking.status === "attended");

      if (alreadyUsed) {
        toast.warning("Already checked in", {
          duration: 3500,
          className:
            "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50",
        });
        return;
      }

      toast.error("Invalid QR code", {
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      });
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
      <PageHeader
        title="Check-In"
        actions={
          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
            Walk-in
          </button>
        }
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading check-in…</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,260px)_minmax(0,1fr)] gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <div className="flex max-h-[38%] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3">
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

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3">
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search member by name…"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="mt-2 flex shrink-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-semibold text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" aria-hidden />
                  Roster filters
                  {checkInFilterCount > 0 ? (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {checkInFilterCount}
                    </span>
                  ) : null}
                </span>
                {checkInFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-muted-foreground"
                    onClick={clearCheckInFilters}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Clear filters
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["All", "all" as const],
                    ["Checked in", "checked_in" as const],
                    ["Not yet", "not_yet" as const],
                  ] as const
                ).map(([label, key]) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={rosterCheckFilter === key ? "default" : "outline"}
                    className={cn(
                      rosterCheckFilter === key && "bg-primary text-primary-foreground",
                    )}
                    onClick={() => setRosterCheckFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={filterMatAddon ? "default" : "outline"}
                  className={cn(filterMatAddon && "bg-primary text-primary-foreground")}
                  onClick={() => setFilterMatAddon((v) => !v)}
                >
                  Mat add-on
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filterTowelAddon ? "default" : "outline"}
                  className={cn(filterTowelAddon && "bg-primary text-primary-foreground")}
                  onClick={() => setFilterTowelAddon((v) => !v)}
                >
                  Towel add-on
                </Button>
              </div>
            </div>

            <ul className="mt-2 min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {filtered.length === 0 && (
                <li className="py-10 text-center text-sm text-muted-foreground">
                  No matching attendees.
                </li>
              )}
              {filtered.map((b) => {
                const isIn = b.status === "attended";
                const isNoShow = b.status === "no-show";
                const isCancelled = b.status === "cancelled";
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                    <CheckInRosterMemberAvatar row={b} />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold">
                        <span className="min-w-0 truncate">{b.member}</span>
                        <RosterAddonPills
                          mat={b.matAddon}
                          towel={b.towelAddon}
                          cafe={b.hasSageCredit}
                        />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.className} · {b.startsAtLabel.split("·")[1]?.trim()} · {b.creditLabel}
                      </p>
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <CheckInRosterStatusPill status={b.status} />
                      {isIn ? (
                        <button
                          type="button"
                          onClick={() => void updateBookingStatus(b.id, "confirmed")}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted sm:flex-none"
                        >
                          <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Undo
                        </button>
                      ) : isCancelled ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateBookingStatus(b.id, "attended")}
                          className={cn(
                            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none",
                            isNoShow
                              ? "border border-border bg-background hover:bg-muted"
                              : "bg-primary text-primary-foreground hover:opacity-90",
                          )}
                        >
                          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {isNoShow ? "Mark attended" : "Check in"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
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
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
                <QRScanner
                  defaultFacing="user"
                  size="large"
                  className="mx-0 w-full"
                  onScan={(text: string) => void handleQrScan(text)}
                />
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Members hold their booking QR up to the front camera.
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2">
              <Stat label="Checked in" value={checkedInCount} />
              <Stat label="Capacity" value={`${utilisation}%`} />
            </div>
          </div>
        </div>
      )}

      <WalkInSheet
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        todayClasses={todayClasses}
        onDone={() => void loadData()}
      />
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

function WalkInSheet({
  open,
  onOpenChange,
  todayClasses,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  todayClasses: TodayClass[];
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
    if (todayClasses[0]?.id) {
      setClassId((id) => id || todayClasses[0].id);
    }
  }, [todayClasses]);

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
      console.error("walk-in profile lookup failed", findErr);
      toast.error(supabaseErrorMessage(findErr, "Could not look up profile"));
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
        console.error("walk-in profile create failed", createErr);
        toast.error(supabaseErrorMessage(createErr, "Could not create profile — please try again"));
        setSaving(false);
        return;
      }
      profileId = created.id as string;
    }

    const session = todayClasses.find((c) => c.id === classId);
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
      console.error("walk-in booking insert failed", bookErr);
      toast.error(supabaseErrorMessage(bookErr, "Could not create booking"));
      return;
    }
    if (newBooking?.id && profileId && session?.starts_at) {
      await supabase.from("challenge_checkins").insert({
        profile_id: profileId,
        class_date: new Date(session.starts_at).toISOString().split("T")[0],
        booking_id: newBooking.id as string,
      });
      void awardClassesAttendedBadges(profileId);
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
    toast.success(`${displayName} checked in · +10 Flow Points`);
    onOpenChange(false);
    onDone();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle>Walk-in check-in</SheetTitle>
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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
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
                {todayClasses.map((c) => (
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
              <X className="h-4 w-4 shrink-0" aria-hidden /> Cancel
            </button>
          </SheetClose>
          <button
            type="button"
            disabled={saving || todayClasses.length === 0}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Check className="h-4 w-4 shrink-0" aria-hidden /> Check in
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
