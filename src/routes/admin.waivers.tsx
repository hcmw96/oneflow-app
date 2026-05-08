import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/waivers")({
  head: () => ({ meta: [{ title: "Waivers — One Flow Admin" }] }),
  component: WaiversPage,
});

const TZ = "Africa/Johannesburg";
const PAGE_SIZE = 20;

type WaiverRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  acceptedAt: string | null;
};

type StatusFilter = "all" | "accepted" | "not_accepted";
type SortKey = "name_asc" | "name_desc" | "accepted_desc" | "accepted_asc";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function WaiversPage() {
  const [rows, setRows] = useState<WaiverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("name_asc");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<WaiverRow | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, waiver_accepted_at")
      .eq("role", "customer")
      .order("first_name", { ascending: true });

    if (error) {
      console.error(error);
      toast.error(error.message || "Could not load waivers");
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: WaiverRow[] = (data ?? []).map((p: Record<string, unknown>) => {
      const fn = String(p.first_name ?? "").trim();
      const ln = String(p.last_name ?? "").trim();
      const fullName = `${fn} ${ln}`.trim() || "Member";
      return {
        id: String(p.id),
        firstName: fn,
        lastName: ln,
        fullName,
        email: String(p.email ?? ""),
        acceptedAt: (p.waiver_accepted_at as string | null) ?? null,
      };
    });
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSorted = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (ql) {
        const hay = `${r.fullName} ${r.email}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      const accepted = !!r.acceptedAt;
      if (statusFilter === "accepted" && !accepted) return false;
      if (statusFilter === "not_accepted" && accepted) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "name_desc":
          return b.fullName.localeCompare(a.fullName);
        case "accepted_desc":
          return (b.acceptedAt ?? "").localeCompare(a.acceptedAt ?? "");
        case "accepted_asc":
          return (a.acceptedAt ?? "").localeCompare(b.acceptedAt ?? "");
        case "name_asc":
        default:
          return a.fullName.localeCompare(b.fullName);
      }
    });
    return out;
  }, [rows, q, statusFilter, sort]);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const pageRows = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const acceptedCount = rows.filter((r) => r.acceptedAt).length;
  const notAcceptedCount = rows.length - acceptedCount;
  const recipientsForReminder = rows.filter((r) => !r.acceptedAt && r.email);

  const sendReminder = async () => {
    setSending(true);
    let success = 0;
    let failed = 0;
    for (const r of recipientsForReminder) {
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: r.email,
          template: "waiver_reminder",
          data: { first_name: r.firstName || r.fullName },
        },
      });
      if (error) failed += 1;
      else success += 1;
    }
    setSending(false);
    setReminderOpen(false);
    if (failed === 0) {
      toast.success(`Sent ${success} reminder${success === 1 ? "" : "s"}`);
    } else {
      toast.warning(`${success} sent, ${failed} failed`);
    }
  };

  return (
    <div>
      <PageHeader
        title="Waivers"
        description={
          loading
            ? "Loading…"
            : `${rows.length} members · ${acceptedCount} signed · ${notAcceptedCount} pending`
        }
        actions={
          <Button
            type="button"
            className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            onClick={() => setReminderOpen(true)}
            disabled={loading || recipientsForReminder.length === 0}
          >
            <Mail className="h-4 w-4" />
            Email reminder
            {recipientsForReminder.length ? ` (${recipientsForReminder.length})` : ""}
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All members</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="not_accepted">Not accepted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="name_desc">Name Z–A</SelectItem>
            <SelectItem value="accepted_desc">Recently accepted</SelectItem>
            <SelectItem value="accepted_asc">Oldest accepted</SelectItem>
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
        ) : filteredSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No members match your filters.</p>
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Waiver</th>
                <th className="px-5 py-3 font-medium">Accepted</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const accepted = !!r.acceptedAt;
                return (
                  <tr
                    key={r.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => setDetail(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetail(r);
                      }
                    }}
                    className={cn(
                      "cursor-pointer border-t border-border hover:bg-muted/30",
                      !accepted && "bg-amber-50/40 dark:bg-amber-950/10",
                    )}
                  >
                    <td className="max-w-[200px] truncate px-5 py-3 font-semibold">
                      {r.fullName}
                    </td>
                    <td className="max-w-[260px] truncate px-5 py-3 text-muted-foreground">
                      {r.email || "—"}
                    </td>
                    <td className="px-5 py-3">
                      {accepted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
                          <CheckCircle2 className="h-3 w-3" /> Accepted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          <XCircle className="h-3 w-3" /> Not accepted
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                      {formatDate(r.acceptedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filteredSorted.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {pageCount} · {filteredSorted.length} total
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.fullName ?? "Member"} — waiver</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Email</span>
                <span className="truncate font-medium">{detail.email || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">
                  {detail.acceptedAt ? "Accepted" : "Not accepted"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Accepted at</span>
                <span className="font-medium">{formatDate(detail.acceptedAt)}</span>
              </div>
              {detail.acceptedAt ? (
                <p className="rounded-md bg-green-50 p-3 text-xs text-green-900">
                  This member has accepted the One Flow studio waiver. Their digital signature is
                  recorded with the timestamp above.
                </p>
              ) : (
                <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                  This member has not yet completed onboarding. Send a reminder or ask at the
                  desk.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send waiver reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email {recipientsForReminder.length} member
              {recipientsForReminder.length === 1 ? "" : "s"} who haven't yet accepted the
              waiver, asking them to complete onboarding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void sendReminder();
              }}
              disabled={sending}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send reminders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
