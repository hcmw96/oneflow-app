import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search, MoreHorizontal, X } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { bookingRows, classRows, type AdminBookingRow } from "@/data/adminMock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsPage,
});

type Status = AdminBookingRow["status"];
const STATUSES = ["all", "booked", "attended", "cancelled", "no-show"] as const;
const RANGES = ["today", "tomorrow", "week", "all"] as const;
type Range = (typeof RANGES)[number];

const rangeLabel: Record<Range, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  all: "All",
};

function inRange(b: AdminBookingRow, r: Range) {
  if (r === "all") return true;
  if (r === "today") return b.startsAt.startsWith("Today");
  if (r === "tomorrow") return b.startsAt.startsWith("Tomorrow");
  // week: anything but Yesterday
  return !b.startsAt.startsWith("Yesterday");
}

function statusClass(s: Status) {
  return cn(
    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
    s === "attended" && "bg-success/20 text-success-foreground",
    s === "booked" && "bg-muted text-foreground",
    s === "cancelled" && "bg-destructive/15 text-destructive",
    s === "no-show" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  );
}

function BookingsPage() {
  const [rows, setRows] = useState<AdminBookingRow[]>(bookingRows);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [range, setRange] = useState<Range>("today");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter((b) => {
        if (!inRange(b, range)) return false;
        if (status !== "all" && b.status !== status) return false;
        if (classFilter !== "all" && b.className !== classFilter) return false;
        if (query && !b.member.toLowerCase().includes(query.toLowerCase()))
          return false;
        return true;
      }),
    [rows, status, range, classFilter, query],
  );

  const setBookingStatus = (id: string, s: Status) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: s } : r)));

  const exportCsv = () => {
    const header = ["Member", "Class", "When", "Status", "Credit"];
    const csv = [
      header.join(","),
      ...filtered.map((b) =>
        [b.member, b.className, b.startsAt, b.status, b.credit]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-${range}-${status}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setStatus("all");
    setRange("all");
    setClassFilter("all");
    setQuery("");
  };

  const detail = detailId ? rows.find((r) => r.id === detailId) : null;

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Every reservation across all classes"
        actions={
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      {/* Filters */}
      <div className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
        {/* Range chips */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                range === r
                  ? "bg-foreground text-background"
                  : "border border-border bg-background hover:bg-muted",
              )}
            >
              {rangeLabel[r]}
            </button>
          ))}
        </div>

        {/* Status chips */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                status === s
                  ? "bg-foreground text-background"
                  : "border border-border bg-background hover:bg-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Class + search */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classRows.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search member by name…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <span className="self-center text-xs text-muted-foreground sm:ml-auto">
            {filtered.length} bookings
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No bookings match your filters.
          </p>
          <button
            onClick={clearFilters}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Credit</th>
                  <th className="w-10 px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setDetailId(b.id)}
                    className="cursor-pointer border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-5 py-3 font-medium">{b.member}</td>
                    <td className="px-5 py-3">{b.className}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {b.startsAt}
                    </td>
                    <td className="px-5 py-3">
                      <span className={statusClass(b.status)}>{b.status}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {b.credit}
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowMenu
                        onCancel={() => setBookingStatus(b.id, "cancelled")}
                        onNoShow={() => setBookingStatus(b.id, "no-show")}
                        onAttended={() => setBookingStatus(b.id, "attended")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => setDetailId(b.id)}
                className="block w-full rounded-2xl border border-border bg-card p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{b.member}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.className}
                    </p>
                  </div>
                  <span className={statusClass(b.status)}>{b.status}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{b.startsAt}</span>
                  <span>{b.credit}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Detail sheet */}
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetailId(null)}>
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle>Booking details</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-6 space-y-5">
              <div>
                <p className="font-display text-xl font-bold">{detail.member}</p>
                <p className="text-sm text-muted-foreground">{detail.credit}</p>
              </div>

              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div className="col-span-3 rounded-xl border border-border p-3">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Class
                  </dt>
                  <dd className="mt-1 font-semibold">{detail.className}</dd>
                </div>
                <div className="col-span-2 rounded-xl border border-border p-3">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    When
                  </dt>
                  <dd className="mt-1 font-semibold">{detail.startsAt}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </dt>
                  <dd className="mt-1">
                    <span className={statusClass(detail.status)}>
                      {detail.status}
                    </span>
                  </dd>
                </div>
              </dl>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Member history
                </p>
                <ul className="space-y-1.5 text-sm">
                  {rows
                    .filter((r) => r.member === detail.member && r.id !== detail.id)
                    .slice(0, 6)
                    .map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                      >
                        <span>{r.className}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.startsAt}
                        </span>
                      </li>
                    ))}
                  {rows.filter((r) => r.member === detail.member).length <= 1 && (
                    <li className="text-xs text-muted-foreground">
                      No other bookings.
                    </li>
                  )}
                </ul>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setBookingStatus(detail.id, "attended");
                    setDetailId(null);
                  }}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Attended
                </button>
                <button
                  onClick={() => {
                    setBookingStatus(detail.id, "no-show");
                    setDetailId(null);
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                >
                  No-show
                </button>
                <button
                  onClick={() => {
                    setBookingStatus(detail.id, "cancelled");
                    setDetailId(null);
                  }}
                  className="rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RowMenu({
  onCancel,
  onNoShow,
  onAttended,
}: {
  onCancel: () => void;
  onNoShow: () => void;
  onAttended: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Booking actions"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onAttended}>Mark attended</DropdownMenuItem>
        <DropdownMenuItem onClick={onNoShow}>Mark no-show</DropdownMenuItem>
        <DropdownMenuItem onClick={onCancel} className="text-destructive">
          Cancel booking
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
