import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CLASS_TYPE_THEME_BY_SLUG, classTypeBadgeClass } from "@/lib/allowedClassTypes";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNowMs } from "@/hooks/use-now-ms";
import { useScrollToLiveClass } from "@/hooks/use-scroll-to-live-class";
import {
  isClassEnded,
  orderClassesForLiveDay,
  pickFocusClassId,
  type LiveClassRow,
} from "@/lib/liveClassList";
import { civilAddDaysYmd, dayBoundsForDateKey, todayDateKey } from "@/lib/timezone";

export const Route = createFileRoute("/admin/schedule")({
  head: () => ({
    meta: [{ title: "Schedule — One Flow Admin" }],
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

type TabKey = "today" | "week" | "upcoming";
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

/** Within calendar “today” (JHB), in-progress + upcoming first, ended at bottom. */
function orderClassesForLiveViewIfToday(
  list: ClassRow[],
  dayKey: string,
  todayKey: string,
  tab: TabKey,
  todaySubDay: number,
  nowMs: number,
): ClassRow[] {
  const isLiveDay =
    todaySubDay === 0 && dayKey === todayKey && (tab === "today" || tab === "week");
  if (!isLiveDay) {
    return [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  return orderClassesForLiveDay(list as LiveClassRow[], nowMs) as ClassRow[];
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

const TYPE_BADGE_CLASS: Record<string, string> = Object.fromEntries(
  (Object.keys(CLASS_TYPE_THEME_BY_SLUG) as Array<keyof typeof CLASS_TYPE_THEME_BY_SLUG>).map(
    (slug) => [slug, classTypeBadgeClass(slug)],
  ),
);

function SchedulePage() {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const [rows, setRows] = useState<ClassRow[]>([]);
  /** Loaded once; paired with `guideSelectOptions` for display. */
  const [guides, setGuides] = useState<GuideOption[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    // Do NOT load oldest-first without a date floor: with 5k+ historical rows a
    // limit of 2000 never reaches today/upcoming. Start from "day before yesterday"
    // (Today tab can show those days) and take the next 3000 sessions forward.
    const fromKey = civilAddDaysYmd(todayDateKey(TZ), -2);
    const fromIso = dayBoundsForDateKey(fromKey, TZ).startUtcIso;

    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, location, starts_at, ends_at, capacity, booked_count, guide_id, guide_name, description, is_cancelled, product_id, recurring_group_id",
      )
      .gte("starts_at", fromIso)
      .order("starts_at", { ascending: true })
      .limit(3000);

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

  // Stats
  const todayKey = todayJhbDayKey();
  const weekStart = startOfWeekJhbDayKey();
  const weekEnd = endOfWeekJhbDayKey();
  const nowMs = useNowMs();
  const liveViewEnabled = tab === "today" && todaySubDay === 0;

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

  const hasDateFilter = Boolean(dateFrom || dateTo);

  // Tab + date filter (JHB calendar days)
  const tabFiltered = useMemo(() => {
    return rows.filter((c) => {
      if (c.is_cancelled) return false;
      const startMs = new Date(c.starts_at).getTime();
      const dk = jhbDayKey(c.starts_at);

      if (hasDateFilter && !matchesJhbDateFilter(dk, dateFrom, dateTo)) return false;

      if (hasDateFilter) {
        switch (tab) {
          case "upcoming":
            return startMs >= nowMs;
          case "week":
            return dk >= weekStart && dk <= weekEnd;
          case "today":
            return true;
        }
      }

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
  }, [rows, tab, todayKey, weekStart, weekEnd, nowMs, todaySubDay, dateFrom, dateTo, hasDateFilter]);

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
      if (!classMatchesGuideFilter(c, guideFilter, guides)) return false;
      const booked = c.booked_count ?? 0;
      if (occupancyFilter === "has_bookings" && booked <= 0) return false;
      if (occupancyFilter === "empty" && booked > 0) return false;
      return true;
    });
  }, [tabFiltered, q, typeFilter, locationFilter, guideFilter, occupancyFilter, guides, guideMap]);

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
      orderClassesForLiveViewIfToday(list, k, todayKey, tab, todaySubDay, nowMs),
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

  const focusClassId = useMemo(() => {
    if (!liveViewEnabled) return null;
    const todayList = grouped.find(([k]) => k === todayKey)?.[1];
    if (!todayList?.length) return null;
    return pickFocusClassId(todayList, nowMs);
  }, [grouped, liveViewEnabled, todayKey, nowMs]);

  useScrollToLiveClass(focusClassId, liveViewEnabled && !loading);

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

  return (
    <div>
      <PageHeader
        title="Schedule"
        description={
          isGuide
            ? "Scheduled sessions (view only)"
            : "Browse, edit, and cancel scheduled sessions. Class types are chosen when creating or editing a class."
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

        {tab === "today" && !hasDateFilter ? (
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
              {filterTypeOptions.map((t) => (
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
            className="w-full sm:w-40"
            aria-label="Date (from)"
            title="Single day when used alone; start of range with “To”"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full sm:w-40"
            aria-label="Date (to)"
            title="End of range (optional)"
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

        <TabsContent
          value={tab}
          className={cn("mt-0", canManage && selected.size > 0 && "pb-28")}
        >
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
                          const startedPast = isClassEnded(c, nowMs);
                          const greyRow =
                            startedPast &&
                            ((tab === "today" && todaySubDay === 0 && dayKey === todayKey) ||
                              (tab === "week" && dayKey === todayKey));
                          return (
                            <li
                              key={c.id}
                              data-live-class-id={c.id}
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
