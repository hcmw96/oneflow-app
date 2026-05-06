import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { getUser, supabase } from "@/lib/supabase";
import { addDays, formatDayLabel, formatTime, startOfDay, startOfWeek } from "@/lib/format";
import { displayClassType } from "@/types/studio";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

export const Route = createFileRoute("/admin/scheduling")({
  head: () => ({
    meta: [{ title: "Scheduling — One Flow Admin" }],
  }),
  component: SchedulingPage,
});

const SAGE = "#a3b693";
const SAGE_BG = "bg-[#e8efe3]/90";
const SAGE_BORDER = "border-[#c5d4b8]/80";

const CLASS_NAME_PRESETS = [
  "Power Yoga",
  "Sculpt",
  "Sculpt LIIT",
  "Sculpt Kettle Bell",
  "Pilates Flow",
  "Vinyasa 75",
  "Stretch & Release",
  "Sauna Journey: Contrast Therapy",
  "Sauna Journey: Deep Flow",
  "Free Yoga For Beginners",
  "6am Club Power Yoga & Complimentary Wellzone",
  "Unguided: Wellzone Sauna & Plunge",
] as const;

const LOCATIONS = ["Studio 1", "Studio 2", "Wellzone"] as const;

const CLASS_TYPES = [
  { value: "yoga", label: "Yoga" },
  { value: "sculpt", label: "Sculpt" },
  { value: "wellzone", label: "Wellzone" },
  { value: "sauna_journey", label: "Sauna journey" },
] as const;

type RecurringOption = "none" | "weekly";

type ClassRow = {
  id: string;
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  is_cancelled: boolean;
  guide_name: string | null;
};

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

function endOfWeekInclusive(weekStart: Date) {
  const x = addDays(startOfDay(weekStart), 6);
  x.setHours(23, 59, 59, 999);
  return x;
}

function weekLabel(weekStart: Date) {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const a = weekStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const b = end.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (sameMonth) {
    return `${a} – ${end.getDate()} ${end.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}`;
  }
  return `${a} – ${b}`;
}

function SchedulingPage() {
  const [role, setRole] = useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [guideOptions, setGuideOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ClassRow | null>(null);

  const [name, setName] = useState("");
  const [classType, setClassType] = useState<string>("yoga");
  const [location, setLocation] = useState<string>("Studio 1");
  const [guideName, setGuideName] = useState("");
  const [dateStr, setDateStr] = useState(toDateInputValue(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [capacity, setCapacity] = useState("12");
  const [recurring, setRecurring] = useState<RecurringOption>("none");

  const weekStart = useMemo(() => startOfWeek(weekAnchor), [weekAnchor]);
  const weekEnd = useMemo(() => endOfWeekInclusive(weekStart), [weekStart]);
  const isGuide = (role ?? "").toLowerCase() === "guide";
  const canManage = !isGuide;

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

  const loadGuideOptions = useCallback(async () => {
    const { data, error } = await supabase.from("classes").select("guide_name").limit(500);
    if (error) return;
    const set = new Set<string>();
    for (const r of data ?? []) {
      const g = (r as { guide_name?: string | null }).guide_name?.trim();
      if (g) set.add(g);
    }
    setGuideOptions([...set].sort((a, b) => a.localeCompare(b)));
  }, []);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    const from = startOfDay(weekStart);
    const to = weekEnd;
    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, location, starts_at, ends_at, capacity, booked_count, is_cancelled, guide_name",
      )
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString())
      .order("starts_at");

    if (error) {
      console.error(error);
      toast.error("Could not load schedule");
      setRows([]);
    } else {
      setRows((data ?? []) as ClassRow[]);
    }
    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void loadGuideOptions();
  }, [loadGuideOptions]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const byDay = useMemo(() => {
    const buckets: ClassRow[][] = Array.from({ length: 7 }, () => []);
    for (const c of rows) {
      const d = new Date(c.starts_at);
      const idx = Math.round((startOfDay(d).getTime() - weekStart.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) buckets[idx].push(c);
    }
    for (const b of buckets) {
      b.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    }
    return buckets;
  }, [rows, weekStart]);

  const openAdd = () => {
    if (!canManage) return;
    setEditingId(null);
    setName("");
    setClassType("yoga");
    setLocation("Studio 1");
    setGuideName("");
    setDateStr(toDateInputValue(new Date()));
    setStartTime("09:00");
    setEndTime("10:00");
    setCapacity("12");
    setRecurring("none");
    setSheetOpen(true);
  };

  const openEdit = (c: ClassRow) => {
    setEditingId(c.id);
    setName(c.name);
    setClassType(c.class_type || "yoga");
    setLocation(c.location || "Studio 1");
    setGuideName(c.guide_name?.trim() ?? "");
    const s = new Date(c.starts_at);
    const e = new Date(c.ends_at);
    setDateStr(toDateInputValue(s));
    setStartTime(toTimeInputValue(s));
    setEndTime(toTimeInputValue(e));
    setCapacity(String(c.capacity));
    setRecurring("none");
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingId(null);
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
    if (!canManage) {
      toast.error("Management only");
      return;
    }
    if (!validateForm()) return;
    setSaving(true);
    const start = combineDateTimeLocal(dateStr, startTime);
    const end = combineDateTimeLocal(dateStr, endTime);
    const cap = Math.round(Number(capacity));
    const basePayload = {
      name: name.trim(),
      class_type: classType,
      location,
      guide_name: guideName.trim() || null,
      capacity: cap,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("classes")
          .update({
            ...basePayload,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
          })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Class updated");
        closeSheet();
        await loadWeek();
        return;
      }

      const inserts: Record<string, unknown>[] = [];
      const weeks = recurring === "weekly" ? 12 : 1;
      for (let w = 0; w < weeks; w++) {
        const off = w * 7;
        const s = new Date(start);
        s.setDate(s.getDate() + off);
        const e = new Date(end);
        e.setDate(e.getDate() + off);
        inserts.push({
          ...basePayload,
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          booked_count: 0,
          is_cancelled: false,
        });
      }
      const { error } = await supabase.from("classes").insert(inserts);
      if (error) throw error;
      toast.success(recurring === "weekly" ? `Created ${weeks} weekly sessions` : "Class created");
      closeSheet();
      await loadWeek();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!canManage) {
      toast.error("Management only");
      return;
    }
    if (!cancelTarget) return;
    const { error } = await supabase
      .from("classes")
      .update({ is_cancelled: true })
      .eq("id", cancelTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Class cancelled");
    setCancelTarget(null);
    await loadWeek();
  };

  return (
    <div className="min-w-0">
      <PageHeader
        title="Scheduling"
        description={
          canManage
            ? "Add, edit, or cancel classes for the week."
            : "View-only schedule. Management only."
        }
        actions={
          canManage ? (
            <Button
              type="button"
              onClick={openAdd}
              className={cn(
                "shrink-0 gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]",
                SAGE_BORDER,
              )}
            >
              <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
              Add class
            </Button>
          ) : null
        }
      />

      <div
        className={cn(
          "mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3",
          SAGE_BORDER,
          SAGE_BG,
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("shrink-0 border-[#c5d4b8] bg-card", SAGE_BORDER)}
          onClick={() => setWeekAnchor(addDays(weekStart, -7))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Prev week
        </Button>
        <p className="min-w-0 flex-1 text-center font-display text-sm font-semibold text-[#3d4f36] sm:text-base">
          {weekLabel(weekStart)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("shrink-0 border-[#c5d4b8] bg-card", SAGE_BORDER)}
          onClick={() => setWeekAnchor(addDays(weekStart, 7))}
        >
          Next week
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-[#a3b693]" aria-label="Loading" />
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from({ length: 7 }, (_, i) => {
            const day = addDays(weekStart, i);
            const list = byDay[i];
            return (
              <section key={day.toISOString()} className="min-w-0">
                <h3
                  className="mb-2 border-b pb-1 font-display text-sm font-bold uppercase tracking-wide"
                  style={{ color: SAGE, borderColor: "rgba(195, 212, 184, 0.9)" }}
                >
                  {formatDayLabel(day)}
                </h3>
                {list.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No classes.</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((c) => {
                      const start = new Date(c.starts_at);
                      const badge = displayClassType(c.class_type);
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => canManage && openEdit(c)}
                            disabled={c.is_cancelled}
                            className={cn(
                              "w-full rounded-xl border bg-card p-3 text-left text-sm shadow-sm transition-colors",
                              SAGE_BORDER,
                              c.is_cancelled
                                ? "cursor-not-allowed opacity-60"
                                : "hover:border-[#a3b693]/80 hover:bg-[#f4f7f0]/80 active:bg-[#e8efe3]",
                            )}
                          >
                            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs font-semibold tabular-nums text-[#a3b693]">
                                    {formatTime(start)}
                                  </span>
                                  {c.is_cancelled && (
                                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                                      Cancelled
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 truncate font-display text-base font-semibold text-foreground">
                                  {c.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {c.guide_name?.trim() || "—"} · {badge}
                                </p>
                                <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  <span className="inline-flex min-w-0 items-center gap-1">
                                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                    <span className="truncate">{c.location}</span>
                                  </span>
                                  <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                                    <Users className="h-3 w-3 shrink-0" aria-hidden />
                                    {c.booked_count}/{c.capacity}
                                  </span>
                                </p>
                              </div>
                              {!c.is_cancelled &&
                                (canManage ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCancelTarget(c);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                ) : null)}
                            </div>
                          </button>
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

      <Sheet open={sheetOpen} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-[#c5d4b8]/80"
        >
          <SheetHeader>
            <SheetTitle className="font-display text-xl">
              {editingId ? "Edit class" : "Add class"}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4 px-1 pb-6">
            {!canManage && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Management only
              </div>
            )}
            <div>
              <Label htmlFor="sched-name">Class name</Label>
              <input
                id="sched-name"
                list="class-name-presets"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Type or pick a preset"
                disabled={!canManage}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
              />
              <datalist id="class-name-presets">
                {CLASS_NAME_PRESETS.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <div>
              <Label>Class type</Label>
              <Select value={classType} onValueChange={setClassType} disabled={!canManage}>
                <SelectTrigger className="mt-1.5">
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
                <SelectTrigger className="mt-1.5">
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

            <div>
              <Label htmlFor="sched-guide">Guide name</Label>
              <input
                id="sched-guide"
                list="guide-name-options"
                value={guideName}
                onChange={(e) => setGuideName(e.target.value)}
                placeholder="Guide on duty"
                disabled={!canManage}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
              />
              <datalist id="guide-name-options">
                {guideOptions.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="sched-date">Date</Label>
                <input
                  id="sched-date"
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  disabled={!canManage}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
                />
              </div>
              <div>
                <Label htmlFor="sched-start">Start</Label>
                <input
                  id="sched-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={!canManage}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
                />
              </div>
              <div>
                <Label htmlFor="sched-end">End</Label>
                <input
                  id="sched-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={!canManage}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="sched-cap">Capacity</Label>
              <input
                id="sched-cap"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={!canManage}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
              />
            </div>

            <div>
              <Label>Recurring</Label>
              <Select
                value={recurring}
                onValueChange={(v) => setRecurring(v as RecurringOption)}
                disabled={!!editingId || !canManage}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="weekly">Weekly (12 sessions)</SelectItem>
                </SelectContent>
              </Select>
              {editingId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Recurring applies only when creating new classes.
                </p>
              )}
            </div>
          </div>

          <SheetFooter className="flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeSheet} disabled={saving}>
              Close
            </Button>
            <Button
              type="button"
              disabled={saving || !canManage}
              onClick={() => void saveClass()}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                "Save changes"
              ) : (
                "Create"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this class?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `“${cancelTarget.name}” on ${formatDayLabel(new Date(cancelTarget.starts_at))} will be marked cancelled. Members will no longer book it.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep class</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmCancel()}
            >
              Yes, cancel class
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
