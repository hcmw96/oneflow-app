import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { members } from "@/data/adminMock";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const [q, setQ] = useState("");
  const filtered = members.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q.toLowerCase()) ||
      m.email.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${members.length} members`}
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
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
                <td className="px-5 py-3 tabular-nums">
                  {m.credits >= 999 ? "∞" : m.credits}
                </td>
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
      </div>
    </div>
  );
}
