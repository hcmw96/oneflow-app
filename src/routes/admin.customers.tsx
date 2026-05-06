import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({
    meta: [{ title: "Customers — One Flow Admin" }],
  }),
  component: CustomersPage,
});

type MemberRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  credits: number;
  lastVisit: string;
  status: "active" | "paused" | "trial";
};

function CustomersPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [role, setRole] = useState("customer");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, role")
      .eq("role", "customer");

    if (pErr) {
      console.error(pErr);
      setMembers([]);
      setLoading(false);
      return;
    }

    const ids = (profiles ?? []).map((p: { id: string }) => p.id);
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
      return {
        id,
        name,
        email: String(p.email ?? "—"),
        phone: String(p.phone ?? "—"),
        plan: "—",
        credits: creditByProfile[id] ?? 0,
        lastVisit: "—",
        status: "active" as const,
      };
    });

    setMembers(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      members.filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q.toLowerCase()) ||
          m.email.toLowerCase().includes(q.toLowerCase()),
      ),
    [members, q],
  );

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
      toast.error(error.message || "Could not create member");
      setSaving(false);
      return;
    }

    if (data?.error) {
      toast.error(data.error);
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

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Credits</th>
                <th className="px-5 py-3 font-medium">Last visit</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  role="link"
                  tabIndex={0}
                  onClick={() =>
                    navigate({
                      to: "/admin/customers/$customerId",
                      params: { customerId: m.id },
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate({
                        to: "/admin/customers/$customerId",
                        params: { customerId: m.id },
                      });
                    }
                  }}
                  className="cursor-pointer border-t border-border hover:bg-muted/30"
                >
                  <td className="max-w-[160px] truncate px-5 py-3 font-semibold sm:max-w-xs md:max-w-md">
                    {m.name}
                  </td>
                  <td className="max-w-[200px] truncate px-5 py-3 text-muted-foreground sm:max-w-xs md:max-w-md">
                    {m.email}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{m.phone}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
