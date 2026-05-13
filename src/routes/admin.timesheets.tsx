import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getUser, supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { AdminLeaveRequestsTab, StaffLeaveRequestSection } from "@/components/admin/LeaveRequestsBlock";

export const Route = createFileRoute("/admin/timesheets")({
  validateSearch: (raw: Record<string, unknown>) => ({
    tab: raw.tab === "leave-requests" ? ("leave-requests" as const) : undefined,
  }),
  head: () => ({ meta: [{ title: "Timesheets — One Flow Admin" }] }),
  component: TimesheetsPage,
});

const TZ = "Africa/Johannesburg";
const PAGE_SIZE = 20;

type StaffRow = { id: string; fullName: string; role: string };

type ShiftRow = {
  id: string;
  profile_id: string;
  staffName: string;
  starts_at: string;
  ends_at: string;
  role_label: string | null;
  location: string | null;
};

type TimesheetRow = {
  id: string;
  profile_id: string;
  staffName: string;
  shift_date: string | null;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  shift_id: string | null;
  notes: string | null;
};

type Role = "director" | "management" | "guide" | "other";

function classifyRole(role: string | null | undefined): Role {
  const r = (role ?? "").toLowerCase();
  if (r === "director") return "director";
  if (r === "management") return "management";
  if (r === "guide") return "guide";
  if (r === "front_desk") return "guide";
  return "other";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function todayJhbISODate(): string {
  const now = new Date();
  const jhbNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const y = jhbNow.getFullYear();
  const m = String(jhbNow.getMonth() + 1).padStart(2, "0");
  const d = String(jhbNow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function combineDateTimeLocal(dateStr: string, timeStr: string): Date {
  const [yy, mo, dd] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(yy, (mo || 1) - 1, dd || 1, hh || 0, mm || 0, 0, 0);
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function hoursBetween(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / 3_600_000;
}

function startOfWeekJhb(): Date {
  const now = new Date();
  const jhb = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const day = (jhb.getDay() + 6) % 7;
  jhb.setHours(0, 0, 0, 0);
  jhb.setDate(jhb.getDate() - day);
  // Convert back to UTC representation for >= filtering.
  const utc = new Date(Date.UTC(jhb.getFullYear(), jhb.getMonth(), jhb.getDate(), -2, 0, 0));
  return utc;
}

function TimesheetsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState<string>("shifts");
  const [role, setRole] = useState<Role>("other");
  const [me, setMe] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Shift sheet state
  const [shiftSheetOpen, setShiftSheetOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [sProfileId, setSProfileId] = useState<string>("");
  const [sDate, setSDate] = useState<string>(todayJhbISODate());
  const [sStart, setSStart] = useState<string>("09:00");
  const [sEnd, setSEnd] = useState<string>("17:00");
  const [sLocation, setSLocation] = useState<string>("Studio 1");
  const [sRoleLabel, setSRoleLabel] = useState<string>("");
  const [shiftToDelete, setShiftToDelete] = useState<ShiftRow | null>(null);

  // Timesheet filters
  const [tsQuery, setTsQuery] = useState("");
  const [tsStaff, setTsStaff] = useState<string>("all");
  const [tsFrom, setTsFrom] = useState("");
  const [tsTo, setTsTo] = useState("");
  const [tsSort, setTsSort] = useState<"date_desc" | "date_asc" | "name_asc">("date_desc");
  const [tsPage, setTsPage] = useState(1);

  // Clock-in
  const [clocking, setClocking] = useState(false);

  useEffect(() => {
    void (async () => {
      const user = await getUser();
      if (!user) return;
      setMe(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("role, first_name, last_name, email")
        .eq("id", user.id)
        .maybeSingle();
      setRole(classifyRole((data as { role?: string } | null)?.role));
      setMyProfile({
        first_name: (data as { first_name?: string | null } | null)?.first_name ?? null,
        last_name: (data as { last_name?: string | null } | null)?.last_name ?? null,
        email: (data as { email?: string | null } | null)?.email ?? null,
      });
    })();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [staffRes, shiftsRes, tsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .in("role", ["guide", "management", "director"])
        .order("first_name", { ascending: true }),
      supabase
        .from("shifts")
        .select(
          "id, profile_id, starts_at, ends_at, role_label, location, profile:profile_id(first_name, last_name)",
        )
        .order("starts_at", { ascending: false })
        .limit(500),
      supabase
        .from("timesheets")
        .select(
          "id, profile_id, shift_date, clocked_in_at, clocked_out_at, shift_id, notes, profile:profile_id(first_name, last_name)",
        )
        .order("shift_date", { ascending: false })
        .limit(1000),
    ]);

    if (staffRes.error) {
      console.error(staffRes.error);
    } else {
      setStaff(
        (staffRes.data ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          fullName:
            `${p.first_name ?? ""} ${p.last_name ?? ""}`.toString().trim() || "Staff",
          role: String(p.role ?? ""),
        })),
      );
    }

    if (shiftsRes.error) {
      console.error(shiftsRes.error);
      toast.error(supabaseErrorMessage(shiftsRes.error, "Could not load shifts"));
      setShifts([]);
    } else {
      setShifts(
        (shiftsRes.data ?? []).map((raw: Record<string, unknown>) => {
          const p = (Array.isArray(raw.profile) ? raw.profile[0] : raw.profile) as
            | { first_name?: string; last_name?: string }
            | null;
          return {
            id: String(raw.id),
            profile_id: String(raw.profile_id),
            staffName:
              `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.toString().trim() || "Staff",
            starts_at: String(raw.starts_at),
            ends_at: String(raw.ends_at),
            role_label: (raw.role_label as string | null) ?? null,
            location: (raw.location as string | null) ?? null,
          };
        }),
      );
    }

    if (tsRes.error) {
      console.error(tsRes.error);
      toast.error(supabaseErrorMessage(tsRes.error, "Could not load timesheets"));
      setTimesheets([]);
    } else {
      setTimesheets(
        (tsRes.data ?? []).map((raw: Record<string, unknown>) => {
          const p = (Array.isArray(raw.profile) ? raw.profile[0] : raw.profile) as
            | { first_name?: string; last_name?: string }
            | null;
          return {
            id: String(raw.id),
            profile_id: String(raw.profile_id),
            staffName:
              `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.toString().trim() || "Staff",
            shift_date: (raw.shift_date as string | null) ?? null,
            clocked_in_at: (raw.clocked_in_at as string | null) ?? null,
            clocked_out_at: (raw.clocked_out_at as string | null) ?? null,
            shift_id: (raw.shift_id as string | null) ?? null,
            notes: (raw.notes as string | null) ?? null,
          };
        }),
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (role === "other") return;
    void loadAll();
  }, [role, loadAll]);

  const isAdmin = role === "director" || role === "management";

  useEffect(() => {
    if (search.tab === "leave-requests" && isAdmin) {
      setTab("leave-requests");
    }
  }, [search.tab, isAdmin]);

  const onTabChange = (v: string) => {
    setTab(v);
    if (v === "leave-requests" && isAdmin) {
      void navigate({
        to: "/admin/timesheets",
        search: { tab: "leave-requests" },
        replace: true,
      });
    } else {
      void navigate({ to: "/admin/timesheets", search: {}, replace: true });
    }
  };

  useEffect(() => {
    if (!isAdmin && tab === "leave-requests") {
      setTab("shifts");
    }
  }, [isAdmin, tab]);

  const groupedShifts = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const s of shifts) {
      const key = new Date(s.starts_at).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [shifts]);

  const filteredTimesheets = useMemo(() => {
    const q = tsQuery.trim().toLowerCase();
    let out = timesheets.filter((t) => {
      if (q && !t.staffName.toLowerCase().includes(q)) return false;
      if (tsStaff !== "all" && t.profile_id !== tsStaff) return false;
      if (tsFrom && (t.shift_date ?? "9999") < tsFrom) return false;
      if (tsTo && (t.shift_date ?? "0000") > tsTo) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (tsSort) {
        case "date_asc":
          return (a.shift_date ?? "").localeCompare(b.shift_date ?? "");
        case "name_asc":
          return a.staffName.localeCompare(b.staffName);
        case "date_desc":
        default:
          return (b.shift_date ?? "").localeCompare(a.shift_date ?? "");
      }
    });
    return out;
  }, [timesheets, tsQuery, tsStaff, tsFrom, tsTo, tsSort]);

  useEffect(() => {
    setTsPage(1);
  }, [tsQuery, tsStaff, tsFrom, tsTo, tsSort]);

  const tsPageCount = Math.max(1, Math.ceil(filteredTimesheets.length / PAGE_SIZE));
  const tsPageRows = filteredTimesheets.slice((tsPage - 1) * PAGE_SIZE, tsPage * PAGE_SIZE);

  const weekStartUtcIso = useMemo(() => startOfWeekJhb().toISOString(), []);
  const weekHoursByStaff = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const t of timesheets) {
      if (!t.clocked_in_at) continue;
      if (t.clocked_in_at < weekStartUtcIso) continue;
      const h = hoursBetween(t.clocked_in_at, t.clocked_out_at);
      tally[t.staffName] = (tally[t.staffName] ?? 0) + h;
    }
    return tally;
  }, [timesheets, weekStartUtcIso]);

  const myActiveTimesheet = useMemo(() => {
    if (!me) return null;
    return (
      timesheets.find(
        (t) => t.profile_id === me && t.clocked_in_at && !t.clocked_out_at,
      ) ?? null
    );
  }, [timesheets, me]);

  const myTodaysShift = useMemo(() => {
    if (!me) return null;
    const today = todayJhbISODate();
    return shifts.find(
      (s) => s.profile_id === me && new Date(s.starts_at).toISOString().slice(0, 10) === today,
    );
  }, [shifts, me]);

  const openAddShift = () => {
    setEditingShiftId(null);
    setSProfileId("");
    setSDate(todayJhbISODate());
    setSStart("09:00");
    setSEnd("17:00");
    setSLocation("Studio 1");
    setSRoleLabel("");
    setShiftSheetOpen(true);
  };

  const openEditShift = (s: ShiftRow) => {
    setEditingShiftId(s.id);
    setSProfileId(s.profile_id);
    const d = new Date(s.starts_at);
    const e = new Date(s.ends_at);
    setSDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    setSStart(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setSEnd(`${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`);
    setSLocation(s.location ?? "Studio 1");
    setSRoleLabel(s.role_label ?? "");
    setShiftSheetOpen(true);
  };

  const saveShift = async () => {
    if (!sProfileId) {
      toast.error("Pick a staff member");
      return;
    }
    const start = combineDateTimeLocal(sDate, sStart);
    const end = combineDateTimeLocal(sDate, sEnd);
    if (end.getTime() <= start.getTime()) {
      toast.error("End time must be after start time");
      return;
    }
    setShiftSaving(true);
    const user = await getUser();
    const payload = {
      profile_id: sProfileId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      location: sLocation || null,
      role_label: sRoleLabel.trim() || null,
      created_by: user?.id ?? null,
    };
    try {
      if (editingShiftId) {
        const { error } = await supabase.from("shifts").update(payload).eq("id", editingShiftId);
        if (error) throw error;
        toast.success("Shift updated");
      } else {
        const { error } = await supabase.from("shifts").insert(payload);
        if (error) throw error;
        toast.success("Shift created");
      }
      setShiftSheetOpen(false);
      setEditingShiftId(null);
      await loadAll();
    } catch (e: unknown) {
      console.error("timesheet save failed", e);
      toast.error(`Save failed: ${supabaseErrorMessage(e, "Save failed — please try again")}`);
    } finally {
      setShiftSaving(false);
    }
  };

  const deleteShift = async () => {
    if (!shiftToDelete) return;
    const { error } = await supabase.from("shifts").delete().eq("id", shiftToDelete.id);
    if (error) {
      console.error("timesheet operation failed", error);
      toast.error(supabaseErrorMessage(error, "Operation failed — please try again"));
      return;
    }
    toast.success("Shift deleted");
    setShiftToDelete(null);
    await loadAll();
  };

  const clockIn = async () => {
    if (!me) return;
    setClocking(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("timesheets").insert({
      profile_id: me,
      clocked_in_at: now,
      shift_date: todayJhbISODate(),
      shift_id: myTodaysShift?.id ?? null,
    });
    setClocking(false);
    if (error) {
      console.error("timesheet operation failed", error);
      toast.error(supabaseErrorMessage(error, "Operation failed — please try again"));
      return;
    }
    toast.success("Clocked in");
    await loadAll();
  };

  const clockOut = async () => {
    if (!me || !myActiveTimesheet) return;
    setClocking(true);
    const { error } = await supabase
      .from("timesheets")
      .update({ clocked_out_at: new Date().toISOString() })
      .eq("id", myActiveTimesheet.id);
    setClocking(false);
    if (error) {
      console.error("timesheet operation failed", error);
      toast.error(supabaseErrorMessage(error, "Operation failed — please try again"));
      return;
    }
    toast.success("Clocked out");
    await loadAll();
  };

  const exportTimesheets = () => {
    const header = ["Date", "Staff", "Clock in", "Clock out", "Hours", "Notes"];
    const body = filteredTimesheets.map((t) => [
      t.shift_date ?? "",
      t.staffName,
      formatTime(t.clocked_in_at),
      formatTime(t.clocked_out_at),
      hoursBetween(t.clocked_in_at, t.clocked_out_at).toFixed(2),
      t.notes ?? "",
    ]);
    downloadCsv(`timesheets-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  if (role === "other") {
    return (
      <div>
        <PageHeader title="Timesheets" />
        <p className="text-sm text-muted-foreground">
          You don't have access to timesheets.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Timesheets"
        description="Schedule shifts, track clock-in/out, review hours."
      />

      {me && myProfile ? (
        <div className="mb-6">
          <StaffLeaveRequestSection profileId={me} staffProfile={myProfile} />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
          <TabsTrigger value="clock">Clock in/out</TabsTrigger>
          {isAdmin ? <TabsTrigger value="leave-requests">Leave requests</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="shifts" className="mt-0">
          {isAdmin && (
            <div className="mb-4 flex justify-end">
              <Button
                type="button"
                onClick={openAddShift}
                className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
              >
                <CalendarPlus className="h-4 w-4" /> Schedule shift
              </Button>
            </div>
          )}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : groupedShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
              <Clock className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No shifts scheduled yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedShifts.map(([dayKey, list]) => (
                <section key={dayKey}>
                  <h3 className="mb-2 border-b pb-1 font-display text-sm font-bold uppercase tracking-wide text-[#a3b693]">
                    {formatDate(dayKey)}
                  </h3>
                  <ul className="space-y-2">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-xl border border-[#c5d4b8]/80 bg-card p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-base font-semibold">
                              {s.staffName}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatTime(s.starts_at)} – {formatTime(s.ends_at)}
                              {s.location ? ` · ${s.location}` : ""}
                              {s.role_label ? ` · ${s.role_label}` : ""}
                            </p>
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Edit shift"
                                onClick={() => openEditShift(s)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                aria-label="Delete shift"
                                onClick={() => setShiftToDelete(s)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timesheets" className="mt-0">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(weekHoursByStaff).slice(0, 4).map(([name, hrs]) => (
              <StatCard key={name} label={name} value={`${hrs.toFixed(1)}h this week`} />
            ))}
            {Object.keys(weekHoursByStaff).length === 0 && (
              <StatCard label="This week" value="No hours logged yet" />
            )}
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={tsQuery}
                onChange={(e) => setTsQuery(e.target.value)}
                placeholder="Search by staff name…"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <Select value={tsStaff} onValueChange={setTsStaff}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={tsFrom}
              onChange={(e) => setTsFrom(e.target.value)}
              className="w-full sm:w-40"
              aria-label="From date"
            />
            <Input
              type="date"
              value={tsTo}
              onChange={(e) => setTsTo(e.target.value)}
              className="w-full sm:w-40"
              aria-label="To date"
            />
            <Select value={tsSort} onValueChange={(v) => setTsSort(v as "date_desc" | "date_asc" | "name_asc")}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_desc">Newest first</SelectItem>
                <SelectItem value="date_asc">Oldest first</SelectItem>
                <SelectItem value="name_asc">Staff A–Z</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={exportTimesheets}
              disabled={filteredTimesheets.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>

          <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredTimesheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Clock className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No timesheet entries.</p>
              </div>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Staff</th>
                    <th className="px-5 py-3 font-medium">Clock in</th>
                    <th className="px-5 py-3 font-medium">Clock out</th>
                    <th className="px-5 py-3 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {tsPageRows.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                        {t.shift_date ?? "—"}
                      </td>
                      <td className="px-5 py-3 font-semibold">{t.staffName}</td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                        {formatTime(t.clocked_in_at)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                        {formatTime(t.clocked_out_at)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                        {hoursBetween(t.clocked_in_at, t.clocked_out_at).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && filteredTimesheets.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Page {tsPage} of {tsPageCount} · {filteredTimesheets.length} total
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTsPage((p) => Math.max(1, p - 1))}
                  disabled={tsPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTsPage((p) => Math.min(tsPageCount, p + 1))}
                  disabled={tsPage >= tsPageCount}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="clock" className="mt-0">
          <div className="rounded-2xl border border-[#c5d4b8]/80 bg-[#f4f7f0]/70 p-8 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#3d4f36]">
              {myTodaysShift
                ? `Today's shift: ${formatTime(myTodaysShift.starts_at)} – ${formatTime(myTodaysShift.ends_at)}${myTodaysShift.location ? ` · ${myTodaysShift.location}` : ""}`
                : "No shift scheduled today"}
            </p>
            <p className="mt-2 font-display text-3xl font-bold sm:text-4xl">
              {new Date().toLocaleTimeString("en-ZA", {
                timeZone: TZ,
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date().toLocaleDateString("en-ZA", {
                timeZone: TZ,
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>

            {myActiveTimesheet ? (
              <div className="mt-8">
                <p className="mb-3 text-sm font-semibold text-[#3d4f36]">
                  Clocked in at {formatTime(myActiveTimesheet.clocked_in_at)}
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="h-16 gap-2 bg-destructive px-8 text-base text-white hover:bg-destructive/90"
                  onClick={() => void clockOut()}
                  disabled={clocking}
                >
                  <LogOut className="h-5 w-5" /> Clock out
                </Button>
              </div>
            ) : (
              <div className="mt-8">
                <Button
                  type="button"
                  size="lg"
                  className="h-16 gap-2 bg-[#a3b693] px-8 text-base text-white hover:bg-[#8fa67d]"
                  onClick={() => void clockIn()}
                  disabled={clocking}
                >
                  <LogIn className="h-5 w-5" /> Clock in
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="leave-requests" className="mt-0">
            {me && myProfile ? (
              <AdminLeaveRequestsTab meId={me} reviewerProfile={myProfile} />
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>

      <Sheet open={shiftSheetOpen} onOpenChange={(o) => !o && setShiftSheetOpen(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editingShiftId ? "Edit shift" : "Schedule shift"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="grid gap-1.5">
              <Label>Staff member</Label>
              <Select value={sProfileId} onValueChange={setSProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sh-date">Date</Label>
                <Input id="sh-date" type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sh-start">Start</Label>
                <Input
                  id="sh-start"
                  type="time"
                  value={sStart}
                  onChange={(e) => setSStart(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sh-end">End</Label>
                <Input
                  id="sh-end"
                  type="time"
                  value={sEnd}
                  onChange={(e) => setSEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sh-loc">Location</Label>
              <Input id="sh-loc" value={sLocation} onChange={(e) => setSLocation(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sh-role">Role</Label>
              <Input
                id="sh-role"
                value={sRoleLabel}
                onChange={(e) => setSRoleLabel(e.target.value)}
                placeholder="Front desk, guide, etc."
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShiftSheetOpen(false)}
              disabled={shiftSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveShift()}
              disabled={shiftSaving}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {shiftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingShiftId ? "Save changes" : "Create shift"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!shiftToDelete} onOpenChange={(o) => !o && setShiftToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {shiftToDelete
                ? `${shiftToDelete.staffName} on ${formatDate(shiftToDelete.starts_at)} (${formatTime(shiftToDelete.starts_at)} – ${formatTime(shiftToDelete.ends_at)}) will be removed.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void deleteShift();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
