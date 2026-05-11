import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Receipt,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";

export const Route = createFileRoute("/admin/transactions")({
  head: () => ({ meta: [{ title: "Transactions — One Flow Admin" }] }),
  component: TransactionsPage,
});

const TZ = "Africa/Johannesburg";
const PAGE_SIZE = 20;

type TxRow = {
  id: string;
  date: string;
  memberId: string | null;
  memberName: string;
  productId: string | null;
  productName: string;
  amount: number;
  paymentMethod: string;
  yocoPaymentId: string | null;
};

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "name_asc";

function formatRand(n: number): string {
  return `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function jhbDayBoundsAt(daysAgo: number): { start: string; end: string } {
  const now = new Date();
  const jhbNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const y = jhbNow.getFullYear();
  const m = jhbNow.getMonth();
  const d = jhbNow.getDate() - daysAgo;
  const startUtc = new Date(Date.UTC(y, m, d, -2, 0, 0, 0));
  const endUtc = new Date(Date.UTC(y, m, d + 1, -2, 0, 0, -1));
  return { start: startUtc.toISOString(), end: endUtc.toISOString() };
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [page, setPage] = useState(1);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueWeek, setRevenueWeek] = useState(0);
  const [revenueMonth, setRevenueMonth] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_credits")
      .select(
        "id, created_at, profile_id, product_id, product_name, yoco_payment_id, profile:profile_id(first_name, last_name), product:product_id(name, price_zar)",
      )
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      console.error("transactions load failed", error);
      toast.error(supabaseErrorMessage(error, "Could not load transactions"));
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: TxRow[] = (data ?? []).map((raw: Record<string, unknown>) => {
      const profile = (Array.isArray(raw.profile) ? raw.profile[0] : raw.profile) as
        | { first_name?: string; last_name?: string }
        | null;
      const product = (Array.isArray(raw.product) ? raw.product[0] : raw.product) as
        | { name?: string; price_zar?: number }
        | null;
      const memberName =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "—";
      const productName =
        (raw.product_name as string | null)?.trim() || product?.name || "—";
      const amount = Number(product?.price_zar ?? 0) || 0;
      const yoco = (raw.yoco_payment_id as string | null) ?? null;
      return {
        id: String(raw.id),
        date: (raw.created_at as string) ?? new Date().toISOString(),
        memberId: (raw.profile_id as string | null) ?? null,
        memberName,
        productId: (raw.product_id as string | null) ?? null,
        productName,
        amount,
        paymentMethod: yoco ? "yoco" : "manual",
        yocoPaymentId: yoco,
      };
    });

    setRows(mapped);

    const today = jhbDayBoundsAt(0);
    const weekStart = jhbDayBoundsAt(6);
    const monthStart = jhbDayBoundsAt(29);

    const sumIn = (startIso: string, endIso: string) =>
      mapped
        .filter((r) => r.date >= startIso && r.date <= endIso)
        .reduce((acc, r) => acc + r.amount, 0);

    setRevenueToday(sumIn(today.start, today.end));
    setRevenueWeek(sumIn(weekStart.start, today.end));
    setRevenueMonth(sumIn(monthStart.start, today.end));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSorted = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (ql) {
        const hay = `${r.memberName} ${r.productName}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (methodFilter !== "all" && r.paymentMethod !== methodFilter) return false;
      if (dateFrom && r.date < new Date(dateFrom).toISOString()) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (r.date > end.toISOString()) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "date_asc":
          return a.date.localeCompare(b.date);
        case "amount_desc":
          return b.amount - a.amount;
        case "amount_asc":
          return a.amount - b.amount;
        case "name_asc":
          return a.memberName.localeCompare(b.memberName);
        case "date_desc":
        default:
          return b.date.localeCompare(a.date);
      }
    });
    return out;
  }, [rows, q, methodFilter, dateFrom, dateTo, sort]);

  useEffect(() => {
    setPage(1);
  }, [q, methodFilter, dateFrom, dateTo, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const pageRows = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => {
    const header = [
      "Date",
      "Member",
      "Product",
      "Amount (ZAR)",
      "Payment method",
      "Yoco payment ID",
    ];
    const body = filteredSorted.map((r) => [
      formatDate(r.date),
      r.memberName,
      r.productName,
      r.amount.toString(),
      r.paymentMethod,
      r.yocoPaymentId ?? "",
    ]);
    downloadCsv(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={loading ? "Loading…" : `${filteredSorted.length} transactions`}
        actions={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={exportCsv}
            disabled={loading || filteredSorted.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Revenue today" value={formatRand(revenueToday)} />
        <StatCard label="Revenue this week" value={formatRand(revenueWeek)} />
        <StatCard label="Revenue this month" value={formatRand(revenueMonth)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by member or product…"
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment methods</SelectItem>
            <SelectItem value="yoco">Yoco</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full sm:w-40"
          aria-label="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full sm:w-40"
          aria-label="To date"
        />
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest first</SelectItem>
            <SelectItem value="date_asc">Oldest first</SelectItem>
            <SelectItem value="amount_desc">Amount: high to low</SelectItem>
            <SelectItem value="amount_asc">Amount: low to high</SelectItem>
            <SelectItem value="name_asc">Member A–Z</SelectItem>
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
            <Receipt className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No transactions match your filters.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Method</th>
                <th className="px-5 py-3 font-medium">Yoco ID</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                    {formatDate(r.date)}
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-3 font-semibold">
                    {r.memberName}
                  </td>
                  <td className="max-w-[220px] truncate px-5 py-3 text-muted-foreground">
                    {r.productName}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                    {formatRand(r.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-[#e8efe3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3d4f36]">
                      {r.paymentMethod}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {r.yocoPaymentId ? (
                      <a
                        href={`https://portal.yoco.com/payments/${r.yocoPaymentId}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#a3b693] hover:underline"
                      >
                        View in Yoco
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
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
    </div>
  );
}
