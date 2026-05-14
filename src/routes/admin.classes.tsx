import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Filter,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { getUser, supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import type { GuideSelectRow } from "@/lib/guidesForSelect";
import { displayClassType } from "@/types/studio";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/classes")({
  head: () => ({
    meta: [{ title: "Classes — One Flow Admin" }],
  }),
  component: ClassesPage,
});

const TZ = "Africa/Johannesburg";
const GUIDE_NONE = "__none__";

const LOCATIONS = ["Studio 1", "Studio 2", "Wellzone", "Sauna"] as const;

const CLASS_TYPES = [
  { value: "yoga", label: "Yoga" },
  { value: "sculpt", label: "Sculpt" },
  { value: "pilates", label: "Pilates" },
  { value: "wellzone", label: "Wellzone" },
  { value: "sauna_journey", label: "Sauna journey" },
] as const;

type ClassRow = {
  id: string;
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  guide_id: string | null;
  guide_name: string | null;
  description: string | null;
  is_cancelled: boolean;
};

type GuideOption = GuideSelectRow;

/** Flat list for every guide `<Select>` in this page (id = `guides.id`). */
type ClassGuideOption = { id: string; name: string };

type TabKey = "today" | "week" | "upcoming";

function guideFullName(g: Pick<GuideOption, "first_name" | "last_name">) {
  return [g.first_name, g.last_name].filter(Boolean).join(" ").trim() || "";
}

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInputValue(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combineDateTimeLocal(dateStr: string, timeStr: string): Date {
  const [yy, mo, dd] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(yy, (mo || 1) - 1, dd || 1, hh || 0, mm || 0, 0, 0);
}

// Compute SAST day key (YYYY-MM-DD) for an ISO timestamp.
function jhbDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Add calendar days in Africa/Johannesburg (no DST). */
function jhbOffsetDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toLocaleDateString("en-CA", { timeZone: TZ });
}

function jhbDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  // Build a noon UTC date and format in JHB to avoid DST/edge issues (none in JHB anyway).
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  return dt.toLocaleDateString("en-ZA", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Within calendar “today” (JHB), upcoming first then earlier-today at bottom. */
function orderClassesChronologicalWithTodayPastAtBottom(
  list: ClassRow[],
  dayKey: string,
  todayKey: string,
  tab: TabKey,
  todaySubDay: number,
  nowMs: number,
): ClassRow[] {
  const asc = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const splitToday =
    todaySubDay === 0 && dayKey === todayKey && (tab === "today" || tab === "week");
  if (!splitToday) return asc;
  const upcoming = asc.filter((c) => new Date(c.starts_at).getTime() >= nowMs);
  const past = asc.filter((c) => new Date(c.starts_at).getTime() < nowMs);
  return [...upcoming, ...past];
}

function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-ZA", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

function todayJhbDayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function startOfWeekJhbDayKey(): string {
  const todayKey = todayJhbDayKey();
  const [y, m, d] = todayKey.split("-").map(Number);
  // JS getDay() on a UTC-noon date gives the JHB weekday too (no JHB DST).
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon = 0
  const start = new Date(dt);
  start.setUTCDate(start.getUTCDate() - dow);
  return start.toLocaleDateString("en-CA", { timeZone: TZ });
}

function endOfWeekJhbDayKey(): string {
  const startKey = startOfWeekJhbDayKey();
  const [y, m, d] = startKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + 6);
  return dt.toLocaleDateString("en-CA", { timeZone: TZ });
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  yoga: "bg-[#e8efe3] text-[#3d4f36]",
  sculpt: "bg-amber-100 text-amber-800",
  pilates: "bg-violet-100 text-violet-800",
  wellzone: "bg-sky-100 text-sky-800",
  sauna_journey: "bg-orange-100 text-orange-800",
};

function ClassesPage() {
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<ClassRow[]>([]);
  /** Same fetch as `guideOptions`; used only for save/reassign/filter lookups (unchanged logic). */
  const [guides, setGuides] = useState<GuideOption[]>([]);
  const [guideOptions, setGuideOptions] = useState<ClassGuideOption[]>([]);
  /** Whether `classes.guide_id` stores `guides.id` or legacy `profiles.id`. */
  const [guideFkTarget, setGuideFkTarget] = useState<"guides" | "profiles">("guides");
  const [loading, setLoading] = useState(true);
  const isGuide = (role ?? "").toLowerCase() === "guide";
  const canManage = !isGuide;

  // UI state
  const [tab, setTab] = useState<TabKey>("today");
  /** When tab is "today": 0 = today, 1 = yesterday, 2 = day before yesterday (JHB). */
  const [todaySubDay, setTodaySubDay] = useState(0);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [guideFilter, setGuideFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [occupancyFilter, setOccupancyFilter] = useState<"all" | "has_bookings" | "empty">("all");
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [classType, setClassType] = useState<string>("yoga");
  const [location, setLocation] = useState<string>("Studio 1");
  const [guideId, setGuideId] = useState<string>(GUIDE_NONE);
  const [dateStr, setDateStr] = useState(toDateInputValue(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [capacity, setCapacity] = useState("12");
  const [description, setDescription] = useState("");
  const [deleteFromDialog, setDeleteFromDialog] = useState<ClassRow | null>(null);

  // Bulk dialogs
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignGuideId, setReassignGuideId] = useState<string>(GUIDE_NONE);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadGuideOptions = useCallback(async () => {
    const { data: guidesData, error } = await supabase
      .from("guides")
      .select(
        `
      id,
      profile_id,
      profiles!guides_profile_id_fkey (
        first_name,
        last_name
      )
    `,
      )
      .eq("is_active", true);

    if (error) {
      console.error(error);
      toast.error(supabaseErrorMessage(error, "Could not load guides"));
      setGuideOptions([]);
      setGuides([]);
      return;
    }

    const opts = (guidesData ?? []).map((g) => {
      const raw = g.profiles as unknown;
      const p = (Array.isArray(raw) ? raw[0] : raw) as {
        first_name?: string | null;
        last_name?: string | null;
      } | null;
      const first = p?.first_name ?? "";
      const last = p?.last_name ?? "";
      return {
        id: String(g.id),
        name: `${first} ${last}`.trim(),
      };
    });

    const metaRows: GuideOption[] = (guidesData ?? []).map((g) => {
      const raw = g.profiles as unknown;
      const pr = (Array.isArray(raw) ? raw[0] : raw) as {
        first_name?: string | null;
        last_name?: string | null;
      } | null;
      return {
        guide_id: String(g.id),
        profile_id: String((g as { profile_id: string }).profile_id ?? ""),
        first_name: pr?.first_name ?? null,
        last_name: pr?.last_name ?? null,
        avatar_url: null,
      };
    });

    setGuideOptions(opts);
    setGuides(metaRows);
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getUser();
      if (!user) return;
      const [{ data }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        loadGuideOptions(),
      ]);
      setRole((data?.role as string | null) ?? null);
    })();
  }, [loadGuideOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, location, starts_at, ends_at, capacity, booked_count, guide_id, guide_name, description, is_cancelled",
      )
      .order("starts_at", { ascending: true })
      .limit(2000);

    if (error) {
      console.error("classes load failed", error);
      toast.error(supabaseErrorMessage(error, "Could not load classes"));
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as ClassRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!guides.length || !rows.length) return;
    const sample = rows.find((r) => r.guide_id);
    if (!sample?.guide_id) return;
    if (guides.some((g) => g.guide_id === sample.guide_id)) setGuideFkTarget("guides");
    else if (guides.some((g) => g.profile_id === sample.guide_id)) setGuideFkTarget("profiles");
  }, [guides, rows]);

  const guideMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of guides) {
      const n = guideFullName(g) || "Guide";
      map.set(g.guide_id, n);
      if (g.profile_id) map.set(g.profile_id, n);
    }
    return map;
  }, [guides]);

  const resolveGuideDisplay = (c: ClassRow): string => {
    const fromMap = c.guide_id ? guideMap.get(c.guide_id) : null;
    return (fromMap ?? c.guide_name ?? "").trim() || "—";
  };

  // Stats
  const todayKey = todayJhbDayKey();
  const weekStart = startOfWeekJhbDayKey();
  const weekEnd = endOfWeekJhbDayKey();
  const nowMs = Date.now();

  const stats = useMemo(() => {
    let today = 0;
    let thisWeek = 0;
    let upcoming = 0;
    for (const c of rows) {
      if (c.is_cancelled) continue;
      const dk = jhbDayKey(c.starts_at);
      if (dk === todayKey) today += 1;
      if (dk >= weekStart && dk <= weekEnd) thisWeek += 1;
      if (new Date(c.starts_at).getTime() >= nowMs) upcoming += 1;
    }
    return { today, thisWeek, upcoming };
  }, [rows, todayKey, weekStart, weekEnd, nowMs]);

  // Tab filter
  const tabFiltered = useMemo(() => {
    return rows.filter((c) => {
      if (c.is_cancelled) return false;
      const startMs = new Date(c.starts_at).getTime();
      const dk = jhbDayKey(c.starts_at);
      switch (tab) {
        case "today": {
          const anchor = jhbOffsetDayKey(todayKey, -todaySubDay);
          return dk === anchor;
        }
        case "week":
          return dk >= weekStart && dk <= weekEnd;
        case "upcoming":
          return startMs >= nowMs;
      }
    });
  }, [rows, tab, todayKey, weekStart, weekEnd, nowMs, todaySubDay]);

  // Search + filter bar
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return tabFiltered.filter((c) => {
      if (ql) {
        const guideDisp = resolveGuideDisplay(c).toLowerCase();
        const hay = `${c.name} ${guideDisp}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (typeFilter !== "all" && c.class_type !== typeFilter) return false;
      if (locationFilter !== "all" && c.location !== locationFilter) return false;
      if (guideFilter !== "all") {
        if (guideFilter === GUIDE_NONE) {
          if (c.guide_id) return false;
        } else {
          const opt = guides.find((g) => g.guide_id === guideFilter);
          const matchGuidePk = c.guide_id === guideFilter;
          const matchProfile = opt?.profile_id != null && c.guide_id === opt.profile_id;
          if (!matchGuidePk && !matchProfile) return false;
        }
      }
      if (dateFrom) {
        const fromIso = new Date(dateFrom).toISOString();
        if (c.starts_at < fromIso) return false;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (c.starts_at > end.toISOString()) return false;
      }
      const booked = c.booked_count ?? 0;
      if (occupancyFilter === "has_bookings" && booked <= 0) return false;
      if (occupancyFilter === "empty" && booked > 0) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tabFiltered,
    q,
    typeFilter,
    locationFilter,
    guideFilter,
    dateFrom,
    dateTo,
    occupancyFilter,
    guideMap,
    guides,
  ]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return copy;
  }, [filtered]);

  // Group by JHB day; week tab lists today first, then future weekdays, then Mon–Sun past days collapsed by default.
  const grouped = useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    for (const c of sorted) {
      const k = jhbDayKey(c.starts_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }

    let entries: [string, ClassRow[]][] = [...map.entries()].map(([k, list]) => [
      k,
      orderClassesChronologicalWithTodayPastAtBottom(list, k, todayKey, tab, todaySubDay, nowMs),
    ]);

    if (tab === "week") {
      const inRange = entries.filter(([k]) => k >= weekStart && k <= weekEnd);
      const outRange = entries.filter(([k]) => k < weekStart || k > weekEnd);
      const beforeToday = inRange
        .filter(([k]) => k < todayKey)
        .sort((a, b) => a[0].localeCompare(b[0]));
      const todayEnt = inRange.filter(([k]) => k === todayKey);
      const afterToday = inRange
        .filter(([k]) => k > todayKey)
        .sort((a, b) => a[0].localeCompare(b[0]));
      entries = [...todayEnt, ...afterToday, ...beforeToday, ...outRange];
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
    }
    return entries;
  }, [sorted, tab, todayKey, weekStart, weekEnd, todaySubDay, nowMs]);

  useEffect(() => {
    if (tab !== "today") setTodaySubDay(0);
  }, [tab]);

  const classesFilterCount =
    (q.trim() ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (locationFilter !== "all" ? 1 : 0) +
    (guideFilter !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (occupancyFilter !== "all" ? 1 : 0);

  const clearClassesFilters = () => {
    setQ("");
    setTypeFilter("all");
    setLocationFilter("all");
    setGuideFilter("all");
    setDateFrom("");
    setDateTo("");
    setOccupancyFilter("all");
  };

  // Dialog helpers
  const resetForm = () => {
    setName("");
    setClassType("yoga");
    setLocation("Studio 1");
    setGuideId(GUIDE_NONE);
    setDateStr(toDateInputValue(new Date()));
    setStartTime("09:00");
    setEndTime("10:00");
    setCapacity("12");
    setDescription("");
  };

  const openCreate = () => {
    if (!canManage) return;
    setEditingId(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (c: ClassRow) => {
    setEditingId(c.id);
    setName(c.name);
    setClassType(c.class_type || "yoga");
    setLocation(c.location || "Studio 1");
    const s = new Date(c.starts_at);
    const e = new Date(c.ends_at);
    setDateStr(toDateInputValue(s));
    setStartTime(toTimeInputValue(s));
    setEndTime(toTimeInputValue(e));
    setCapacity(String(c.capacity));
    setDescription(c.description ?? "");
    setDialogOpen(true);
    const sid = c.guide_id;
    if (!sid) setGuideId(GUIDE_NONE);
    else if (guides.some((g) => g.guide_id === sid)) setGuideId(sid);
    else {
      const match = guides.find((g) => g.profile_id === sid);
      setGuideId(match?.guide_id ?? GUIDE_NONE);
    }
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      toast.error("Class name is required");
      return false;
    }
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 1) {
      toast.error("Capacity must be at least 1");
      return false;
    }
    const start = combineDateTimeLocal(dateStr, startTime);
    const end = combineDateTimeLocal(dateStr, endTime);
    if (end.getTime() <= start.getTime()) {
      toast.error("End time must be after start time");
      return false;
    }
    return true;
  };

  const saveClass = async () => {
    if (!canManage) return;
    if (!validateForm()) return;
    setSaving(true);
    const start = combineDateTimeLocal(dateStr, startTime);
    const end = combineDateTimeLocal(dateStr, endTime);
    const cap = Math.round(Number(capacity));
    const selected = guides.find((g) => g.guide_id === guideId);
    const gid =
      guideId === GUIDE_NONE
        ? null
        : guideFkTarget === "profiles"
          ? (selected?.profile_id ?? null)
          : (selected?.guide_id ?? null);
    const gName = gid ? (guideMap.get(gid) ?? null) : null;

    const base = {
      name: name.trim(),
      class_type: classType,
      location,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      capacity: cap,
      description: description.trim() ? description.trim() : null,
      guide_id: gid,
      guide_name: gName,
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("classes").update(base).eq("id", editingId);
        if (error) throw error;
        toast.success("Class updated");
      } else {
        const { error } = await supabase.from("classes").insert({
          ...base,
          booked_count: 0,
          is_cancelled: false,
        });
        if (error) throw error;
        toast.success("Class created");
      }
      setDialogOpen(false);
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      console.error("class save failed", e);
      toast.error(`Save failed: ${supabaseErrorMessage(e, "Save failed — please try again")}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteFromDialog || !canManage) return;
    const { error } = await supabase
      .from("classes")
      .update({ is_cancelled: true })
      .eq("id", deleteFromDialog.id);
    if (error) {
      console.error("class cancel failed", error);
      toast.error(supabaseErrorMessage(error, "Could not cancel class"));
      return;
    }
    toast.success("Class cancelled");
    setDeleteFromDialog(null);
    setDialogOpen(false);
    setEditingId(null);
    await load();
  };

  // Bulk actions
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelected = () => setSelected(new Set());

  const bulkCancel = async () => {
    if (!canManage || selected.size === 0) return;
    setBulkBusy(true);
    const ids = [...selected];
    const { error } = await supabase.from("classes").update({ is_cancelled: true }).in("id", ids);
    setBulkBusy(false);
    if (error) {
      console.error("bulk cancel failed", error);
      toast.error(supabaseErrorMessage(error, "Could not cancel classes"));
      return;
    }
    toast.success(`Cancelled ${ids.length} class${ids.length === 1 ? "" : "es"}`);
    setBulkCancelOpen(false);
    clearSelected();
    await load();
  };

  const bulkReassign = async () => {
    if (!canManage || selected.size === 0) return;
    const pick = guides.find((g) => g.guide_id === reassignGuideId);
    const gid =
      reassignGuideId === GUIDE_NONE
        ? null
        : guideFkTarget === "profiles"
          ? (pick?.profile_id ?? null)
          : (pick?.guide_id ?? null);
    const gName = gid ? (guideMap.get(gid) ?? null) : null;
    setBulkBusy(true);
    const ids = [...selected];
    const { error } = await supabase
      .from("classes")
      .update({ guide_id: gid, guide_name: gName })
      .in("id", ids);
    setBulkBusy(false);
    if (error) {
      console.error("bulk reassign failed", error);
      toast.error(supabaseErrorMessage(error, "Could not reassign classes"));
      return;
    }
    toast.success(`Reassigned ${ids.length} class${ids.length === 1 ? "" : "es"}`);
    setReassignOpen(false);
    setReassignGuideId(GUIDE_NONE);
    clearSelected();
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Classes"
        description={
          isGuide ? "Scheduled classes (view only)" : "Browse, edit, and cancel scheduled classes."
        }
        actions={
          canManage ? (
            <Button
              type="button"
              onClick={openCreate}
              className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              <Plus className="h-4 w-4" /> New class
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Classes today"
          value={stats.today.toLocaleString()}
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard label="This week" value={stats.thisWeek.toLocaleString()} />
        <StatCard label="Total upcoming" value={stats.upcoming.toLocaleString()} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="mb-3 flex flex-wrap">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="upcoming">All Upcoming</TabsTrigger>
        </TabsList>

        {tab === "today" ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">View:</span>
            <Button
              type="button"
              size="sm"
              variant={todaySubDay === 0 ? "default" : "outline"}
              className={todaySubDay === 0 ? "bg-[#a3b693] hover:bg-[#8fa67d]" : ""}
              onClick={() => setTodaySubDay(0)}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={todaySubDay === 1 ? "default" : "outline"}
              className={todaySubDay === 1 ? "bg-[#a3b693] hover:bg-[#8fa67d]" : ""}
              onClick={() => setTodaySubDay(1)}
            >
              Yesterday
            </Button>
            <Button
              type="button"
              size="sm"
              variant={todaySubDay === 2 ? "default" : "outline"}
              className={todaySubDay === 2 ? "bg-[#a3b693] hover:bg-[#8fa67d]" : ""}
              onClick={() => setTodaySubDay(2)}
            >
              Day before yesterday
            </Button>
          </div>
        ) : null}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-2 sm:mr-auto sm:w-full sm:max-w-none">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-semibold text-muted-foreground">
              <Filter className="h-3.5 w-3.5" aria-hidden />
              Filters
              {classesFilterCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {classesFilterCount}
                </span>
              ) : null}
            </span>
            {classesFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-muted-foreground"
                onClick={clearClassesFilters}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by class or guide…"
              className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CLASS_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {LOCATIONS.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={guideFilter} onValueChange={setGuideFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="All guides" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All guides</SelectItem>
              <SelectItem value={GUIDE_NONE}>No guide assigned</SelectItem>
              {guideOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.name || "Guide"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full sm:w-40"
            aria-label="From date"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full sm:w-40"
            aria-label="To date"
          />
          <Select
            value={occupancyFilter}
            onValueChange={(v) => setOccupancyFilter(v as "all" | "has_bookings" | "empty")}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Bookings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any bookings</SelectItem>
              <SelectItem value="has_bookings">Has bookings</SelectItem>
              <SelectItem value="empty">Empty classes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && selected.size > 0 && (
          <div className="mb-4 flex flex-col items-start gap-3 rounded-2xl border border-[#c5d4b8]/80 bg-[#f4f7f0]/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[#3d4f36]">
              {selected.size} class{selected.size === 1 ? "" : "es"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReassignOpen(true)}
              >
                Reassign guide
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setBulkCancelOpen(true)}
              >
                Cancel selected
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearSelected}>
                <X className="h-4 w-4" /> Clear
              </Button>
            </div>
          </div>
        )}

        <TabsContent value={tab} className="mt-0">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No classes match your filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([dayKey, list]) => {
                const isPastWeekDay =
                  tab === "week" && dayKey < todayKey && dayKey >= weekStart && dayKey <= weekEnd;
                const collapsed = isPastWeekDay
                  ? collapsedDays[dayKey] !== false
                  : collapsedDays[dayKey] === true;
                return (
                  <section
                    key={dayKey}
                    className="overflow-hidden rounded-2xl border border-[#c5d4b8]/80 bg-card shadow-sm"
                  >
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      onClick={() =>
                        setCollapsedDays((prev) => ({ ...prev, [dayKey]: !collapsed }))
                      }
                      className="flex w-full items-center justify-between gap-3 bg-[#e8efe3]/60 px-4 py-3 text-left transition-colors hover:bg-[#e8efe3]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-bold uppercase tracking-wider text-[#3d4f36]">
                          {jhbDayLabel(dayKey)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {list.length} class{list.length === 1 ? "" : "es"}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-[#3d4f36] transition-transform",
                          collapsed && "-rotate-90",
                        )}
                      />
                    </button>
                    {!collapsed && (
                      <ul className="divide-y divide-border">
                        {list.map((c) => {
                          const guideDisp = resolveGuideDisplay(c);
                          const typeBadge =
                            TYPE_BADGE_CLASS[c.class_type] ?? "bg-muted text-foreground";
                          const isSelected = selected.has(c.id);
                          const startedPast = new Date(c.starts_at).getTime() < nowMs;
                          const greyRow =
                            startedPast &&
                            ((tab === "today" && todaySubDay === 0 && dayKey === todayKey) ||
                              (tab === "week" && dayKey === todayKey));
                          return (
                            <li
                              key={c.id}
                              className={cn(
                                "flex items-start gap-3 px-4 py-3 hover:bg-muted/30",
                                isSelected && "bg-[#e8efe3]/40",
                                greyRow && "opacity-[0.55]",
                              )}
                            >
                              {canManage && (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelected(c.id)}
                                  className="mt-1.5 data-[state=checked]:border-[#a3b693] data-[state=checked]:bg-[#a3b693]"
                                  aria-label={`Select ${c.name}`}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-sm font-bold tabular-nums text-[#a3b693]">
                                    {formatTime(c.starts_at)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    – {formatTime(c.ends_at)}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                      typeBadge,
                                    )}
                                  >
                                    {displayClassType(c.class_type)}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate font-display text-base font-semibold">
                                  {c.name}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className={cn(
                                        "font-medium",
                                        guideDisp === "—" && "italic text-amber-600",
                                      )}
                                    >
                                      {guideDisp}
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {c.location || "—"}
                                  </span>
                                  <span className="inline-flex items-center gap-1 tabular-nums">
                                    <Users className="h-3 w-3" />
                                    {c.booked_count}/{c.capacity}
                                  </span>
                                </p>
                              </div>
                              {canManage && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 gap-1"
                                  onClick={() => openEdit(c)}
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit class" : "New class"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="cls-name">Class name</Label>
              <Input
                id="cls-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Type</Label>
                <Select value={classType} onValueChange={setClassType} disabled={!canManage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={location} onValueChange={setLocation} disabled={!canManage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Guide</Label>
              <Select value={guideId} onValueChange={setGuideId} disabled={!canManage}>
                <SelectTrigger>
                  <SelectValue placeholder="No guide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GUIDE_NONE}>No guide</SelectItem>
                  {guideOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name || "Guide"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cls-date">Date (SAST)</Label>
              <Input
                id="cls-date"
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cls-start">Starts</Label>
                <Input
                  id="cls-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="cls-end">Ends</Label>
                <Input
                  id="cls-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cls-cap">Capacity</Label>
              <Input
                id="cls-cap"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label htmlFor="cls-desc">Description</Label>
              <Textarea
                id="cls-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canManage}
                placeholder="Optional — shown on schedule and booking"
              />
            </div>
          </div>
          {canManage ? (
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    const cur = rows.find((r) => r.id === editingId);
                    if (cur) setDeleteFromDialog(cur);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
              <div className="flex gap-2 sm:ml-auto">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveClass()}
                  className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingId ? "Save changes" : "Create class"}
                </Button>
              </div>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFromDialog} onOpenChange={(o) => !o && setDeleteFromDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this class?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFromDialog
                ? `“${deleteFromDialog.name}” on ${jhbDayLabel(jhbDayKey(deleteFromDialog.starts_at))} at ${formatTime(deleteFromDialog.starts_at)} will be marked cancelled. Existing bookings may need follow-up.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep class</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Cancel class
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {selected.size} classes?</AlertDialogTitle>
            <AlertDialogDescription>
              Each selected class will be marked cancelled. Existing bookings may need follow-up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Keep classes</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void bulkCancel();
              }}
              disabled={bulkBusy}
            >
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancel selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        modal={false}
        open={reassignOpen}
        onOpenChange={(open) => {
          setReassignOpen(open);
          if (open) {
            setReassignGuideId(GUIDE_NONE);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign guide for {selected.size} classes</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label>Guide</Label>
            <Select value={reassignGuideId} onValueChange={setReassignGuideId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value={GUIDE_NONE}>No guide</SelectItem>
                {guideOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.name || "Guide"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReassignOpen(false)}
              disabled={bulkBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void bulkReassign()}
              disabled={bulkBusy}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
