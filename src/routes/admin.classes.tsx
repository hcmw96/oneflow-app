import { createFileRoute } from "@tanstack/react-router";
import { Plus, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { classRows } from "@/data/adminMock";

export const Route = createFileRoute("/admin/classes")({
  component: ClassesPage,
});

function ClassesPage() {
  return (
    <div>
      <PageHeader
        title="Classes"
        description="Class templates and defaults"
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> New class
          </button>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Duration</th>
              <th className="px-5 py-3 font-medium">Capacity</th>
              <th className="px-5 py-3 font-medium">Default guide</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {classRows.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-5 py-3 font-semibold">{c.name}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {c.type}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{c.durationMin} min</td>
                <td className="px-5 py-3 text-muted-foreground">{c.capacity}</td>
                <td className="px-5 py-3 text-muted-foreground">{c.defaultGuide}</td>
                <td className="px-5 py-3 text-right">
                  <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
