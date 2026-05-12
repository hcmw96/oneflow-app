import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Loader2, Package, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { CustomerProfileSheet } from "@/components/admin/CustomerProfileSheet";
import {
  AssignPackageDialog,
  type AssignPackageTarget,
} from "@/components/admin/AssignPackageDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUser, supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";

export const Route = createFileRoute("/admin/customers")({
  validateSearch: (search: Record<string, unknown>) => ({
    profile: typeof search.profile === "string" ? search.profile : undefined,
  }),
  head: () => ({
    meta: [{ title: "Customers — One Flow Admin" }],
  }),
  component: CustomersPage,
});

const TZ = "Africa/Johannesburg";

function yearMonthKeyJhb(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
}

const ALL_ROLES = [
  "customer",
  "guide",
  "front_desk",
  "management",
  "director",
  "boh",
  "marketing",
  "team",
] as const;

type AllRole = (typeof ALL_ROLES)[number];

function isAllRole(r: string): r is AllRole {
  return (ALL_ROLES as readonly string[]).includes(r);
}

const ROLE_LABEL: Record<string, string> = {
  customer: "Customer",
  guide: "Guide",
  front_desk: "Front Desk",
  management: "Management",
  director: "Director",
  boh: "BOH",
  marketing: "Marketing",
  team: "Team",
};

type MemberRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  plan: string;
  credits: number;
  lastVisit: string;
  status: "active" | "paused" | "trial";
  waiverSigned: boolean;
  hasBooking: boolean;
  joinedAt: string | null;
};

function CustomersPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [q, setQ] = useState("");
  const [chipHasCredits, setChipHasCredits] = useState(false);
  const [chipNoCredits, setChipNoCredits] = useState(false);
  const [chipNeverBooked, setChipNeverBooked] = useState(false);
  const [chipWaiverUnsigned, setChipWaiverUnsigned] = useState(false);
  const [chipJoinedMonth, setChipJoinedMonth] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignPackageTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [role, setRole] = useState("customer");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetCustomerId, setSheetCustomerId] = useState<string | null>(null);

  const canManageCustomers =
    (viewerRole ?? "").toLowerCase() === "director" ||
    (viewerRole ?? "").toLowerCase() === "management";

  useEffect(() => {
    void (async () => {
      const user = await getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setViewerRole((data?.role as string | null) ?? null);
    })();
  }, []);

  useEffect(() => {
    if (search.profile) {
      setSheetCustomerId(search.profile);
      setSheetOpen(true);
    }
  }, [search.profile]);

  const openProfileSheet = (id: string) => {
    setSheetCustomerId(id);
    setSheetOpen(true);
    void navigate({ to: "/admin/customers", search: { profile: id }, replace: true });
  };

  const closeProfileSheet = (open: boolean) => {
    setSheetOpen(open);
    if (!open) {
      setSheetCustomerId(null);
      void navigate({ to: "/admin/customers", search: { profile: undefined }, replace: true });
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, role, waiver_accepted_at, created_at")
      .eq("role", "customer");

    if (pErr) {
      console.error(pErr);
      setMembers([]);
      setLoading(false);
      return;
    }

    const ids = (profiles ?? []).map((p: { id: string }) => p.id);
    const bookedIds = new Set<string>();
    if (ids.length) {
      const { data: bookingRows } = await supabase
        .from("bookings")
        .select("profile_id")
        .in("profile_id", ids);
      for (const row of bookingRows ?? []) {
        const pid = row.profile_id as string | null;
        if (pid) bookedIds.add(pid);
      }
    }
    const creditByProfile: Record<string, number> = {};
    if (ids.length) {
      const { data: credits } = await supabase
        .from("user_credits")
        .select("profile_id, credits_remaining, is_unlimited")
        .in("profile_id", ids);

      for (const row of credits ?? []) {
        const pid = row.profile_id as string;
        if (row.is_unlimited) {
          creditByProfile[pid] = 999;
          continue;
        }
        const n = Number(row.credits_remaining) || 0;
        creditByProfile[pid] = (creditByProfile[pid] ?? 0) + n;
      }
    }

    const rows: MemberRow[] = (profiles ?? []).map((p: Record<string, unknown>) => {
      const id = String(p.id);
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Member";
      const waiverAt = p.waiver_accepted_at as string | null | undefined;
      return {
        id,
        name,
        email: String(p.email ?? "—"),
        phone: String(p.phone ?? "—"),
        role: String(p.role ?? "customer").toLowerCase(),
        plan: "—",
        credits: creditByProfile[id] ?? 0,
        lastVisit: "—",
        status: "active" as const,
        waiverSigned: Boolean(waiverAt),
        hasBooking: bookedIds.has(id),
        joinedAt: (p.created_at as string | null | undefined) ?? null,
      };
    });

    setMembers(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chipFilterCount =
    Number(chipHasCredits) +
    Number(chipNoCredits) +
    Number(chipNeverBooked) +
    Number(chipWaiverUnsigned) +
    Number(chipJoinedMonth);

  const clearChipFilters = () => {
    setChipHasCredits(false);
    setChipNoCredits(false);
    setChipNeverBooked(false);
    setChipWaiverUnsigned(false);
    setChipJoinedMonth(false);
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return members.filter((m) => {
      if (ql) {
        const hay = `${m.name} ${m.email}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (chipHasCredits && !(m.credits > 0)) return false;
      if (chipNoCredits && m.credits !== 0) return false;
      if (chipNeverBooked && m.hasBooking) return false;
      if (chipWaiverUnsigned && m.waiverSigned) return false;
      if (
        chipJoinedMonth &&
        (!m.joinedAt || yearMonthKeyJhb(m.joinedAt) !== yearMonthKeyJhb(new Date().toISOString()))
      ) {
        return false;
      }
      return true;
    });
  }, [
    members,
    q,
    chipHasCredits,
    chipNoCredits,
    chipNeverBooked,
    chipWaiverUnsigned,
    chipJoinedMonth,
  ]);

  const resetAddForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setDob("");
    setRole("customer");
  };

  const submitAddMember = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("First name, last name, and email are required.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{
      success?: boolean;
      full_name?: string;
      error?: string;
    }>("invite-member", {
      body: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        date_of_birth: dob.trim() || undefined,
        role: role,
      },
    });

    if (error) {
      toast.error(supabaseErrorMessage(error, "Could not create member"));
      setSaving(false);
      return;
    }

    if (data?.error) {
      toast.error(
        typeof data?.error === "string" && data.error.trim()
          ? data.error
          : "Could not create member — please try again",
      );
      setSaving(false);
      return;
    }

    const displayName = data?.full_name ?? `${firstName.trim()} ${lastName.trim()}`.trim();
    toast.success("Member invited", {
      description: `${displayName} will receive an email to set their password.`,
    });
    setAddOpen(false);
    resetAddForm();
    await load();
    setSaving(false);
  };

  const saveListMemberRole = async (memberId: string, previous: AllRole, next: AllRole) => {
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: next } : m)));
    const { error } = await supabase.from("profiles").update({ role: next }).eq("id", memberId);
    if (error) {
      console.error("customer role update failed", error);
      toast.error(supabaseErrorMessage(error, "Could not update role"));
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: previous } : m)));
      return;
    }
    toast.success("Role updated");
  };

  const onListRoleChange = (memberId: string, currentRole: string, value: string) => {
    if (!isAllRole(value)) return;
    if (!canManageCustomers) return;
    if (value === currentRole) return;
    if (!isAllRole(currentRole)) return;
    void saveListMemberRole(memberId, currentRole, value);
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        description={loading ? "Loading…" : `${members.length} members`}
        actions={
          <Button
            type="button"
            className="gap-2"
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden /> Add member
          </Button>
        }
      />

      <CustomerProfileSheet
        customerId={sheetCustomerId}
        open={sheetOpen}
        onOpenChange={closeProfileSheet}
        viewerRole={viewerRole}
        onProfileUpdated={() => void load()}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div>
                <Label htmlFor="am-first">First name</Label>
                <Input
                  id="am-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <Label htmlFor="am-last">Last name</Label>
                <Input
                  id="am-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="am-email">Email</Label>
              <Input
                id="am-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="am-phone">Phone</Label>
              <Input
                id="am-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div>
              <Label htmlFor="am-dob">Date of birth</Label>
              <Input id="am-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submitAddMember()}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Create & invite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignPackageDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        target={assignTarget}
        canAssign={canManageCustomers}
        onAssigned={() => void load()}
      />

      <div className="mb-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Filters
            {chipFilterCount > 0 ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {chipFilterCount}
              </span>
            ) : null}
          </span>
          {chipFilterCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={clearChipFilters}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["Has credits", chipHasCredits, () => setChipHasCredits((v) => !v)] as const,
              ["No credits", chipNoCredits, () => setChipNoCredits((v) => !v)] as const,
              ["Never booked", chipNeverBooked, () => setChipNeverBooked((v) => !v)] as const,
              ["Waiver not signed", chipWaiverUnsigned, () => setChipWaiverUnsigned((v) => !v)] as const,
              ["Joined this month", chipJoinedMonth, () => setChipJoinedMonth((v) => !v)] as const,
            ] as const
          ).map(([label, on, toggle]) => (
            <button
              key={label}
              type="button"
              onClick={toggle}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                (on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Credits</th>
                <th className="px-5 py-3 font-medium">Last visit</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-border hover:bg-muted/20">
                  <td className="max-w-[160px] px-5 py-3 sm:max-w-xs md:max-w-md">
                    <button
                      type="button"
                      className="truncate text-left font-semibold text-primary underline-offset-2 hover:underline"
                      onClick={() => openProfileSheet(m.id)}
                    >
                      {m.name}
                    </button>
                  </td>
                  <td className="max-w-[200px] truncate px-5 py-3 text-muted-foreground sm:max-w-xs md:max-w-md">
                    {m.email}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{m.phone}</td>
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <Select
                      key={`${m.id}-${m.role}`}
                      value={m.role}
                      onValueChange={(v) => onListRoleChange(m.id, m.role, v)}
                      disabled={!canManageCustomers}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-3">{m.plan}</td>
                  <td className="px-5 py-3 tabular-nums">{m.credits >= 999 ? "∞" : m.credits}</td>
                  <td className="px-5 py-3 text-muted-foreground">{m.lastVisit}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        m.status === "active"
                          ? "bg-success/20 text-success-foreground"
                          : m.status === "trial"
                            ? "bg-warning/30 text-warning-foreground"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={!canManageCustomers}
                      onClick={() => {
                        const em = m.email.trim() === "—" || !m.email.trim() ? null : m.email;
                        setAssignTarget({
                          profileId: m.id,
                          displayName: m.name,
                          email: em,
                          firstName: m.name.split(/\s+/)[0] ?? null,
                        });
                        setAssignOpen(true);
                      }}
                    >
                      <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Assign package
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
