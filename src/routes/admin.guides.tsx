import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, UserCog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { Switch } from "@/components/ui/switch";
import { getUser, supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";

export const Route = createFileRoute("/admin/guides")({
  head: () => ({
    meta: [{ title: "Guides — One Flow Admin" }],
  }),
  component: GuidesPage,
});

const SAGE = "#a3b693";
const SAGE_BORDER = "border-[#c5d4b8]/80";

const DISCIPLINE_OPTIONS = ["Yoga", "Sculpt", "Pilates", "Wellzone", "Sauna Journey"] as const;

type Discipline = (typeof DISCIPLINE_OPTIONS)[number];
type RoleType = "director" | "management" | "guide" | "customer" | "other";

type GuideSortKey = "name_asc" | "name_desc" | "joined_asc" | "active_first";

type GuideRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  fullName: string;
  disciplines: string[];
  active: boolean;
  classesThisWeek: number;
  joinedAt: string | null;
};

type GuideProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  created_at?: string | null;
};

type GuidesTableRow = {
  profile_id: string;
  disciplines: string[] | null;
  is_active?: boolean | null;
};

function normalizeDisciplineValue(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === "sauna journey" || v === "sauna_journey") return "Sauna Journey";
  return value.trim();
}

function normalizeDisciplines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => normalizeDisciplineValue(String(x)))
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function titleCase(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function roleType(role: string | null | undefined): RoleType {
  const r = (role ?? "").toLowerCase();
  if (r === "director") return "director";
  if (r === "management") return "management";
  if (r === "guide") return "guide";
  if (r === "customer") return "customer";
  return "other";
}

function initials(firstName: string, lastName: string, email: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (first || last) return `${first.charAt(0) || ""}${last.charAt(0) || ""}`.toUpperCase() || "G";
  return email.charAt(0).toUpperCase() || "G";
}

function GuidesPage() {
  const [rows, setRows] = useState<GuideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewerRole, setViewerRole] = useState<RoleType>("other");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [sort, setSort] = useState<GuideSortKey>("name_asc");

  const resetForm = useCallback(() => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setDisciplines([]);
    setActive(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditingId(null);
    resetForm();
  }, [resetForm]);

  const populateForm = useCallback((row: GuideRow) => {
    setFirstName(row.firstName);
    setLastName(row.lastName);
    setEmail(row.email);
    setDisciplines(row.disciplines);
    setActive(row.active);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    const user = await getUser();
    if (!user) {
      setRows([]);
      setViewerRole("other");
      setLoading(false);
      return;
    }

    const weekStart = new Date();
    const day = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const [viewerRoleRes, profilesRes, guidesRes, classesRes] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, role, created_at")
        .eq("role", "guide")
        .order("first_name", { ascending: true }),
      supabase.from("guides").select("profile_id, disciplines, is_active"),
      supabase
        .from("classes")
        .select("guide_name")
        .gte("starts_at", weekStart.toISOString())
        .lt("starts_at", weekEnd.toISOString())
        .eq("is_cancelled", false),
    ]);

    if (viewerRoleRes.error) console.error(viewerRoleRes.error);
    setViewerRole(roleType((viewerRoleRes.data as { role?: string | null } | null)?.role));

    if (profilesRes.error) {
      console.error(profilesRes.error);
      toast.error(supabaseErrorMessage(profilesRes.error, "Could not load guides"));
      setRows([]);
      setLoading(false);
      return;
    }

    if (classesRes.error) {
      console.error(classesRes.error);
      toast.error(supabaseErrorMessage(classesRes.error, "Could not load weekly classes"));
    }

    if (guidesRes.error) {
      console.error(guidesRes.error);
      toast.error(
        `${supabaseErrorMessage(guidesRes.error, "Could not load guide disciplines")} — showing profile data only.`,
      );
    }

    const guideMetaByProfile = new Map<string, { disciplines: string[]; active: boolean }>();
    for (const raw of (guidesRes.data ?? []) as GuidesTableRow[]) {
      guideMetaByProfile.set(String(raw.profile_id), {
        disciplines: normalizeDisciplines(raw.disciplines),
        active: raw.is_active !== false,
      });
    }

    const classCountByGuideName = new Map<string, number>();
    for (const c of (classesRes.data ?? []) as { guide_name: string | null }[]) {
      const key = (c.guide_name ?? "").trim().toLowerCase();
      if (!key) continue;
      classCountByGuideName.set(key, (classCountByGuideName.get(key) ?? 0) + 1);
    }

    const mapped: GuideRow[] = ((profilesRes.data ?? []) as GuideProfileRow[]).map((p) => {
      const first = titleCase(p.first_name ?? "");
      const last = titleCase(p.last_name ?? "");
      const fullName = `${first} ${last}`.trim() || "Guide";
      const meta = guideMetaByProfile.get(p.id);
      const activeState = meta?.active ?? true;
      const classesThisWeek = classCountByGuideName.get(fullName.toLowerCase()) ?? 0;
      return {
        id: p.id,
        firstName: first,
        lastName: last,
        email: (p.email ?? "").trim(),
        fullName,
        disciplines: meta?.disciplines ?? [],
        active: activeState,
        classesThisWeek,
        joinedAt: p.created_at ?? null,
      };
    });

    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = viewerRole === "director";

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      switch (sort) {
        case "name_desc":
          return b.fullName.localeCompare(a.fullName);
        case "joined_asc": {
          const ta = a.joinedAt ?? "";
          const tb = b.joinedAt ?? "";
          return ta.localeCompare(tb);
        }
        case "active_first": {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.fullName.localeCompare(b.fullName);
        }
        case "name_asc":
        default:
          return a.fullName.localeCompare(b.fullName);
      }
    });
    return list;
  }, [rows, sort]);

  const toggleDiscipline = (value: Discipline) => {
    setDisciplines((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  };

  const openInvite = () => {
    setEditingId(null);
    resetForm();
    setActive(true);
    setSheetOpen(true);
  };

  const openEdit = (row: GuideRow) => {
    setEditingId(row.id);
    populateForm(row);
    setSheetOpen(true);
  };

  const saveGuide = async () => {
    if (!canManage) {
      toast.error("Only directors can manage guides.");
      return;
    }

    const payload = {
      first_name: titleCase(firstName),
      last_name: titleCase(lastName),
      email: email.trim().toLowerCase(),
      disciplines,
      active,
    };

    if (!payload.first_name || !payload.last_name || !payload.email) {
      toast.error("First name, last name, and email are required.");
      return;
    }

    setSaving(true);

    if (!editingId) {
      const { error } = await supabase.functions.invoke("invite-guide", {
        body: {
          email: payload.email,
          first_name: payload.first_name,
          last_name: payload.last_name,
          disciplines: payload.disciplines,
        },
      });

      if (error) {
        console.error(error);
        toast.error(supabaseErrorMessage(error, "Could not send invite"));
        setSaving(false);
        return;
      }

      toast.success("Guide invited.");
      setSaving(false);
      closeSheet();
      void load();
      return;
    }

    const nextRole = payload.active ? "guide" : "customer";

    const [profileRes, guidesRes] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email,
          role: nextRole,
        })
        .eq("id", editingId),
      supabase.from("guides").upsert(
        {
          profile_id: editingId,
          disciplines: payload.disciplines,
          is_active: payload.active,
        },
        { onConflict: "profile_id" },
      ),
    ]);

    if (profileRes.error) {
      console.error(profileRes.error);
      toast.error(supabaseErrorMessage(profileRes.error, "Could not update guide"));
      setSaving(false);
      return;
    }

    if (guidesRes.error) {
      console.error(guidesRes.error);
      toast.error(
        supabaseErrorMessage(
          guidesRes.error,
          "Guide profile updated, but disciplines failed — please try again",
        ),
      );
      setSaving(false);
      return;
    }

    toast.success(payload.active ? "Guide updated." : "Guide deactivated and access removed.");
    setSaving(false);
    closeSheet();
    void load();
  };

  const toggleActive = async (row: GuideRow, next: boolean) => {
    if (!canManage) {
      toast.error("Only directors can manage guides.");
      return;
    }

    const [profileRes, guidesRes] = await Promise.all([
      supabase
        .from("profiles")
        .update({ role: next ? "guide" : "customer" })
        .eq("id", row.id),
      supabase
        .from("guides")
        .upsert(
          { profile_id: row.id, disciplines: row.disciplines, is_active: next },
          { onConflict: "profile_id" },
        ),
    ]);

    if (profileRes.error || guidesRes.error) {
      const err = profileRes.error ?? guidesRes.error;
      console.error("guide status toggle failed", profileRes.error, guidesRes.error);
      toast.error(supabaseErrorMessage(err, "Could not update guide status"));
      return;
    }

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== row.id) return r;
        return { ...r, active: next };
      }),
    );
    toast.success(next ? "Guide activated." : "Guide deactivated.");
  };

  return (
    <div>
      <PageHeader
        title="Guides"
        description={loading ? "Loading…" : `${rows.length} guides`}
        actions={
          <Button
            type="button"
            onClick={openInvite}
            disabled={!canManage}
            className="bg-[#a3b693] text-[#243120] hover:bg-[#93a985]"
          >
            <Plus className="h-4 w-4" /> Invite Guide
          </Button>
        }
      />

      {!canManage && !loading && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only directors can invite, edit, or deactivate guides.
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={sort} onValueChange={(v) => setSort(v as GuideSortKey)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="name_desc">Name Z–A</SelectItem>
            <SelectItem value="joined_asc">Date joined</SelectItem>
            <SelectItem value="active_first">Active first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        className={"min-w-0 overflow-x-auto rounded-2xl border bg-card shadow-sm " + SAGE_BORDER}
      >
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading guides…</div>
        ) : sortedRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No guides found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#a3b693]/15">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Guide</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Disciplines</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Classes This Week</th>
                <th className="px-5 py-3 font-medium text-right">Deactivate</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-border hover:bg-[#a3b693]/5"
                  onClick={() => openEdit(row)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-9 w-9 place-content-center rounded-full text-xs font-bold"
                        style={{ backgroundColor: SAGE, color: "#1f2d1a" }}
                        aria-hidden
                      >
                        {initials(row.firstName, row.lastName, row.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{row.fullName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[220px] truncate px-5 py-3 text-muted-foreground">
                    {row.email || "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {row.disciplines.length ? row.disciplines.join(", ") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        row.active
                          ? "bg-green-100 text-green-800"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">
                    {row.classesThisWeek}
                  </td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-2">
                      <Switch
                        checked={row.active}
                        onCheckedChange={(next) => void toggleActive(row, next)}
                        disabled={!canManage}
                        aria-label={`Toggle ${row.fullName} active`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => (open ? setSheetOpen(true) : closeSheet())}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit guide" : "Invite guide"}</SheetTitle>
            <SheetDescription>
              {editingId
                ? "Update guide details, disciplines, and access state."
                : "Send an invite email and create a guide account."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="guide-first">First name</Label>
              <Input
                id="guide-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="guide-last">Last name</Label>
              <Input
                id="guide-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="guide-email">Email</Label>
              <Input
                id="guide-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={Boolean(editingId)}
              />
              {editingId && (
                <p className="text-xs text-muted-foreground">Email is locked for existing users.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Disciplines</Label>
              <div className="grid grid-cols-1 gap-2 rounded-xl border border-border p-3">
                {DISCIPLINE_OPTIONS.map((d) => {
                  const checked = disciplines.includes(d);
                  return (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={checked} onCheckedChange={() => toggleDiscipline(d)} />
                      <span>{d}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {editingId && (
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-xs text-muted-foreground">
                    Turn off to remove admin access (role becomes customer).
                  </p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} disabled={!canManage} />
              </div>
            )}
          </div>

          <SheetFooter className="mt-8">
            <Button type="button" variant="outline" onClick={closeSheet} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveGuide()}
              disabled={saving || !canManage}
              className="bg-[#a3b693] text-[#243120] hover:bg-[#93a985]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCog className="h-4 w-4" />
              )}
              {editingId ? "Save changes" : "Send invite"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
