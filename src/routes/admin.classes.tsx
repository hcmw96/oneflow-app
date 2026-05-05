import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Plus, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { supabase } from "@/lib/supabase";
import { displayClassType } from "@/types/studio";

export const Route = createFileRoute("/admin/classes")({
  component: ClassesPage,
});

type ClassTemplateRow = {
  id: string;
  name: string;
  class_type: string;
  durationMin: number;
  capacity: number;
  /** From `classes.guide_name` */
  guideName: string;
};

function ClassesPage() {
  const [rows, setRows] = useState<ClassTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, class_type, capacity, starts_at, ends_at, guide_name")
      .eq("is_cancelled", false)
      .order("starts_at", { ascending: false })
      .limit(80);

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped =
      (data as Record<string, unknown>[] | null)?.map((raw) => {
        const start = new Date(String(raw.starts_at));
        const end = new Date(String(raw.ends_at));
        const durationMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
        const gn = raw.guide_name;
        const guideName = typeof gn === "string" && gn.trim() ? gn.trim() : "—";
        return {
          id: String(raw.id),
          name: String(raw.name ?? ""),
          class_type: String(raw.class_type ?? ""),
          durationMin,
          capacity: Number(raw.capacity ?? 0),
          guideName,
        };
      }) ?? [];

    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Upcoming scheduled classes"
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden /> New class
          </button>
        }
      />

      <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Capacity</th>
                <th className="px-5 py-3 font-medium">Guide</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="max-w-[200px] truncate px-5 py-3 font-semibold sm:max-w-xs md:max-w-md">
                    {c.name}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {displayClassType(c.class_type)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{c.durationMin} min</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.capacity}</td>
                  <td className="max-w-[180px] truncate px-5 py-3 text-muted-foreground sm:max-w-xs md:max-w-md">
                    {c.guideName}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
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
