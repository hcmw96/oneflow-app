import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { getUser, supabase } from "@/lib/supabase";
import { displayClassType } from "@/types/studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const LOCATIONS = ["Studio 1", "Studio 2", "Wellzone"] as const;

const CLASS_TYPES = [
  { value: "yoga", label: "Yoga" },
  { value: "sculpt", label: "Sculpt" },
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
  guide_id: string | null;
  guide_name: string | null;
  description: string | null;
};

type GuideProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
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

function guideFullName(g: Pick<GuideProfile, "first_name" | "last_name">) {
  return [g.first_name, g.last_name].filter(Boolean).join(" ").trim() || null;
}

const GUIDE_NONE = "__none__";

function ClassesPage() {
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [guides, setGuides] = useState<GuideProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const isGuide = (role ?? "").toLowerCase() === "guide";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null);

  const [name, setName] = useState("");
  const [classType, setClassType] = useState<string>("yoga");
  const [location, setLocation] = useState<string>("Studio 1");
  const [guideId, setGuideId] = useState<string>(GUIDE_NONE);
  const [dateStr, setDateStr] = useState(toDateInputValue(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [capacity, setCapacity] = useState("12");
  const [description, setDescription] = useState("");

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

  const loadGuides = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "guide")
      .order("first_name", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setGuides((data ?? []) as GuideProfile[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("classes")
      .select(
        "id, name, class_type, location, starts_at, ends_at, capacity, guide_id, guide_name, description",
      )
      .eq("is_cancelled", false)
      .order("name", { ascending: true })
      .limit(500);

    if (error) {
      console.error(error);
      toast.error("Could not load classes");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as ClassRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadGuides();
  }, [loadGuides]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolveGuideName = (gid: string | null) => {
    if (!gid) return null;
    const g = guides.find((x) => x.id === gid);
    return g ? guideFullName(g) : null;
  };

  const openCreate = () => {
    if (!isGuide) {
      setEditingId(null);
      setName("");
      setClassType("yoga");
      setLocation("Studio 1");
      setGuideId(GUIDE_NONE);
      setDateStr(toDateInputValue(new Date()));
      setStartTime("09:00");
      setEndTime("10:00");
      setCapacity("12");
      setDescription("");
      setDialogOpen(true);
    }
  };

  const openEdit = (c: ClassRow) => {
    setEditingId(c.id);
    setName(c.name);
    setClassType(c.class_type || "yoga");
    setLocation(c.location || "Studio 1");
    setGuideId(c.guide_id ?? GUIDE_NONE);
    const s = new Date(c.starts_at);
    const e = new Date(c.ends_at);
    setDateStr(toDateInputValue(s));
    setStartTime(toTimeInputValue(s));
    setEndTime(toTimeInputValue(e));
    setCapacity(String(c.capacity));
    setDescription(c.description ?? "");
    setDialogOpen(true);
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
    if (isGuide) return;
    if (!validateForm()) return;
    setSaving(true);
    const start = combineDateTimeLocal(dateStr, startTime);
    const end = combineDateTimeLocal(dateStr, endTime);
    const cap = Math.round(Number(capacity));
    const gid = guideId === GUIDE_NONE ? null : guideId;
    const gName = resolveGuideName(gid);

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
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isGuide) return;
    const { error } = await supabase
      .from("classes")
      .update({ is_cancelled: true })
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Class cancelled");
    setDeleteTarget(null);
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Classes"
        description={
          isGuide ? "Scheduled classes (view only)" : "All upcoming scheduled classes (A–Z)"
        }
        actions={
          !isGuide ? (
            <Button type="button" className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4 shrink-0" aria-hidden /> New class
            </Button>
          ) : null
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit class" : "New class"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="cls-name">Name</Label>
              <Input
                id="cls-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isGuide}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Type</Label>
                <Select value={classType} onValueChange={setClassType} disabled={isGuide}>
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
                <Select value={location} onValueChange={setLocation} disabled={isGuide}>
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
              <Select value={guideId} onValueChange={setGuideId} disabled={isGuide}>
                <SelectTrigger>
                  <SelectValue placeholder="No guide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GUIDE_NONE}>No guide</SelectItem>
                  {guides.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {guideFullName(g) ?? "Guide"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cls-date">Date</Label>
              <Input
                id="cls-date"
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                disabled={isGuide}
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
                  disabled={isGuide}
                />
              </div>
              <div>
                <Label htmlFor="cls-end">Ends</Label>
                <Input
                  id="cls-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={isGuide}
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
                disabled={isGuide}
              />
            </div>
            <div>
              <Label htmlFor="cls-desc">Description</Label>
              <Textarea
                id="cls-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isGuide}
                placeholder="Optional — shown on schedule and booking"
              />
            </div>
          </div>
          {!isGuide ? (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Close
              </Button>
              <Button type="button" disabled={saving} onClick={() => void saveClass()}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this class?</AlertDialogTitle>
            <AlertDialogDescription>
              The class will be marked as cancelled. Existing bookings may still need follow-up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Cancel class</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Starts</th>
                <th className="px-5 py-3 font-medium">Ends</th>
                <th className="px-5 py-3 font-medium">Cap</th>
                <th className="px-5 py-3 font-medium">Guide</th>
                {!isGuide && <th className="px-5 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const gDisplay =
                  resolveGuideName(c.guide_id ?? null) ?? c.guide_name?.trim() ?? "—";
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="max-w-[180px] px-5 py-3 font-semibold sm:max-w-xs">
                      <span className="line-clamp-2">{c.name}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {displayClassType(c.class_type)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{c.location}</td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                      {new Date(c.starts_at).toLocaleString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                      {new Date(c.ends_at).toLocaleString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{c.capacity}</td>
                    <td className="max-w-[140px] truncate px-5 py-3 text-muted-foreground sm:max-w-xs">
                      {gDisplay}
                    </td>
                    {!isGuide && (
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Edit class"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label="Cancel class"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
