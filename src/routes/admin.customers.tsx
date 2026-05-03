import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/customers")({
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
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, role")
      .eq("role", "member");

    if (pErr) {
      console.error(pErr);
      setMembers([]);
      setLoading(false);
      return;
    }

    const ids = (profiles ?? []).map((p: { id: string }) => p.id);
    let creditByProfile: Record<string, number> = {};
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

  return (
    <div>
      <PageHeader
        title="Customers"
        description={loading ? "Loading…" : `${members.length} members`}
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Add member
          </button>
        }
      />

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

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
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
                <tr key={m.id} className="cursor-pointer border-t border-border hover:bg-muted/30">
                  <td className="px-5 py-3 font-semibold">{m.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{m.email}</td>
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
