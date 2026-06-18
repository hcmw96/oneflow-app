import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getUser, supabase } from "@/lib/supabase";
import { downloadReportCsv } from "@/lib/reportsCsv";
import { cn } from "@/lib/utils";
import {
  type AppCredit,
  buildParsedRow,
  type DetectedColumns,
  detectColumns,
  type MatchedPair,
  type ParsedYocoRow,
  reconcile,
  REQUIRED_COLUMNS,
  type YocoColumnKey,
} from "@/lib/yocoReconciliation";
import type { PeriodBounds } from "@/lib/reportsPeriod";

const SAGE = "#a3b693";
const SAGE_BORDER = "border-[#c5d4b8]/80";

const COLUMN_LABEL: Record<YocoColumnKey, string> = {
  date: "Date",
  amount: "Amount",
  time: "Time",
  reference: "Reference / Receipt #",
  paymentType: "Payment type",
  status: "Status",
};

const COLUMN_ORDER: readonly YocoColumnKey[] = [
  "date",
  "time",
  "amount",
  "reference",
  "paymentType",
  "status",
];

type AppCreditRow = {
  id: string;
  yoco_payment_id: string | null;
  purchased_at: string | null;
  profile?:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
  product?:
    | { name: string | null; price_zar: number | null }
    | { name: string | null; price_zar: number | null }[]
    | null;
};

type RecState =
  | { phase: "idle" }
  | { phase: "parsing" }
  | {
      phase: "needsMapping";
      headers: string[];
      rawRows: Record<string, string>[];
      autoDetected: DetectedColumns;
    }
  | {
      phase: "matched";
      matched: MatchedPair[];
      unmatchedYoco: ParsedYocoRow[];
      unmatchedApp: AppCredit[];
      yocoTotal: number;
      headers: string[];
      cols: DetectedColumns;
    };

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function fullName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—";
}

function formatRand(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function shortDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ReconciliationSection({ bounds }: { bounds: PeriodBounds }) {
  const [appCredits, setAppCredits] = useState<AppCredit[]>([]);
  const [appTotalZar, setAppTotalZar] = useState(0);
  const [loadingApp, setLoadingApp] = useState(true);
  const [state, setState] = useState<RecState>({ phase: "idle" });
  const [offlineTarget, setOfflineTarget] = useState<ParsedYocoRow | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineNote, setOfflineNote] = useState("");
  const [recordedRefs, setRecordedRefs] = useState<Set<string>>(() => new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUtcIso, endUtcIso } = bounds;

  // Pull the period's app credits + offline rows for the matcher and totals.
  useEffect(() => {
    let cancelled = false;
    setLoadingApp(true);

    void (async () => {
      const [creditsRes, offlineRes] = await Promise.all([
        supabase
          .from("user_credits")
          // user_credits has two FKs to profiles (profile_id, refunded_by) since
          // the refund migration, so the bare `profiles(...)` embed is ambiguous.
          // Aliased FK syntax disambiguates the same way admin.transactions does.
          .select(
            "id, yoco_payment_id, purchased_at, profile:profile_id(first_name, last_name), product:product_id(name, price_zar)",
          )
          .gte("purchased_at", startUtcIso)
          .lte("purchased_at", endUtcIso)
          .is("refunded_at", null),
        supabase
          .from("offline_revenue")
          .select("amount_zar, matched_yoco_ref")
          .gte("occurred_at", startUtcIso)
          .lte("occurred_at", endUtcIso),
      ]);

      if (cancelled) return;

      if (creditsRes.error) {
        console.error("reconciliation credits", creditsRes.error);
        toast.error("Could not load app credits for reconciliation.");
      }
      if (offlineRes.error) {
        console.error("reconciliation offline", offlineRes.error);
      }

      const credits = (creditsRes.data ?? []) as AppCreditRow[];
      const mapped: AppCredit[] = credits
        .map((r) => {
          const prof = pickOne(r.profile);
          const prod = pickOne(r.product);
          const purchasedAtMs = r.purchased_at ? Date.parse(r.purchased_at) : NaN;
          return {
            id: r.id,
            yoco_payment_id: r.yoco_payment_id,
            purchasedAtMs: Number.isFinite(purchasedAtMs) ? purchasedAtMs : 0,
            amountZar: Number(prod?.price_zar ?? 0) || 0,
            productName: (prod?.name ?? "Unknown").trim(),
            memberName: fullName(prof),
          };
        });

      const offlineSum = (offlineRes.data ?? []).reduce(
        (acc: number, row: { amount_zar: number }) => acc + (Number(row.amount_zar) || 0),
        0,
      );
      const onlineSum = mapped.reduce((acc, c) => acc + c.amountZar, 0);
      const alreadyRecordedRefs = new Set<string>();
      for (const row of (offlineRes.data ?? []) as { matched_yoco_ref: string | null }[]) {
        if (row.matched_yoco_ref) alreadyRecordedRefs.add(row.matched_yoco_ref);
      }

      setAppCredits(mapped);
      setAppTotalZar(onlineSum + offlineSum);
      setRecordedRefs(alreadyRecordedRefs);
      setLoadingApp(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [startUtcIso, endUtcIso]);

  const runMatcher = useCallback(
    (rawRows: Record<string, string>[], cols: DetectedColumns, headers: string[]) => {
      const parsed: ParsedYocoRow[] = rawRows.map((r, i) => buildParsedRow(r, i, cols));
      const yocoTotal = parsed.reduce((acc, p) => acc + (Number.isFinite(p.amountZar) ? p.amountZar : 0), 0);
      const result = reconcile(parsed, appCredits);
      setState({
        phase: "matched",
        matched: result.matched,
        unmatchedYoco: result.unmatchedYoco,
        unmatchedApp: result.unmatchedApp,
        yocoTotal,
        headers,
        cols,
      });
    },
    [appCredits],
  );

  const onFile = (file: File) => {
    setState({ phase: "parsing" });
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = (results.meta.fields ?? []).filter(Boolean);
        const rows = (results.data ?? []) as Record<string, string>[];
        if (rows.length === 0) {
          toast.error("CSV had no rows.");
          setState({ phase: "idle" });
          return;
        }
        const cols = detectColumns(headers);
        const missing = REQUIRED_COLUMNS.filter((k) => !cols[k]);
        if (missing.length > 0) {
          setState({ phase: "needsMapping", headers, rawRows: rows, autoDetected: cols });
          return;
        }
        runMatcher(rows, cols, headers);
      },
      error: (err) => {
        console.error("papaparse", err);
        toast.error(`CSV parse failed: ${err.message}`);
        setState({ phase: "idle" });
      },
    });
  };

  const triggerFile = () => fileInputRef.current?.click();

  const reset = () => {
    setState({ phase: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const recordOffline = async () => {
    if (!offlineTarget) return;
    if (!offlineTarget.occurredAtUtcIso) {
      toast.error("This row has no valid date — can't record.");
      return;
    }
    setOfflineBusy(true);
    try {
      const user = await getUser();
      const ref = offlineTarget.rawReference || `yoco-${offlineTarget.rawIndex}-${offlineTarget.amountZar}`;
      const { error } = await supabase.from("offline_revenue").insert({
        occurred_at: offlineTarget.occurredAtUtcIso,
        amount_zar: offlineTarget.amountZar,
        source: "offline_pos",
        note: offlineNote.trim() || `Yoco POS · ${offlineTarget.rawPaymentType || "card"}`,
        matched_yoco_ref: ref,
        recorded_by: user?.id ?? null,
      });
      if (error) {
        if (error.code === "23505") {
          toast.error("This Yoco reference is already recorded as offline.");
          setRecordedRefs((prev) => new Set(prev).add(ref));
        } else {
          toast.error(error.message);
        }
        return;
      }
      setRecordedRefs((prev) => new Set(prev).add(ref));
      setAppTotalZar((t) => t + offlineTarget.amountZar);
      toast.success(`Recorded ${formatRand(offlineTarget.amountZar)} offline.`);
      setOfflineTarget(null);
      setOfflineNote("");
    } finally {
      setOfflineBusy(false);
    }
  };

  // Column-mapping form state lives in the needsMapping phase render.
  const [mapping, setMapping] = useState<DetectedColumns>({});
  useEffect(() => {
    if (state.phase === "needsMapping") setMapping({ ...state.autoDetected });
  }, [state]);

  const exportMatchedCsv = () => {
    if (state.phase !== "matched") return;
    const header = ["Yoco date", "Yoco amount", "Yoco ref", "App member", "App product", "Score"];
    const body = state.matched.map((p) => [
      shortDateTime(p.yoco.occurredAtUtcIso),
      Math.round(p.yoco.amountZar),
      p.yoco.rawReference,
      p.app.memberName,
      p.app.productName,
      p.score,
    ]);
    downloadReportCsv(`reconciliation-matched-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const exportOfflineCsv = () => {
    if (state.phase !== "matched") return;
    const header = ["Yoco date", "Yoco amount", "Yoco ref", "Yoco type", "Already recorded"];
    const body = state.unmatchedYoco.map((y) => [
      shortDateTime(y.occurredAtUtcIso),
      Math.round(y.amountZar),
      y.rawReference,
      y.rawPaymentType,
      recordedRefs.has(y.rawReference || "") ? "yes" : "",
    ]);
    downloadReportCsv(`reconciliation-offline-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const exportUnmatchedAppCsv = () => {
    if (state.phase !== "matched") return;
    const header = ["Member", "Product", "Amount", "Purchased at", "Yoco payment id"];
    const body = state.unmatchedApp.map((c) => [
      c.memberName,
      c.productName,
      Math.round(c.amountZar),
      shortDateTime(new Date(c.purchasedAtMs).toISOString()),
      c.yoco_payment_id ?? "",
    ]);
    downloadReportCsv(`reconciliation-unmatched-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const delta = state.phase === "matched" ? state.yocoTotal - appTotalZar : 0;

  return (
    <section>
      <h3
        className="mb-3 font-display text-sm font-bold uppercase tracking-wide"
        style={{ color: SAGE }}
      >
        Yoco Reconciliation
      </h3>

      <div
        className={cn(
          "mb-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        {state.phase === "idle" || state.phase === "parsing" ? (
          <UploadDropzone
            inputRef={fileInputRef}
            parsing={state.phase === "parsing"}
            onTrigger={triggerFile}
            onFile={onFile}
          />
        ) : state.phase === "needsMapping" ? (
          <ColumnMappingForm
            headers={state.headers}
            mapping={mapping}
            setMapping={setMapping}
            onApply={() => runMatcher(state.rawRows, mapping, state.headers)}
            onCancel={reset}
          />
        ) : (
          <MatchSummary
            yocoTotal={state.yocoTotal}
            appTotal={appTotalZar}
            delta={delta}
            matchedCount={state.matched.length}
            offlineCount={state.unmatchedYoco.length}
            unmatchedAppCount={state.unmatchedApp.length}
            loadingApp={loadingApp}
            onReset={reset}
          />
        )}
      </div>

      {state.phase === "matched" ? (
        <>
          <MatchedTable
            rows={state.matched}
            onExport={exportMatchedCsv}
          />

          <OfflineCandidatesTable
            rows={state.unmatchedYoco}
            recordedRefs={recordedRefs}
            onRecord={(row) => {
              setOfflineNote("");
              setOfflineTarget(row);
            }}
            onExport={exportOfflineCsv}
          />

          <UnmatchedAppTable
            rows={state.unmatchedApp}
            onExport={exportUnmatchedAppCsv}
          />
        </>
      ) : null}

      <AlertDialog
        open={!!offlineTarget}
        onOpenChange={(o) => {
          if (!o && !offlineBusy) {
            setOfflineTarget(null);
            setOfflineNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record as offline sale?</AlertDialogTitle>
            <AlertDialogDescription>
              {offlineTarget ? (
                <>
                  {formatRand(offlineTarget.amountZar)} on {shortDateTime(offlineTarget.occurredAtUtcIso)}.
                  Yoco ref: <code className="rounded bg-muted px-1 py-0.5 text-xs">{offlineTarget.rawReference || "—"}</code>
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <label
              htmlFor="offline-note"
              className="text-xs font-medium text-muted-foreground"
            >
              Note (optional)
            </label>
            <Textarea
              id="offline-note"
              rows={3}
              value={offlineNote}
              onChange={(e) => setOfflineNote(e.target.value)}
              placeholder="e.g. mat / merchandise / drop-in class"
              disabled={offlineBusy}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={offlineBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void recordOffline();
              }}
              disabled={offlineBusy}
            >
              {offlineBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record offline sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function UploadDropzone({
  inputRef,
  parsing,
  onTrigger,
  onFile,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  parsing: boolean;
  onTrigger: () => void;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 text-center transition-colors",
        dragging ? "border-[#a3b693] bg-[#e8efe3]/50" : "border-[#c5d4b8]/60 bg-card",
      )}
    >
      <FileSpreadsheet className="h-8 w-8 text-[#7d9268]" aria-hidden />
      <div>
        <p className="text-sm font-semibold">Upload a Yoco CSV export</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Drop the file here, or click to pick it. Nothing is auto-imported — you confirm each
          offline sale.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        className="gap-1 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
        onClick={onTrigger}
        disabled={parsing}
      >
        {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {parsing ? "Parsing…" : "Choose file"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

function ColumnMappingForm({
  headers,
  mapping,
  setMapping,
  onApply,
  onCancel,
}: {
  headers: string[];
  mapping: DetectedColumns;
  setMapping: React.Dispatch<React.SetStateAction<DetectedColumns>>;
  onApply: () => void;
  onCancel: () => void;
}) {
  const missingRequired = REQUIRED_COLUMNS.filter((k) => !mapping[k]);
  return (
    <div>
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Some columns weren't detected automatically. Map them below — the matcher needs at least a
          date column and an amount column.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COLUMN_ORDER.map((key) => {
          const required = (REQUIRED_COLUMNS as readonly YocoColumnKey[]).includes(key);
          return (
            <div key={key} className="grid gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {COLUMN_LABEL[key]}
                {required ? <span className="ml-1 text-destructive">*</span> : null}
              </label>
              <Select
                value={mapping[key] ?? "__none__"}
                onValueChange={(v) =>
                  setMapping((m) => ({ ...m, [key]: v === "__none__" ? undefined : v }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(not in this CSV)</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" />
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
          onClick={onApply}
          disabled={missingRequired.length > 0}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Run matcher
        </Button>
      </div>
    </div>
  );
}

function MatchSummary({
  yocoTotal,
  appTotal,
  delta,
  matchedCount,
  offlineCount,
  unmatchedAppCount,
  loadingApp,
  onReset,
}: {
  yocoTotal: number;
  appTotal: number;
  delta: number;
  matchedCount: number;
  offlineCount: number;
  unmatchedAppCount: number;
  loadingApp: boolean;
  onReset: () => void;
}) {
  const inSync = Math.abs(delta) < 1;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reconciliation summary (for the current period)
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          <X className="mr-1 h-3 w-3" />
          New file
        </Button>
      </div>
      {loadingApp ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Yoco total" value={formatRand(yocoTotal)} icon={<Banknote className="h-4 w-4" />} />
          <StatCard label="App-recorded" value={formatRand(appTotal)} icon={<Banknote className="h-4 w-4" />} />
          <StatCard
            label="Delta"
            value={`${delta >= 0 ? "+" : "−"}${formatRand(Math.abs(delta)).replace("R", "R")}`}
            icon={
              inSync ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )
            }
          />
          <StatCard
            label="Matched · Offline · App-only"
            value={`${matchedCount} · ${offlineCount} · ${unmatchedAppCount}`}
            icon={<FileSpreadsheet className="h-4 w-4" />}
          />
        </div>
      )}
    </div>
  );
}

function MatchedTable({ rows, onExport }: { rows: MatchedPair[]; onExport: () => void }) {
  if (rows.length === 0) {
    return (
      <div className={cn("mt-4 rounded-2xl border bg-card p-4 sm:p-5", SAGE_BORDER, "bg-[#f4f7f0]/80")}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Matched (0)
        </p>
        <p className="py-4 text-center text-sm text-muted-foreground">No Yoco rows matched app credits.</p>
      </div>
    );
  }
  return (
    <div className={cn("mt-4 rounded-2xl border bg-card p-4 sm:p-5", SAGE_BORDER, "bg-[#f4f7f0]/80")}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Matched ({rows.length})
        </p>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onExport}>
          <Download className="h-3 w-3" /> CSV
        </Button>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">Yoco</th>
              <th className="px-2 py-2 font-medium">App credit</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="px-2 py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={`${p.yoco.rawIndex}-${p.app.id}`} className="border-t border-[#c5d4b8]/40">
                <td className="px-2 py-2">
                  <p className="font-medium">{shortDateTime(p.yoco.occurredAtUtcIso)}</p>
                  <p className="text-[10px] text-muted-foreground">{p.yoco.rawReference || "(no ref)"}</p>
                </td>
                <td className="px-2 py-2">
                  <p className="font-medium">{p.app.memberName}</p>
                  <p className="text-[10px] text-muted-foreground">{p.app.productName}</p>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{formatRand(p.app.amountZar)}</td>
                <td className="px-2 py-2 text-right">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                    {p.score}
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

function OfflineCandidatesTable({
  rows,
  recordedRefs,
  onRecord,
  onExport,
}: {
  rows: ParsedYocoRow[];
  recordedRefs: Set<string>;
  onRecord: (row: ParsedYocoRow) => void;
  onExport: () => void;
}) {
  const sum = useMemo(() => rows.reduce((acc, r) => acc + r.amountZar, 0), [rows]);
  return (
    <div className="mt-4 rounded-2xl border border-orange-200/60 bg-orange-50/30 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            In Yoco, not in app ({rows.length})
          </p>
          <p className="text-[11px] text-muted-foreground">
            Almost always in-studio POS sales. {formatRand(sum)} total. Confirm each one.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onExport} disabled={rows.length === 0}>
          <Download className="h-3 w-3" /> CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Every Yoco row had a match. 🎯</p>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-orange-50/95 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Reference</th>
                <th className="px-2 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const recorded = recordedRefs.has(r.rawReference || "");
                return (
                  <tr key={r.rawIndex} className="border-t border-orange-200/50">
                    <td className="px-2 py-2 text-xs">{shortDateTime(r.occurredAtUtcIso)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatRand(r.amountZar)}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.rawPaymentType || "—"}</td>
                    <td className="px-2 py-2 text-[10px] text-muted-foreground">{r.rawReference || "(none)"}</td>
                    <td className="px-2 py-2 text-right">
                      {recorded ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Recorded
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => onRecord(r)}
                          disabled={!r.occurredAtUtcIso}
                        >
                          <Plus className="h-3 w-3" /> Offline sale
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnmatchedAppTable({
  rows,
  onExport,
}: {
  rows: AppCredit[];
  onExport: () => void;
}) {
  const sum = useMemo(() => rows.reduce((acc, r) => acc + r.amountZar, 0), [rows]);
  return (
    <div className="mt-4 rounded-2xl border border-amber-200/60 bg-amber-50/30 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            In app, not in Yoco ({rows.length})
          </p>
          <p className="text-[11px] text-muted-foreground">
            Likely manual grants, comped passes, or settlement still pending. {formatRand(sum)} total.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onExport} disabled={rows.length === 0}>
          <Download className="h-3 w-3" /> CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No app credits left without a Yoco match.</p>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-amber-50/95 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Member</th>
                <th className="px-2 py-2 font-medium">Product</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
                <th className="px-2 py-2 font-medium">Purchased</th>
                <th className="px-2 py-2 font-medium">Yoco ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-amber-200/50">
                  <td className="px-2 py-2 font-medium">{c.memberName}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{c.productName}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatRand(c.amountZar)}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{shortDateTime(new Date(c.purchasedAtMs).toISOString())}</td>
                  <td className="px-2 py-2 text-[10px] text-muted-foreground">{c.yoco_payment_id || "(none)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
