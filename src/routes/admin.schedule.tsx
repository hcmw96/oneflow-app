import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { TypeBadge } from "@/components/TypeBadge";
import { getUser, supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { cancelBookingWithPolicy } from "@/lib/bookingCancellation";
import { fetchGuidesForClassSelect, type GuideSelectRow } from "@/lib/guidesForSelect";
import {
  buildClassTypeSelectOptions,
  fetchCustomClassTypes,
  type CustomClassType,
} from "@/lib/classTypeOptions";
import { displayClassType } from "@/types/studio";
import { classTypeTheme } from "@/lib/classTypeTheme";
import {
  createClassTicketProduct,
  parseTicketPriceZar,
  updateClassTicketProduct,
} from "@/lib/classTicketProduct";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNowMs } from "@/hooks/use-now-ms";
import { isClassEnded } from "@/lib/liveClassList";
import { civilAddDaysYmd, dayBoundsForDateKey } from "@/lib/timezone";

export const Route = createFileRoute("/admin/schedule")({
  head: () => ({
    meta: [{ title: "Master — One Flow Admin" }],
  }),
  component: SchedulePage,
});

const TZ = "Africa/Johannesburg";
const GUIDE_NONE = "__none__";
/** Edit / create class dialog: Radix forbids empty string SelectItem values. */
const GUIDE_DIALOG_NONE = "none";

function normalizeGuideSelectValue(id: string | null | undefined): string {
  if (!id || id === GUIDE_NONE || id === GUIDE_DIALOG_NONE || id === "none") return "none";
  return id;
}

const LOCATIONS = ["Studio 1", "Studio 2", "Wellzone", "Sauna"] as const;

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
  product_id: string | null;
  recurring_group_id: string | null;
};

type RecurringScope = "single" | "future";

type GuideOption = GuideSelectRow;

/** Flat option for toolbar / reassign (value follows `guideFkTarget`). */
type GuideSelectOption = { value: string; label: string; key: string };

type ClassDialogMode = "create" | "edit" | "bulk-reassign";

/** Resolve `classes.guide_id` to `guides.id` when options use guides PK as `SelectItem` value. */
function guidesTableIdForClassGuideId(sid: string | null, list: GuideOption[]): string {
  if (!sid) return GUIDE_NONE;
  if (list.some((g) => g.guide_id === sid)) return sid;
  const m = list.find((g) => g.profile_id === sid);
  return m?.guide_id ?? GUIDE_NONE;
}

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

/** `HH:MM` + minutes → `HH:MM` (wraps within the day). */
function addMinutesToTimeInput(timeStr: string, minutes: number): string {
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return timeStr;
  const total = ((hh * 60 + mm + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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

/** e.g. "Friday, 7 August" (sentence case for dialogs). */
function jhbDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  return dt.toLocaleDateString("en-ZA", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** e.g. "FRIDAY, 07 AUGUST" */
function masterDayHeaderLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  const weekday = dt
    .toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long" })
    .toUpperCase();
  const day = dt.toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit" });
  const month = dt
    .toLocaleDateString("en-GB", { timeZone: TZ, month: "long" })
    .toUpperCase();
  return `${weekday}, ${day} ${month}`;
}

function weekRangeLabel(startKey: string, endKey: string): string {
  const fmt = (key: string, withYear: boolean) => {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
    return dt.toLocaleDateString("en-GB", {
      timeZone: TZ,
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" as const } : {}),
    });
  };
  return `${fmt(startKey, false)} – ${fmt(endKey, true)}`;
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

function formatNowClock(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString("en-ZA", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

/** Index to insert the now-line: before the first class that hasn't started yet. */
function nowLineInsertIndex(list: { starts_at: string }[], nowMs: number): number {
  const idx = list.findIndex((c) => new Date(c.starts_at).getTime() > nowMs);
  return idx === -1 ? list.length : idx;
}

function MasterNowLine({ nowMs }: { nowMs: number }) {
  return (
    <li
      className="pointer-events-none relative z-[1] list-none"
      aria-label={`Current time ${formatNowClock(nowMs)}`}
    >
      <div className="flex items-center gap-2 py-0.5 pl-2 pr-3">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a3b693]" aria-hidden />
        <span className="shrink-0 font-mono text-[10px] font-semibold tabular-nums text-[#a3b693]">
          {formatNowClock(nowMs)}
        </span>
        <span className="h-px min-w-0 flex-1 bg-[#a3b693]" aria-hidden />
      </div>
    </li>
  );
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

function endOfWeekJhbDayKey(startKey = startOfWeekJhbDayKey()): string {
  return civilAddDaysYmd(startKey, 6);
}

function weekDayKeys(weekStartKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => civilAddDaysYmd(weekStartKey, i));
}

/** Inclusive JHB calendar-day filter (YYYY-MM-DD from `<input type="date">`). */
function matchesJhbDateFilter(dayKey: string, from: string, to: string): boolean {
  if (from && to) return dayKey >= from && dayKey <= to;
  if (from) return dayKey === from;
  if (to) return dayKey <= to;
  return true;
}

function classMatchesGuideFilter(c: ClassRow, guideFilter: string, guides: GuideOption[]): boolean {
  if (guideFilter === "all") return true;
  if (guideFilter === GUIDE_NONE) return !c.guide_id;
  if (!c.guide_id) return false;
  if (c.guide_id === guideFilter) return true;
  const g = guides.find((x) => x.guide_id === guideFilter || x.profile_id === guideFilter);
  if (!g) return false;
  return c.guide_id === g.guide_id || c.guide_id === g.profile_id;
}

function SchedulePage() {
  const navigate = useNavigate();
  const { profile, profileReady } = useAuth();
  const role = profile?.role ?? null;
  const roleLower = (role ?? "").toLowerCase();
  /** Match customers/payouts: director || management (no separate "manager" role). */
  const canAccessMaster = roleLower === "director" || roleLower === "management";
  const canManage = canAccessMaster;

  const [rows, setRows] = useState<ClassRow[]>([]);
  /** Loaded once; paired with `guideSelectOptions` for display. */
  const [guides, setGuides] = useState<GuideOption[]>([]);
  /** Whether `classes.guide_id` stores `guides.id` or legacy `profiles.id`. */
  const [guideFkTarget, setGuideFkTarget] = useState<"guides" | "profiles">("guides");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ today: 0, thisWeek: 0, upcoming: 0 });

  // UI state — weekOffset 0 = current Mon–Sun week (JHB)
  const [weekOffset, setWeekOffset] = useState(0);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [guideFilter, setGuideFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [occupancyFilter, setOccupancyFilter] = useState<"all" | "has_bookings" | "empty">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Class id currently writing an inline guide change. */
  const [savingGuideClassId, setSavingGuideClassId] = useState<string | null>(null);
  /** Brief “Saved” flash after inline guide write. */
  const [savedGuideFlashId, setSavedGuideFlashId] = useState<string | null>(null);
  const savedGuideFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ClassDialogMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [classType, setClassType] = useState<string>("yoga");
  // Read-only: custom_class_types may exist in studio_settings, but Pass 1 does not
  // expose add/remove UI — classes.class_type is a Postgres enum, so a settings-only
  // slug is not a valid column value and would fail on insert/update.
  const [customClassTypes, setCustomClassTypes] = useState<CustomClassType[]>([]);
  const [location, setLocation] = useState<string>("Studio 1");
  const [guideId, setGuideId] = useState<string>(GUIDE_DIALOG_NONE);
  const [dateStr, setDateStr] = useState(toDateInputValue(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  /** Once the user edits Ends, stop auto-following Starts + 60m. */
  const endTimeTouchedRef = useRef(false);
  const [capacity, setCapacity] = useState("12");
  const [description, setDescription] = useState("");
  const [ticketPriceZar, setTicketPriceZar] = useState("");
  const [linkedProductId, setLinkedProductId] = useState<string | null>(null);
  const [repeatMode, setRepeatMode] = useState<"none" | "weekly">("none");
  const [repeatWeeks, setRepeatWeeks] = useState("4");
  const [deleteFromDialog, setDeleteFromDialog] = useState<ClassRow | null>(null);

  // Bulk dialogs
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingRecurringGroupId, setEditingRecurringGroupId] = useState<string | null>(null);
  const [editingStartsAt, setEditingStartsAt] = useState<string | null>(null);
  const [editingOriginalGuideSelectValue, setEditingOriginalGuideSelectValue] =
    useState<string>("none");
  const [guideChangeScope, setGuideChangeScope] = useState<RecurringScope | null>(null);
  const [recurringScopeOpen, setRecurringScopeOpen] = useState(false);
  const [recurringScopeAction, setRecurringScopeAction] = useState<"edit" | "bulk-reassign" | null>(
    null,
  );

  const editGuideSelectSyncRef = useRef<string | null>(null);

  const loadGuideOptions = useCallback(async () => {
    const result = await fetchGuidesForClassSelect(supabase);
    console.log("fetchGuidesForClassSelect result:", result);

    if (result.error) {
      console.error("fetchGuidesForClassSelect error:", result.error);
      toast.error(supabaseErrorMessage(result.error, "Could not load guides"));
    }

    if (result.data.length > 0) {
      setGuides(result.data);
      return;
    }

    console.error("No guides loaded - checking direct query...");
    const { data, error } = await supabase
      .from("guides")
      .select("id, profile_id, profile:profiles!guides_profile_id_fkey(first_name, last_name)")
      .or("is_active.eq.true,is_active.is.null");

    console.log("direct guides query:", data, error);

    if (error) {
      console.error("direct guides query failed:", error);
      if (!result.error) {
        toast.error(supabaseErrorMessage(error, "Could not load guides"));
      }
      setGuides([]);
      return;
    }

    const metaRows: GuideOption[] = (data ?? []).map((g) => {
      const raw = (g as { profile?: unknown }).profile;
      const pr = (Array.isArray(raw) ? raw[0] : raw) as {
        first_name?: string | null;
        last_name?: string | null;
      } | null;
      return {
        guide_id: String((g as { id: string }).id),
        profile_id: String((g as { profile_id: string }).profile_id ?? ""),
        first_name: pr?.first_name ?? null,
        last_name: pr?.last_name ?? null,
        avatar_url: null,
      };
    });

    setGuides(metaRows);
  }, []);

  useEffect(() => {
    void (async () => {
      const custom = await fetchCustomClassTypes();
      setCustomClassTypes(custom);
      await loadGuideOptions();
    })();
  }, [loadGuideOptions]);

  const classTypeOptions = useMemo(
    () => buildClassTypeSelectOptions(customClassTypes, classType),
    [customClassTypes, classType],
  );

  const filterTypeOptions = useMemo(
    () => buildClassTypeSelectOptions(customClassTypes),
    [customClassTypes],
  );

  const todayKey = todayJhbDayKey();
  const thisWeekStart = startOfWeekJhbDayKey();
  const thisWeekEnd = endOfWeekJhbDayKey(thisWeekStart);
  const viewWeekStart = civilAddDaysYmd(thisWeekStart, weekOffset * 7);
  const viewWeekEnd = endOfWeekJhbDayKey(viewWeekStart);
  const nowMs = useNowMs();

  const loadStats = useCallback(async () => {
    const todayBounds = dayBoundsForDateKey(todayKey, TZ);
    const weekStartIso = dayBoundsForDateKey(thisWeekStart, TZ).startUtcIso;
    const weekEndExclusive = dayBoundsForDateKey(civilAddDaysYmd(thisWeekEnd, 1), TZ).startUtcIso;
    const nowIso = new Date().toISOString();
    const notCancelled = "is_cancelled.is.null,is_cancelled.eq.false";

    const [todayRes, weekRes, upcomingRes] = await Promise.all([
      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", todayBounds.startUtcIso)
        .lte("starts_at", todayBounds.endUtcIso)
        .or(notCancelled),
      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", weekStartIso)
        .lt("starts_at", weekEndExclusive)
        .or(notCancelled),
      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", nowIso)
        .or(notCancelled),
    ]);

    setStats({
      today: todayRes.count ?? 0,
      thisWeek: weekRes.count ?? 0,
      upcoming: upcomingRes.count ?? 0,
    });
  }, [todayKey, thisWeekStart, thisWeekEnd]);

  const load = useCallback(async () => {
    setLoading(true);
    // Scope to the selected Mon–Sun week only (not all upcoming).
    const fromIso = dayBoundsForDateKey(viewWeekStart, TZ).startUtcIso;
    const toExclusiveIso = dayBoundsForDateKey(civilAddDaysYmd(viewWeekEnd, 1), TZ).startUtcIso;

    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, location, starts_at, ends_at, capacity, booked_count, guide_id, guide_name, description, is_cancelled, product_id, recurring_group_id",
      )
      .gte("starts_at", fromIso)
      .lt("starts_at", toExclusiveIso)
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("classes load failed", error);
      toast.error(supabaseErrorMessage(error, "Could not load classes"));
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as ClassRow[]);
    setLoading(false);
  }, [viewWeekStart, viewWeekEnd]);

  useEffect(() => {
    if (!canAccessMaster) return;
    void load();
  }, [load, canAccessMaster]);

  useEffect(() => {
    if (!canAccessMaster) return;
    void loadStats();
  }, [loadStats, canAccessMaster]);

  useEffect(() => {
    if (!guides.length || !rows.length) return;
    let sawGuidePk = false;
    let sawProfileId = false;
    for (const r of rows) {
      if (!r.guide_id) continue;
      if (guides.some((g) => g.guide_id === r.guide_id)) sawGuidePk = true;
      if (guides.some((g) => g.profile_id === r.guide_id)) sawProfileId = true;
    }
    if (sawProfileId && !sawGuidePk) setGuideFkTarget("profiles");
    else if (sawGuidePk) setGuideFkTarget("guides");
  }, [guides, rows]);

  /** Align edit-dialog guide `<Select>` value with `classes.guide_id` when guides / FK mode first become usable (avoids wiping user picks: token includes class id only). */
  useEffect(() => {
    if (!dialogOpen || !editingId || guides.length === 0) return;
    const c = rows.find((r) => r.id === editingId);
    if (!c) return;
    const token = `${editingId}|${guideFkTarget}|${guides.length}`;
    if (editGuideSelectSyncRef.current === token) return;
    editGuideSelectSyncRef.current = token;
    let synced = GUIDE_DIALOG_NONE;
    if (c.guide_id) {
      const tid = guidesTableIdForClassGuideId(c.guide_id, guides);
      synced = tid !== GUIDE_NONE ? tid : c.guide_id;
    }
    setGuideId(synced);
    setEditingOriginalGuideSelectValue(normalizeGuideSelectValue(synced));
    setGuideChangeScope(null);
  }, [dialogOpen, editingId, guides, guideFkTarget, rows]);

  useEffect(() => {
    if (!dialogOpen) editGuideSelectSyncRef.current = null;
  }, [dialogOpen]);

  const guideSelectOptions = useMemo((): GuideSelectOption[] => {
    return guides.map((g) => ({
      value: guideFkTarget === "profiles" ? g.profile_id : g.guide_id,
      label: guideFullName(g) || "Guide",
      key: g.guide_id,
    }));
  }, [guides, guideFkTarget]);

  const editingClass = useMemo(
    () => (editingId ? (rows.find((r) => r.id === editingId) ?? null) : null),
    [editingId, rows],
  );

  const guideChangedOnRecurringEdit = useMemo(() => {
    if (dialogMode !== "edit" || !editingRecurringGroupId) return false;
    return (
      normalizeGuideSelectValue(guideId) !==
      normalizeGuideSelectValue(editingOriginalGuideSelectValue)
    );
  }, [dialogMode, editingRecurringGroupId, guideId, editingOriginalGuideSelectValue]);

  const handleEditGuideChange = (value: string) => {
    setGuideId(value);
    if (!editingRecurringGroupId) return;
    const changed =
      normalizeGuideSelectValue(value) !==
      normalizeGuideSelectValue(editingOriginalGuideSelectValue);
    if (!changed) {
      setGuideChangeScope(null);
    } else {
      setGuideChangeScope((prev) => prev ?? "single");
    }
  };

  /** Edit dialog only: every option value is `guides.id` (see on-screen debug). */
  const guideOptions = useMemo(
    () =>
      guides.map((g) => ({
        guide_id: g.guide_id,
        value: g.guide_id,
        label: guideFullName(g) || "Guide",
      })),
    [guides],
  );

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

  const hasDateFilter = Boolean(dateFrom || dateTo);

  // Week list + optional date filter (JHB calendar days)
  const weekFiltered = useMemo(() => {
    return rows.filter((c) => {
      if (c.is_cancelled) return false;
      const dk = jhbDayKey(c.starts_at);
      if (hasDateFilter && !matchesJhbDateFilter(dk, dateFrom, dateTo)) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo, hasDateFilter]);

  // Search + filter bar
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return weekFiltered.filter((c) => {
      if (ql) {
        const guideDisp = resolveGuideDisplay(c).toLowerCase();
        const hay = `${c.name} ${guideDisp}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (typeFilter !== "all" && c.class_type !== typeFilter) return false;
      if (locationFilter !== "all" && c.location !== locationFilter) return false;
      if (!classMatchesGuideFilter(c, guideFilter, guides)) return false;
      const booked = c.booked_count ?? 0;
      if (occupancyFilter === "has_bookings" && booked <= 0) return false;
      if (occupancyFilter === "empty" && booked > 0) return false;
      return true;
    });
  }, [weekFiltered, q, typeFilter, locationFilter, guideFilter, occupancyFilter, guides, guideMap]);

  /** Mon–Sun sections for the selected week (include empty days). */
  const daySections = useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    for (const c of filtered) {
      const k = jhbDayKey(c.starts_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return weekDayKeys(viewWeekStart).map((dayKey) => ({
      dayKey,
      list: map.get(dayKey) ?? [],
    }));
  }, [filtered, viewWeekStart]);

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
    setGuideId(GUIDE_DIALOG_NONE);
    setDateStr(toDateInputValue(new Date()));
    setStartTime("09:00");
    setEndTime("10:00");
    endTimeTouchedRef.current = false;
    setCapacity("12");
    setDescription("");
    setTicketPriceZar("");
    setLinkedProductId(null);
    setRepeatMode("none");
    setRepeatWeeks("4");
    setEditingOriginalGuideSelectValue("none");
    setGuideChangeScope(null);
  };

  const weeklyPreview = useMemo(() => {
    if (repeatMode !== "weekly" || dialogMode !== "create") return [];
    const start = combineDateTimeLocal(dateStr, startTime);
    const end = combineDateTimeLocal(dateStr, endTime);
    if (end.getTime() <= start.getTime()) return [];
    const weeks = Math.max(1, Math.min(52, Math.floor(Number(repeatWeeks)) || 1));
    const rows: { label: string; startsAt: string }[] = [];
    for (let i = 0; i < weeks; i++) {
      const s = new Date(start);
      s.setDate(s.getDate() + i * 7);
      rows.push({
        startsAt: s.toISOString(),
        label: s.toLocaleString("en-ZA", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: TZ,
        }),
      });
    }
    return rows;
  }, [repeatMode, dialogMode, dateStr, startTime, endTime, repeatWeeks]);

  const resolveGuideIdAndName = (
    selectedGuideId: string,
  ): { guide_id: string | null; guide_name: string | null } => {
    if (
      selectedGuideId === "none" ||
      selectedGuideId === GUIDE_DIALOG_NONE ||
      selectedGuideId === GUIDE_NONE ||
      !selectedGuideId
    ) {
      return { guide_id: null, guide_name: null };
    }
    const pick = guides.find(
      (g) => g.guide_id === selectedGuideId || g.profile_id === selectedGuideId,
    );
    const gid = pick
      ? guideFkTarget === "profiles"
        ? pick.profile_id
        : pick.guide_id
      : null;
    const gName = gid ? (guideMap.get(gid) ?? null) : null;
    return { guide_id: gid, guide_name: gName };
  };

  const guideSelectValueForClass = (c: ClassRow): string => {
    if (!c.guide_id) return "none";
    if (guideFkTarget === "profiles") {
      const g = guides.find((x) => x.guide_id === c.guide_id || x.profile_id === c.guide_id);
      return g?.profile_id || "none";
    }
    const tid = guidesTableIdForClassGuideId(c.guide_id, guides);
    return tid !== GUIDE_NONE ? tid : "none";
  };

  const saveInlineGuide = async (c: ClassRow, selectValue: string) => {
    if (!canManage) return;
    const current = guideSelectValueForClass(c);
    if (normalizeGuideSelectValue(selectValue) === normalizeGuideSelectValue(current)) return;

    const { guide_id, guide_name } = resolveGuideIdAndName(selectValue);
    setSavingGuideClassId(c.id);
    const { error } = await supabase
      .from("classes")
      .update({ guide_id, guide_name })
      .eq("id", c.id);
    setSavingGuideClassId(null);

    if (error) {
      console.error("inline guide save failed", error);
      toast.error(supabaseErrorMessage(error, "Could not update guide"));
      return;
    }

    setRows((prev) =>
      prev.map((row) => (row.id === c.id ? { ...row, guide_id, guide_name } : row)),
    );
    if (savedGuideFlashTimer.current) clearTimeout(savedGuideFlashTimer.current);
    setSavedGuideFlashId(c.id);
    savedGuideFlashTimer.current = setTimeout(() => {
      setSavedGuideFlashId((id) => (id === c.id ? null : id));
    }, 1600);
  };

  const openCreate = () => {
    if (!canManage) return;
    setDialogMode("create");
    setEditingId(null);
    setEditingRecurringGroupId(null);
    setEditingStartsAt(null);
    resetForm();
    setDialogOpen(true);
  };

  const openBulkReassign = () => {
    if (!canManage || selected.size === 0) return;
    setDialogMode("bulk-reassign");
    setEditingId(null);
    setGuideId(GUIDE_DIALOG_NONE);
    setDialogOpen(true);
  };

  const openEdit = async (c: ClassRow) => {
    setDialogMode("edit");
    setEditingId(c.id);
    setEditingRecurringGroupId(c.recurring_group_id);
    setEditingStartsAt(c.starts_at);
    setGuideChangeScope(null);
    setName(c.name);
    setClassType(c.class_type || "yoga");
    setLocation(c.location || "Studio 1");
    const s = new Date(c.starts_at);
    const e = new Date(c.ends_at);
    setDateStr(toDateInputValue(s));
    setStartTime(toTimeInputValue(s));
    setEndTime(toTimeInputValue(e));
    endTimeTouchedRef.current = false;
    setCapacity(String(c.capacity));
    setDescription(c.description ?? "");
    setLinkedProductId(c.product_id);
    setTicketPriceZar("");
    if (c.product_id) {
      const { data: prod } = await supabase
        .from("products")
        .select("price_zar")
        .eq("id", c.product_id)
        .maybeSingle();
      if (prod && typeof (prod as { price_zar?: number }).price_zar === "number") {
        setTicketPriceZar(String((prod as { price_zar: number }).price_zar));
      }
    }
    setDialogOpen(true);
    const sid = c.guide_id;
    if (!sid) setGuideId(GUIDE_DIALOG_NONE);
    else {
      const tid = guidesTableIdForClassGuideId(sid, guides);
      setGuideId(tid !== GUIDE_NONE ? tid : sid);
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
    const parsedTicket = parseTicketPriceZar(ticketPriceZar);
    if (ticketPriceZar.trim() !== "" && parsedTicket == null) {
      toast.error("Enter a valid ticket price in ZAR (0 for free events)");
      return false;
    }
    return true;
  };

  const performEditSave = async (scope: RecurringScope) => {
    if (!canManage || !editingId) return;
    setSaving(true);
    const start = combineDateTimeLocal(dateStr, startTime);
    const end = combineDateTimeLocal(dateStr, endTime);
    const cap = Math.round(Number(capacity));
    const { guide_id: gid, guide_name: gName } = resolveGuideIdAndName(guideId);

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

    const ticketPrice = parseTicketPriceZar(ticketPriceZar);
    const wantsTicket = ticketPrice != null;

    try {
      if (linkedProductId && wantsTicket) {
        await updateClassTicketProduct(supabase, linkedProductId, {
          className: name.trim(),
          classType,
          priceZar: ticketPrice,
          startsAt: start,
          description: description.trim() || null,
        });
      } else if (linkedProductId && !wantsTicket) {
        await supabase.from("classes").update({ product_id: null }).eq("id", editingId);
      } else if (!linkedProductId && wantsTicket) {
        const productId = await createClassTicketProduct(supabase, {
          className: name.trim(),
          classType,
          priceZar: ticketPrice,
          startsAt: start,
          description: description.trim() || null,
        });
        const { error } = await supabase
          .from("classes")
          .update({ ...base, product_id: productId })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Class updated with ticket product");
        setDialogOpen(false);
        setEditingId(null);
        setEditingRecurringGroupId(null);
        setEditingStartsAt(null);
        setGuideChangeScope(null);
        await load();
        void loadStats();
        return;
      }

      if (scope === "future" && editingRecurringGroupId && editingStartsAt) {
        const shared = {
          name: base.name,
          class_type: base.class_type,
          location: base.location,
          capacity: base.capacity,
          description: base.description,
          guide_id: base.guide_id,
          guide_name: base.guide_name,
        };
        const { error: seriesErr } = await supabase
          .from("classes")
          .update(shared)
          .eq("recurring_group_id", editingRecurringGroupId)
          .gte("starts_at", editingStartsAt)
          .eq("is_cancelled", false);
        if (seriesErr) throw seriesErr;

        const { error: timeErr } = await supabase
          .from("classes")
          .update({ starts_at: base.starts_at, ends_at: base.ends_at })
          .eq("id", editingId);
        if (timeErr) throw timeErr;
        toast.success("This and all future classes in the series updated");
      } else {
        const { error } = await supabase.from("classes").update(base).eq("id", editingId);
        if (error) throw error;
        toast.success("Class updated");
      }

      setDialogOpen(false);
      setEditingId(null);
      setEditingRecurringGroupId(null);
      setEditingStartsAt(null);
      setGuideChangeScope(null);
      await load();
      void loadStats();
    } catch (e: unknown) {
      console.error("class save failed", e);
      toast.error(`Save failed: ${supabaseErrorMessage(e, "Save failed — please try again")}`);
    } finally {
      setSaving(false);
    }
  };

  const saveClass = async () => {
    if (!canManage) return;
    if (!validateForm()) return;

    if (editingId) {
      if (guideChangedOnRecurringEdit) {
        await performEditSave(guideChangeScope ?? "single");
        return;
      }
      if (editingRecurringGroupId) {
        setRecurringScopeAction("edit");
        setRecurringScopeOpen(true);
        return;
      }
      await performEditSave("single");
      return;
    }

    setSaving(true);
    const start = combineDateTimeLocal(dateStr, startTime);
    const end = combineDateTimeLocal(dateStr, endTime);
    const cap = Math.round(Number(capacity));
    const { guide_id: gid, guide_name: gName } = resolveGuideIdAndName(guideId);

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

    const ticketPrice = parseTicketPriceZar(ticketPriceZar);
    const wantsTicket = ticketPrice != null;

    try {
      const attachTicket = async (
        occStart: Date,
        occEnd: Date,
      ): Promise<{ product_id: string | null }> => {
        if (!wantsTicket) return { product_id: null };
        const productId = await createClassTicketProduct(supabase, {
          className: name.trim(),
          classType,
          priceZar: ticketPrice,
          startsAt: occStart,
          description: description.trim() || null,
        });
        return { product_id: productId };
      };

      if (repeatMode === "weekly") {
        const weeks = Math.max(1, Math.min(52, Math.floor(Number(repeatWeeks)) || 1));
        const durationMs = end.getTime() - start.getTime();
        const recurringGroupId = globalThis.crypto.randomUUID();
        const inserts = [];
        for (let i = 0; i < weeks; i++) {
          const occStart = new Date(start);
          occStart.setDate(occStart.getDate() + i * 7);
          const occEnd = new Date(occStart.getTime() + durationMs);
          const ticket = await attachTicket(occStart, occEnd);
          inserts.push({
            ...base,
            starts_at: occStart.toISOString(),
            ends_at: occEnd.toISOString(),
            recurring_group_id: recurringGroupId,
            booked_count: 0,
            is_cancelled: false,
            ...ticket,
          });
        }
        const { error } = await supabase.from("classes").insert(inserts);
        if (error) throw error;
        toast.success(
          weeks === 1 ? "Class created" : `${weeks} weekly classes created`,
        );
      } else {
        const ticket = await attachTicket(start, end);
        const { error } = await supabase.from("classes").insert({
          ...base,
          booked_count: 0,
          is_cancelled: false,
          ...ticket,
        });
        if (error) throw error;
        toast.success(wantsTicket ? "Class and ticket product created" : "Class created");
      }
      setDialogOpen(false);
      setEditingId(null);
      await load();
      void loadStats();
    } catch (e: unknown) {
      console.error("class save failed", e);
      toast.error(`Save failed: ${supabaseErrorMessage(e, "Save failed — please try again")}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteFromDialog || !canManage) return;
    const classId = deleteFromDialog.id;
    const { data: bookingsToCancel, error: fetchErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("class_id", classId)
      .in("status", ["confirmed", "attended"]);
    if (fetchErr) {
      console.error("load bookings for class cancel failed", fetchErr);
      toast.error(supabaseErrorMessage(fetchErr, "Could not load bookings to cancel"));
      return;
    }
    let failed = 0;
    for (const b of bookingsToCancel ?? []) {
      try {
        await cancelBookingWithPolicy({
          bookingId: (b as { id: string }).id,
          cancellationReason: "admin_cancelled",
          waiveLateFee: true,
        });
      } catch (e) {
        failed += 1;
        console.error("cancelBookingWithPolicy failed", (b as { id: string }).id, e);
      }
    }
    const { error } = await supabase
      .from("classes")
      .update({ is_cancelled: true })
      .eq("id", classId);
    if (error) {
      console.error("class cancel failed", error);
      toast.error(supabaseErrorMessage(error, "Could not cancel class"));
      return;
    }
    if (failed > 0) {
      toast.warning(
        `Class cancelled, but ${failed} booking(s) could not be refunded automatically — please check.`,
      );
    } else {
      const n = (bookingsToCancel ?? []).length;
      toast.success(
        n > 0
          ? `Class cancelled · ${n} member${n === 1 ? "" : "s"} refunded and notified`
          : "Class cancelled",
      );
    }
    setDeleteFromDialog(null);
    setDialogOpen(false);
    setEditingId(null);
    await load();
    void loadStats();
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
    const { data: bookingsToCancel, error: fetchErr } = await supabase
      .from("bookings")
      .select("id")
      .in("class_id", ids)
      .in("status", ["confirmed", "attended"]);
    if (fetchErr) {
      setBulkBusy(false);
      console.error("load bookings for bulk cancel failed", fetchErr);
      toast.error(supabaseErrorMessage(fetchErr, "Could not load bookings to cancel"));
      return;
    }
    let failed = 0;
    for (const b of bookingsToCancel ?? []) {
      try {
        await cancelBookingWithPolicy({
          bookingId: (b as { id: string }).id,
          cancellationReason: "admin_cancelled",
          waiveLateFee: true,
        });
      } catch (e) {
        failed += 1;
        console.error("cancelBookingWithPolicy failed", (b as { id: string }).id, e);
      }
    }
    const { error } = await supabase.from("classes").update({ is_cancelled: true }).in("id", ids);
    setBulkBusy(false);
    if (error) {
      console.error("bulk cancel failed", error);
      toast.error(supabaseErrorMessage(error, "Could not cancel classes"));
      return;
    }
    toast.success(
      failed > 0
        ? `Cancelled ${ids.length} class(es) · ${failed} booking(s) need manual refund`
        : `Cancelled ${ids.length} class(es) · members refunded and notified`,
    );
    setBulkCancelOpen(false);
    clearSelected();
    await load();
    void loadStats();
  };

  const executeBulkReassign = async (scope: RecurringScope) => {
    if (!canManage || selected.size === 0) return;
    const { guide_id: gid, guide_name: gName } = resolveGuideIdAndName(guideId);
    setBulkBusy(true);
    const selectedRows = rows.filter((r) => selected.has(r.id));
    try {
      if (scope === "single") {
        const ids = [...selected];
        const { error } = await supabase
          .from("classes")
          .update({ guide_id: gid, guide_name: gName })
          .in("id", ids);
        if (error) throw error;
        toast.success(`Reassigned ${ids.length} class${ids.length === 1 ? "" : "es"}`);
      } else {
        for (const row of selectedRows) {
          if (row.recurring_group_id) {
            const { error } = await supabase
              .from("classes")
              .update({ guide_id: gid, guide_name: gName })
              .eq("recurring_group_id", row.recurring_group_id)
              .gte("starts_at", row.starts_at)
              .eq("is_cancelled", false);
            if (error) throw error;
          }
        }
        const nonRecurringIds = selectedRows.filter((r) => !r.recurring_group_id).map((r) => r.id);
        if (nonRecurringIds.length > 0) {
          const { error } = await supabase
            .from("classes")
            .update({ guide_id: gid, guide_name: gName })
            .in("id", nonRecurringIds);
          if (error) throw error;
        }
        toast.success("Guide reassigned for this and all future classes in the series");
      }
      setDialogOpen(false);
      setDialogMode("create");
      setGuideId(GUIDE_DIALOG_NONE);
      clearSelected();
      await load();
      void loadStats();
    } catch (error) {
      console.error("bulk reassign failed", error);
      toast.error(supabaseErrorMessage(error, "Could not reassign classes"));
    } finally {
      setBulkBusy(false);
    }
  };

  const applyBulkReassign = async () => {
    if (!canManage || selected.size === 0) return;
    const selectedRows = rows.filter((r) => selected.has(r.id));
    const hasRecurring = selectedRows.some((r) => r.recurring_group_id);
    if (hasRecurring) {
      setRecurringScopeAction("bulk-reassign");
      setRecurringScopeOpen(true);
      return;
    }
    await executeBulkReassign("single");
  };

  const handleRecurringScopeChoice = async (scope: RecurringScope) => {
    setRecurringScopeOpen(false);
    const action = recurringScopeAction;
    setRecurringScopeAction(null);
    if (action === "edit") {
      await performEditSave(scope);
    } else if (action === "bulk-reassign") {
      await executeBulkReassign(scope);
    }
  };

  useEffect(() => {
    if (!profileReady) return;
    if (!canAccessMaster) {
      navigate({ to: "/admin/check-in", replace: true });
    }
  }, [profileReady, canAccessMaster, navigate]);

  if (!profileReady || !canAccessMaster) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Master"
        description="Create, edit and schedule classes across the week. Book members in from Bookings."
        className="mb-2 gap-2 sm:mb-3 sm:items-center"
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

      {/* Slim stats + week pager + filters toggle on one dense strip */}
      <div className="mb-2 flex flex-col gap-2 border-b border-border pb-2 sm:mb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Today
            </span>
            <span className="font-display text-base font-bold tabular-nums leading-none">
              {stats.today.toLocaleString()}
            </span>
          </span>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              This week
            </span>
            <span className="font-display text-base font-bold tabular-nums leading-none">
              {stats.thisWeek.toLocaleString()}
            </span>
          </span>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Upcoming
            </span>
            <span className="font-display text-base font-bold tabular-nums leading-none">
              {stats.upcoming.toLocaleString()}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-0.5 px-2 text-xs"
              onClick={() => setWeekOffset((o) => o - 1)}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <Button
              type="button"
              variant={weekOffset === 0 ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 px-2.5 text-xs",
                weekOffset === 0 && "bg-[#a3b693] hover:bg-[#8fa67d]",
              )}
              onClick={() => setWeekOffset(0)}
            >
              This week
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-0.5 px-2 text-xs"
              onClick={() => setWeekOffset((o) => o + 1)}
              aria-label="Next week"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              {weekRangeLabel(viewWeekStart, viewWeekEnd)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant={filtersOpen ? "secondary" : "outline"}
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Filter className="h-3.5 w-3.5" aria-hidden />
              Filters
              {classesFilterCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                  {classesFilterCount}
                </span>
              ) : null}
            </Button>
            {classesFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={clearClassesFilters}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by class or guide…"
                className="h-8 w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-primary"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-36">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {filterTypeOptions.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-36">
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
              <SelectTrigger className="h-8 w-full text-xs sm:w-44">
                <SelectValue placeholder="All guides" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All guides</SelectItem>
                <SelectItem value={GUIDE_NONE}>No guide assigned</SelectItem>
                {guideSelectOptions.map((opt) => (
                  <SelectItem key={opt.key} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-full text-xs sm:w-36"
              aria-label="Date (from)"
              title="Single day when used alone; start of range with “To”"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-full text-xs sm:w-36"
              aria-label="Date (to)"
              title="End of range (optional)"
            />
            <Select
              value={occupancyFilter}
              onValueChange={(v) => setOccupancyFilter(v as "all" | "has_bookings" | "empty")}
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-40">
                <SelectValue placeholder="Bookings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any bookings</SelectItem>
                <SelectItem value="has_bookings">Has bookings</SelectItem>
                <SelectItem value="empty">Empty classes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

        <div className={cn(canManage && selected.size > 0 && "pb-28")}>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {daySections.map(({ dayKey, list }) => (
                <section key={dayKey}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 border-b border-border pb-1">
                    <h2 className="font-display text-xs font-bold uppercase tracking-wider text-[#3d4f36]">
                      {masterDayHeaderLabel(dayKey)}
                      <span className="ml-2 font-sans font-medium normal-case tracking-normal text-muted-foreground">
                        — {list.length} class{list.length === 1 ? "" : "es"}
                      </span>
                    </h2>
                    {dayKey === todayKey ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#a3b693]">
                        Today
                      </span>
                    ) : null}
                  </div>
                  {list.length === 0 ? (
                    <p className="px-1 py-1.5 text-xs text-muted-foreground">No classes</p>
                  ) : (
                    <ul className="overflow-hidden rounded-xl border border-border bg-card">
                      {(() => {
                        // Date-keyed (todayKey), not position — other weeks never match → no line.
                        const insertAt =
                          dayKey === todayKey ? nowLineInsertIndex(list, nowMs) : null;

                        return list.map((c, i) => {
                          const badgeType = displayClassType(c.class_type);
                          const typeTheme = classTypeTheme(badgeType);
                          const isSelected = selected.has(c.id);
                          const greyRow = dayKey === todayKey && isClassEnded(c, nowMs);
                          const guideValue = guideSelectValueForClass(c);
                          const savingThis = savingGuideClassId === c.id;
                          const savedFlash = savedGuideFlashId === c.id;

                          return (
                            <Fragment key={c.id}>
                              {insertAt === i ? <MasterNowLine nowMs={nowMs} /> : null}
                              <li className="border-b border-border last:border-b-0">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => void openEdit(c)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      void openEdit(c);
                                    }
                                  }}
                                  className={cn(
                                    "flex cursor-pointer items-stretch border-l-4 transition hover:bg-muted/40",
                                    typeTheme.tint,
                                    isSelected && "bg-[#e8efe3]/40",
                                    greyRow && "opacity-55",
                                  )}
                                  style={{ borderLeftColor: typeTheme.accent }}
                                >
                                  {/* Time gutter: fixed width + border-r so the divider runs full row height and stacks flush into one continuous day line. */}
                                  <span className="flex w-[8.75rem] shrink-0 items-center whitespace-nowrap border-r border-border px-2.5 font-mono text-[11px] font-semibold tabular-nums text-foreground sm:text-xs">
                                    {formatTime(c.starts_at)}
                                    <span className="text-muted-foreground">–</span>
                                    {formatTime(c.ends_at)}
                                  </span>
                                  <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                                    {canManage ? (
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleSelected(c.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="shrink-0 data-[state=checked]:border-[#a3b693] data-[state=checked]:bg-[#a3b693]"
                                        aria-label={`Select ${c.name}`}
                                      />
                                    ) : null}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                        <p className="truncate font-display text-sm font-semibold text-foreground">
                                          {c.name}
                                        </p>
                                        <TypeBadge type={badgeType} size="sm" className="shrink-0" />
                                      </div>
                                      <p className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                        {c.location?.trim() || "—"}
                                      </p>
                                    </div>
                                    <div
                                      className="flex w-[10.5rem] shrink-0 flex-col items-stretch gap-0.5 sm:w-44"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    >
                                      <Select
                                        value={guideValue}
                                        onValueChange={(v) => void saveInlineGuide(c, v)}
                                        disabled={!canManage || savingThis}
                                      >
                                        <SelectTrigger
                                          className={cn(
                                            // Override SelectTrigger’s default [&>span]:line-clamp-1 —
                                            // it was clipping “Unguided” so the final “d” read as “a”.
                                            "h-8 gap-1 px-2 text-xs [&>span]:line-clamp-none [&>span]:overflow-visible [&>span]:whitespace-nowrap",
                                            guideValue === "none" && "text-muted-foreground italic",
                                          )}
                                          aria-label={`Guide for ${c.name}`}
                                          title={
                                            guideValue === "none"
                                              ? "Unguided"
                                              : guideSelectOptions.find((o) => o.value === guideValue)
                                                  ?.label
                                          }
                                        >
                                          <SelectValue placeholder="Unguided" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">Unguided</SelectItem>
                                          {guideSelectOptions.map((opt) => (
                                            <SelectItem key={opt.key} value={opt.value}>
                                              {opt.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {savingThis ? (
                                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                                        </span>
                                      ) : savedFlash ? (
                                        <span className="flex items-center gap-1 text-[10px] font-medium text-[#5a7a4a]">
                                          <Check className="h-3 w-3" /> Saved
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="shrink-0 tabular-nums text-xs font-semibold text-muted-foreground">
                                      {c.booked_count ?? 0}/{c.capacity}
                                    </span>
                                  </div>
                                </div>
                              </li>
                              {insertAt === list.length && i === list.length - 1 ? (
                                <MasterNowLine nowMs={nowMs} />
                              ) : null}
                            </Fragment>
                          );
                        });
                      })()}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>

      {canManage && selected.size > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-[#c5d4b8]/80 bg-[#f4f7f0]/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[#3d4f36]">
              {selected.size} class{selected.size === 1 ? "" : "es"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => openBulkReassign()}>
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
        </div>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setGuideChangeScope(null);
            if (dialogMode === "bulk-reassign") {
              setDialogMode("create");
              setGuideId(GUIDE_DIALOG_NONE);
            }
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "bulk-reassign"
                ? `Reassign guide · ${selected.size} class${selected.size === 1 ? "" : "es"}`
                : editingId
                  ? "Edit class"
                  : "New class"}
            </DialogTitle>
          </DialogHeader>
          {dialogMode === "bulk-reassign" ? (
            <div className="grid gap-3 py-2">
              <p className="text-sm text-muted-foreground">
                Choose a guide for all selected classes. Pick “No guide” to clear assignments.
              </p>
              <div>
                <Label>Guide</Label>
                <Select
                  value={
                    !guideId ||
                    guideId === GUIDE_NONE ||
                    guideId === GUIDE_DIALOG_NONE ||
                    guideId === "none"
                      ? "none"
                      : guideId
                  }
                  onValueChange={setGuideId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select guide" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No guide</SelectItem>
                    {guideOptions
                      .filter((g) => Boolean(g.guide_id?.trim()))
                      .map((g) => (
                        <SelectItem key={g.guide_id} value={g.guide_id}>
                          {g.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
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
                    {/* Enum-backed types only — do not offer "+ Add class type" until
                        Pass 2 (schema change). Settings-only slugs are not valid
                        classes.class_type enum values. */}
                    {classTypeOptions.map((t) => (
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
              <Select
                value={
                  !guideId ||
                  guideId === GUIDE_NONE ||
                  guideId === GUIDE_DIALOG_NONE ||
                  guideId === "none"
                    ? "none"
                    : guideId
                }
                onValueChange={handleEditGuideChange}
                disabled={!canManage}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !guideId ||
                      guideId === GUIDE_NONE ||
                      guideId === GUIDE_DIALOG_NONE ||
                      guideId === "none"
                        ? "No guide"
                        : undefined
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No guide</SelectItem>
                  {guideOptions
                    .filter((g) => Boolean(g.guide_id?.trim()))
                    .map((g) => (
                      <SelectItem key={g.guide_id} value={g.guide_id}>
                        {g.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {guideChangedOnRecurringEdit ? (
                <div className="mt-2 rounded-lg border border-[#c5d4b8]/70 bg-[#f4f7f0]/80 px-3 py-3">
                  <p className="text-sm font-medium text-[#3d4f36]">Apply guide change to</p>
                  <RadioGroup
                    value={guideChangeScope ?? "single"}
                    onValueChange={(v) => setGuideChangeScope(v as RecurringScope)}
                    className="mt-2 gap-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value="single" id="edit-guide-scope-single" />
                      <Label htmlFor="edit-guide-scope-single" className="cursor-pointer font-normal">
                        This class only
                      </Label>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value="future" id="edit-guide-scope-future" />
                      <Label htmlFor="edit-guide-scope-future" className="cursor-pointer font-normal">
                        This and all future classes
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              ) : null}
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
                  onChange={(e) => {
                    const next = e.target.value;
                    setStartTime(next);
                    if (!endTimeTouchedRef.current) {
                      setEndTime(addMinutesToTimeInput(next, 60));
                    }
                  }}
                  disabled={!canManage}
                />
              </div>
              <div>
                <Label htmlFor="cls-end">Ends</Label>
                <Input
                  id="cls-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    endTimeTouchedRef.current = true;
                    setEndTime(e.target.value);
                  }}
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
            {dialogMode === "create" || dialogMode === "edit" ? (
              <div>
                <Label htmlFor="cls-ticket-price">Ticket price (ZAR)</Label>
                <Input
                  id="cls-ticket-price"
                  type="number"
                  min={0}
                  step={1}
                  value={ticketPriceZar}
                  onChange={(e) => setTicketPriceZar(e.target.value)}
                  disabled={!canManage}
                  placeholder="Leave blank for normal class packs"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Set a price to create a one-off ticket product (use{" "}
                  <span className="font-medium text-foreground">0</span> for a free
                  ticketed event). Leave blank for regular schedule classes paid with
                  member credits.
                </p>
              </div>
            ) : null}
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
            {dialogMode === "create" ? (
              <>
                <div className="grid gap-1.5">
                  <Label>Repeat</Label>
                  <Select
                    value={repeatMode}
                    onValueChange={(v) => setRepeatMode(v as "none" | "weekly")}
                    disabled={!canManage}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {repeatMode === "weekly" ? (
                  <div className="space-y-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="cls-repeat-weeks">Number of weeks</Label>
                      <Input
                        id="cls-repeat-weeks"
                        type="number"
                        min={1}
                        max={52}
                        value={repeatWeeks}
                        onChange={(e) => setRepeatWeeks(e.target.value)}
                        disabled={!canManage}
                      />
                    </div>
                    {weeklyPreview.length > 0 ? (
                      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Preview ({weeklyPreview.length} classes)
                        </p>
                        <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
                          {weeklyPreview.map((row, i) => (
                            <li key={row.startsAt} className="text-foreground">
                              {i + 1}. {row.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          )}
          {canManage ? (
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {dialogMode === "bulk-reassign" ? (
                <div className="flex w-full gap-2 sm:ml-auto sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void applyBulkReassign()}
                    className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                  >
                    {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Reassign guide
                  </Button>
                </div>
              ) : (
                <>
                  {editingId ? (
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
                  ) : null}
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
                </>
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={recurringScopeOpen}
        onOpenChange={(o) => {
          setRecurringScopeOpen(o);
          if (!o) setRecurringScopeAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply changes to recurring series?</AlertDialogTitle>
            <AlertDialogDescription>
              This class is part of a recurring series. Choose whether to update only this
              occurrence or this class and all future classes in the series.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={saving || bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || bulkBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleRecurringScopeChoice("single");
              }}
            >
              This class only
            </AlertDialogAction>
            <AlertDialogAction
              disabled={saving || bulkBusy}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
              onClick={(e) => {
                e.preventDefault();
                void handleRecurringScopeChoice("future");
              }}
            >
              This and all future classes in the series
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

    </div>
  );
}
