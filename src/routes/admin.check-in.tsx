import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, QrCode, UserPlus, Check, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { QRScanner } from "@/components/admin/QRScanner";
import { supabase } from "@/lib/supabase";
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

export const Route = createFileRoute("/admin/check-in")({
  component: CheckInPage,
});

type BookingStatus = "attended" | "confirmed" | "cancelled" | "no-show";

type TodayClass = {
  id: string;
  name: string;
  starts_at: string;
  capacity: number;
  booked_count: number;
  guide_name: string | null;
};

type ProfileJoin = { first_name: string; last_name: string } | null;

type BookingRow = {
  id: string;
  status: string;
  profile_id: string;
  class_id: string;
  qr_token: string | null;
  payment_method: string | null;
  profiles: ProfileJoin | ProfileJoin[] | null;
  classes:
    | { id: string; name: string; starts_at: string; guide_name: string | null }
    | { id: string; name: string; starts_at: string; guide_name: string | null }[]
    | null;
};

type RosterRow = {
  id: string;
  status: BookingStatus;
  member: string;
  class_id: string;
  className: string;
  startsAtLabel: string;
  creditLabel: string;
};

function oneProfile(p: BookingRow["profiles"]): ProfileJoin {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

function oneClass(c: BookingRow["classes"]) {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatClassTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
}

function normalizeBooking(raw: BookingRow): RosterRow | null {
  const prof = oneProfile(raw.profiles);
  const member =
    prof && `${prof.first_name} ${prof.last_name}`.trim()
      ? `${prof.first_name} ${prof.last_name}`.trim()
      : "Unknown member";
  const cls = oneClass(raw.classes);
  if (!cls) return null;
  const status = raw.status as BookingStatus;
  if (!["attended", "confirmed", "cancelled", "no-show"].includes(status)) return null;
  return {
    id: raw.id,
    status,
    member,
    class_id: raw.class_id,
    className: cls.name,
    startsAtLabel: `Today · ${formatClassTime(cls.starts_at)}`,
    creditLabel: raw.payment_method?.replace(/_/g, " ") ?? "—",
  };
}

function CheckInPage() {
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [query, setQuery] = useState("");
  const [activeSession, setActiveSession] = useState<string>("all");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const qrDedupeRef = useRef<string | null>(null);
  const qrDedupeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const day = new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("id, name, starts_at, capacity, booked_count, guide_name")
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString())
      .eq("is_cancelled", false)
      .order("starts_at");

    if (classesError) {
      console.error(classesError);
      toast.error("Could not load today’s classes");
      setTodayClasses([]);
      setRoster([]);
      setLoading(false);
      return;
    }

    const classes = (classesData ?? []) as TodayClass[];
    setTodayClasses(classes);
    const classIds = classes.map((c) => c.id);

    if (classIds.length === 0) {
      setRoster([]);
      setLoading(false);
      return;
    }

    const { data: bookingsData, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        status,
        profile_id,
        class_id,
        qr_token,
        payment_method,
        profiles ( first_name, last_name ),
        classes ( id, name, starts_at, guide_name )
      `,
      )
      .in("class_id", classIds);

    if (bookingsError) {
      console.error(bookingsError);
      toast.error("Could not load bookings");
      setRoster([]);
      setLoading(false);
      return;
    }

    const rows = (bookingsData ?? []) as unknown as BookingRow[];
    const normalized = rows.map(normalizeBooking).filter((r): r is RosterRow => r !== null);
    setRoster(normalized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
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
      };
    });
  }, [todayClasses, roster]);

  const filtered = roster.filter((b) => {
    if (activeSession !== "all" && b.class_id !== activeSession) return false;
    if (query && !b.member.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const checkedInCount = roster.filter((r) => r.status === "attended").length;
  const totalCapacity = sessions.reduce((s, x) => s + x.capacity, 0);
  const utilisation = totalCapacity ? Math.round((checkedInCount / totalCapacity) * 100) : 0;

  const updateBookingStatus = async (id: string, status: "attended" | "confirmed") => {
    const patch =
      status === "attended"
        ? {
            status,
            checked_in: true,
            checked_in_at: new Date().toISOString(),
          }
        : {
            status,
            checked_in: false,
            checked_in_at: null as string | null,
          };
    const { error } = await supabase.from("bookings").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "attended" ? "Checked in" : "Reverted to confirmed");
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
        status,
        checked_in,
        profiles ( first_name, last_name )
      `,
      )
      .eq("qr_token", token)
      .maybeSingle();

    if (findError) {
      console.error(findError);
      toast.error(findError.message);
      return;
    }

    if (!booking?.id) {
      toast.error("QR code not recognised", {
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      });
      return;
    }

    const prof = oneProfile(booking.profiles as BookingRow["profiles"]);
    const firstName = prof?.first_name?.trim() || "Member";
    const displayName =
      prof && `${prof.first_name} ${prof.last_name}`.trim()
        ? `${prof.first_name} ${prof.last_name}`.trim()
        : "Member";

    if (booking.status === "cancelled") {
      toast.error("This booking is cancelled");
      return;
    }

    const alreadyCheckedIn =
      booking.status === "attended" || !!(booking as { checked_in?: boolean | null }).checked_in;

    if (alreadyCheckedIn) {
      toast.warning(`${displayName} is already checked in`, {
        duration: 4000,
        className:
          "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50",
      });
      return;
    }

    const checkedAt = new Date().toISOString();
    const { error: upError } = await supabase
      .from("bookings")
      .update({
        status: "attended",
        checked_in: true,
        checked_in_at: checkedAt,
      })
      .eq("id", booking.id);

    if (upError) {
      toast.error(upError.message);
      return;
    }

    toast.success(`Welcome ${firstName}!`, {
      duration: 3000,
      className:
        "!border-emerald-600/30 !bg-emerald-600 !px-6 !py-5 !text-lg !font-semibold !text-white !shadow-md",
    });
    await loadData();
  };

  return (
    <div>
      <PageHeader
        title="Check-In"
        description="Mark attendance for today's classes"
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
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 lg:col-span-2">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
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
                />
              ))}
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search member by name…"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <ul className="mt-3 divide-y divide-border">
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
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {initials(b.member)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{b.member}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.className} · {b.startsAtLabel.split("·")[1]?.trim()} · {b.creditLabel}
                      </p>
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <StatusPill status={b.status} />
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

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <QrCode className="h-4 w-4 shrink-0 text-primary" aria-hidden /> Self check-in QR
              </div>
              <div className="mt-4">
                <QRScanner onScan={(text: string) => void handleQrScan(text)} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Members show their booking QR at the desk. The scanner uses the rear camera
                (tablet).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  meta: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-xl border px-3 py-2 text-left transition-colors",
        active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted",
      )}
    >
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-[10px] text-muted-foreground">{meta}</p>
    </button>
  );
}

function StatusPill({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, string> = {
    attended: "bg-success/20 text-success-foreground",
    confirmed: "bg-muted text-foreground",
    cancelled: "bg-destructive/15 text-destructive",
    "no-show": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        map[status],
      )}
    >
      {status}
    </span>
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

    const checkedAt = new Date().toISOString();
    const { error: bookErr } = await supabase.from("bookings").insert({
      profile_id: profileId,
      class_id: classId,
      status: "attended",
      payment_method: "drop_in",
      checked_in: true,
      checked_in_at: checkedAt,
    });
    setSaving(false);
    if (bookErr) {
      toast.error(bookErr.message);
      return;
    }
    toast.success(`${displayName} checked in`);
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
