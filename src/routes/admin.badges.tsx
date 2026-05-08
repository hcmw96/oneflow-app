import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUser, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/badges")({
  head: () => ({ meta: [{ title: "Badges — One Flow Admin" }] }),
  component: BadgesPage,
});

const TZ = "Africa/Johannesburg";
const PAGE_SIZE = 20;

type BadgeRow = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  criteria_type: string;
  criteria_value: number | null;
  is_active: boolean;
};

type AwardRow = {
  id: string;
  badgeId: string;
  badgeName: string;
  badgeIcon: string | null;
  profileId: string;
  memberName: string;
  awardedAt: string;
};

type ProfileLite = {
  id: string;
  fullName: string;
  email: string;
};

const CRITERIA_OPTIONS: { value: string; label: string }[] = [
  { value: "classes_attended", label: "Classes attended" },
  { value: "streak_weeks", label: "Streak (weeks)" },
  { value: "challenge_complete", label: "Challenge complete" },
  { value: "manual", label: "Manual award only" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function BadgesPage() {
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [members, setMembers] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("badges");

  // Badge sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [criteriaType, setCriteriaType] = useState("classes_attended");
  const [criteriaValue, setCriteriaValue] = useState("1");
  const [isActive, setIsActive] = useState(true);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<BadgeRow | null>(null);

  // Award dialog
  const [awardOpen, setAwardOpen] = useState(false);
  const [awardBadgeId, setAwardBadgeId] = useState<string>("");
  const [awardMemberId, setAwardMemberId] = useState<string>("");
  const [awardNote, setAwardNote] = useState("");
  const [awardSearch, setAwardSearch] = useState("");
  const [awarding, setAwarding] = useState(false);

  // Awards filter
  const [awardsBadgeFilter, setAwardsBadgeFilter] = useState<string>("all");
  const [awardsSearch, setAwardsSearch] = useState("");
  const [awardsPage, setAwardsPage] = useState(1);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [badgesRes, awardsRes, profilesRes] = await Promise.all([
      supabase
        .from("badges")
        .select("id, name, description, icon, criteria_type, criteria_value, is_active")
        .order("criteria_value", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("member_badges")
        .select(
          "id, badge_id, profile_id, awarded_at, badges(name, icon), profiles(first_name, last_name)",
        )
        .order("awarded_at", { ascending: false })
        .limit(2000),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("role", "customer")
        .order("first_name", { ascending: true })
        .limit(2000),
    ]);

    if (badgesRes.error) {
      console.error(badgesRes.error);
      toast.error(badgesRes.error.message || "Could not load badges");
      setBadges([]);
    } else {
      setBadges((badgesRes.data ?? []) as BadgeRow[]);
    }

    if (!awardsRes.error) {
      const rows: AwardRow[] = (awardsRes.data ?? []).map((raw: Record<string, unknown>) => {
        const b = (Array.isArray(raw.badges) ? raw.badges[0] : raw.badges) as
          | { name?: string; icon?: string | null }
          | null;
        const p = (Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles) as
          | { first_name?: string; last_name?: string }
          | null;
        const fullName = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Member";
        return {
          id: String(raw.id),
          badgeId: String(raw.badge_id),
          badgeName: b?.name ?? "—",
          badgeIcon: b?.icon ?? null,
          profileId: String(raw.profile_id),
          memberName: fullName,
          awardedAt: String(raw.awarded_at ?? ""),
        };
      });
      setAwards(rows);
      const tally: Record<string, number> = {};
      for (const a of rows) tally[a.badgeId] = (tally[a.badgeId] ?? 0) + 1;
      setCounts(tally);
    }

    if (!profilesRes.error) {
      setMembers(
        (profilesRes.data ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          fullName:
            `${p.first_name ?? ""} ${p.last_name ?? ""}`.toString().trim() || "Member",
          email: String(p.email ?? ""),
        })),
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openAdd = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setIcon("");
    setCriteriaType("classes_attended");
    setCriteriaValue("1");
    setIsActive(true);
    setSheetOpen(true);
  };

  const openEdit = (b: BadgeRow) => {
    setEditingId(b.id);
    setName(b.name);
    setDescription(b.description ?? "");
    setIcon(b.icon ?? "");
    setCriteriaType(b.criteria_type);
    setCriteriaValue(b.criteria_value == null ? "" : String(b.criteria_value));
    setIsActive(b.is_active);
    setSheetOpen(true);
  };

  const saveBadge = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const cv =
      criteriaType === "manual"
        ? null
        : Math.max(0, Math.floor(Number(criteriaValue) || 0));
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      icon: icon.trim() || null,
      criteria_type: criteriaType,
      criteria_value: cv,
      is_active: isActive,
    };
    try {
      if (editingId) {
        const { error } = await supabase.from("badges").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Badge updated");
      } else {
        const { error } = await supabase.from("badges").insert(payload);
        if (error) throw error;
        toast.success("Badge created");
      }
      setSheetOpen(false);
      setEditingId(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("badges").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Badge deleted");
    setDeleteTarget(null);
    await loadAll();
  };

  const submitAward = async () => {
    if (!awardBadgeId || !awardMemberId) {
      toast.error("Pick a badge and a member");
      return;
    }
    setAwarding(true);
    const user = await getUser();
    const { error } = await supabase.from("member_badges").insert({
      badge_id: awardBadgeId,
      profile_id: awardMemberId,
      awarded_by: user?.id ?? null,
      notes: awardNote.trim() || null,
    });
    setAwarding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Badge awarded");
    setAwardOpen(false);
    setAwardMemberId("");
    setAwardNote("");
    setAwardSearch("");
    await loadAll();
  };

  const filteredAwardMembers = useMemo(() => {
    const q = awardSearch.trim().toLowerCase();
    if (!q) return members.slice(0, 50);
    return members
      .filter((m) =>
        `${m.fullName} ${m.email}`.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [members, awardSearch]);

  const filteredAwards = useMemo(() => {
    const q = awardsSearch.trim().toLowerCase();
    return awards.filter((a) => {
      if (awardsBadgeFilter !== "all" && a.badgeId !== awardsBadgeFilter) return false;
      if (q && !`${a.memberName} ${a.badgeName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [awards, awardsBadgeFilter, awardsSearch]);

  useEffect(() => {
    setAwardsPage(1);
  }, [awardsBadgeFilter, awardsSearch]);

  const awardsPageCount = Math.max(1, Math.ceil(filteredAwards.length / PAGE_SIZE));
  const awardsPageRows = filteredAwards.slice(
    (awardsPage - 1) * PAGE_SIZE,
    awardsPage * PAGE_SIZE,
  );

  return (
    <div>
      <PageHeader
        title="Badges"
        description={loading ? "Loading…" : `${badges.length} badges`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setAwardOpen(true)}
            >
              <Trophy className="h-4 w-4" /> Award manually
            </Button>
            <Button
              type="button"
              onClick={openAdd}
              className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              <Plus className="h-4 w-4" /> New badge
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="awards">Member badges</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="mt-0">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : badges.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No badges yet.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl leading-none" aria-hidden>
                      {b.icon || "🏅"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-semibold">{b.name}</p>
                      {b.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {b.description}
                        </p>
                      )}
                    </div>
                    {!b.is_active && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Off
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {(CRITERIA_OPTIONS.find((o) => o.value === b.criteria_type)?.label ??
                      b.criteria_type)}
                    {b.criteria_value != null ? ` · ${b.criteria_value}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#3d4f36]">
                    {counts[b.id] ?? 0} member{(counts[b.id] ?? 0) === 1 ? "" : "s"} earned
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => openEdit(b)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="awards" className="mt-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={awardsSearch}
                onChange={(e) => setAwardsSearch(e.target.value)}
                placeholder="Search by member or badge…"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <Select value={awardsBadgeFilter} onValueChange={setAwardsBadgeFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All badges</SelectItem>
                {badges.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.icon ? `${b.icon} ` : ""}
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredAwards.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Trophy className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No badges have been awarded yet.</p>
              </div>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Badge</th>
                    <th className="px-5 py-3 font-medium">Member</th>
                    <th className="px-5 py-3 font-medium">Awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {awardsPageRows.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-5 py-3">
                        <span className="mr-2 text-lg" aria-hidden>
                          {a.badgeIcon ?? "🏅"}
                        </span>
                        <span className="font-semibold">{a.badgeName}</span>
                      </td>
                      <td className="px-5 py-3">{a.memberName}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {formatDate(a.awardedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && filteredAwards.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Page {awardsPage} of {awardsPageCount} · {filteredAwards.length} total
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAwardsPage((p) => Math.max(1, p - 1))}
                  disabled={awardsPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAwardsPage((p) => Math.min(awardsPageCount, p + 1))}
                  disabled={awardsPage >= awardsPageCount}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={(o) => !o && setSheetOpen(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit badge" : "New badge"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bd-name">Name</Label>
              <Input
                id="bd-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First Flow"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bd-icon">Icon (emoji or short text)</Label>
              <Input id="bd-icon" value={icon} onChange={(e) => setIcon(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bd-desc">Description</Label>
              <Textarea
                id="bd-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Criteria type</Label>
              <Select value={criteriaType} onValueChange={setCriteriaType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITERIA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {criteriaType !== "manual" && (
              <div className="grid gap-1.5">
                <Label htmlFor="bd-value">Threshold value</Label>
                <Input
                  id="bd-value"
                  type="number"
                  min={0}
                  value={criteriaValue}
                  onChange={(e) => setCriteriaValue(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <Label htmlFor="bd-active">Active</Label>
              <input
                id="bd-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-5 w-5 accent-[#a3b693]"
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveBadge()}
              disabled={saving}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Create badge"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this badge?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.name}” will be removed. Any members who already earned it will lose it from their profile.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Delete badge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={awardOpen} onOpenChange={setAwardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Award badge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label>Badge</Label>
              <Select value={awardBadgeId} onValueChange={setAwardBadgeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose badge" />
                </SelectTrigger>
                <SelectContent>
                  {badges.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.icon ? `${b.icon} ` : ""}
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Member</Label>
              <Input
                placeholder="Search by name or email…"
                value={awardSearch}
                onChange={(e) => setAwardSearch(e.target.value)}
              />
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-card text-sm">
                {filteredAwardMembers.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">No matches</li>
                ) : (
                  filteredAwardMembers.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setAwardMemberId(m.id)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 ${
                          awardMemberId === m.id ? "bg-muted/60 font-semibold" : ""
                        }`}
                      >
                        <span className="truncate">{m.fullName}</span>
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {m.email}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="award-note">Note (optional)</Label>
              <Textarea
                id="award-note"
                value={awardNote}
                onChange={(e) => setAwardNote(e.target.value)}
                placeholder="Why this member earned the badge"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAwardOpen(false)} disabled={awarding}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitAward()}
              disabled={awarding || !awardBadgeId || !awardMemberId}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {awarding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Award badge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
