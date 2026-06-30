import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, Coins, CreditCard, Download, TrendingUp } from "lucide-react";
import { CopyableYocoId } from "@/components/admin/CopyableCheckoutId";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { supabase } from "@/lib/supabase";
import {
  PRODUCT_DISPLAY_GROUPS,
  revenueChartLabelForCategories,
} from "@/lib/productCategories";
import { downloadReportCsv } from "@/lib/reportsCsv";
import { jhbDateKey, type PeriodBounds } from "@/lib/reportsPeriod";
import { formatStudioDateTime } from "@/lib/timezone";
import { yocoCheckoutId, yocoReferenceId } from "@/lib/yocoDisplay";
import { cn } from "@/lib/utils";

const SAGE = "#a3b693";
const SAGE_DARK = "#7d9268";
const SAGE_LIGHT = "#c5d4b8";
const SAGE_BORDER = "border-[#c5d4b8]/80";

const CATEGORY_BAR_COLORS = [
  SAGE,
  SAGE_DARK,
  SAGE_LIGHT,
  "#94a3b8",
  "#64748b",
  "#86a68a",
  "#b8c9a8",
  "#78716c",
];

type UserCreditRow = {
  id: string;
  category: string | null;
  credits_total: number | null;
  purchased_at: string | null;
  refunded_at: string | null;
  product_name: string | null;
  yoco_payment_id: string | null;
  products?:
    | { name: string | null; price_zar: number | null; category: string | null; credit_count: number | null }
    | { name: string | null; price_zar: number | null; category: string | null; credit_count: number | null }[]
    | null;
  profile?:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
};

type OnlinePurchaseRow = {
  id: string;
  purchasedAt: string;
  buyerName: string;
  productName: string;
  amount: number;
  yocoPaymentId: string | null;
};

type OfflineRow = {
  id: string;
  occurred_at: string;
  amount_zar: number;
  category: string | null;
  note: string | null;
};

type LiabilityRow = {
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
  products?:
    | { price_zar: number | null; credit_count: number | null }
    | { price_zar: number | null; credit_count: number | null }[]
    | null;
};

type SectionState = {
  loading: boolean;
  totalRevenue: number;
  onlineRevenue: number;
  offlineRevenue: number;
  passesSold: number;
  offlineSalesCount: number;
  aov: number;
  byCategory: { name: string; revenue: number }[];
  byDay: { dateKey: string; revenue: number; label: string }[];
  topProducts: { name: string; units: number; revenue: number }[];
  onlinePurchases: OnlinePurchaseRow[];
  liabilityZar: number;
  errorMsg: string | null;
};

const EMPTY_STATE: SectionState = {
  loading: true,
  totalRevenue: 0,
  onlineRevenue: 0,
  offlineRevenue: 0,
  passesSold: 0,
  offlineSalesCount: 0,
  aov: 0,
  byCategory: PRODUCT_DISPLAY_GROUPS.map((g) => ({ name: g.label, revenue: 0 })),
  byDay: [],
  topProducts: [],
  onlinePurchases: [],
  liabilityZar: 0,
  errorMsg: null,
};

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function formatRand(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function shortDayLabel(dateKey: string): string {
  const noon = new Date(`${dateKey}T12:00:00Z`);
  return noon.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  });
}

export function RevenueSection({ bounds }: { bounds: PeriodBounds }) {
  const [state, setState] = useState<SectionState>(EMPTY_STATE);

  const { startUtcIso, endUtcIso, dateKeys } = bounds;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, errorMsg: null }));

    void (async () => {
      const nowIso = new Date().toISOString();

      const [purchasesRes, offlineRes, liabilityRes] = await Promise.all([
        // 1. Online revenue (user_credits) joined to products(price_zar).
        // Filters: purchased_at in window, NOT refunded.
        supabase
          .from("user_credits")
          .select(
            "id, category, credits_total, purchased_at, refunded_at, product_name, yoco_payment_id, products ( name, price_zar, category, credit_count ), profile:profile_id ( first_name, last_name )",
          )
          .gte("purchased_at", startUtcIso)
          .lte("purchased_at", endUtcIso)
          .is("refunded_at", null),

        // 2. Offline POS revenue rows in window.
        supabase
          .from("offline_revenue")
          .select("id, occurred_at, amount_zar, category, note")
          .gte("occurred_at", startUtcIso)
          .lte("occurred_at", endUtcIso),

        // 3. Liability snapshot: active credits the studio still owes service for.
        // Not period-filtered — this is always "as of now".
        supabase
          .from("user_credits")
          .select(
            "credits_remaining, is_unlimited, expires_at, products ( price_zar, credit_count )",
          )
          .is("refunded_at", null)
          .or("is_unlimited.eq.true,credits_remaining.gt.0"),
      ]);

      if (cancelled) return;

      if (purchasesRes.error) console.error("revenue purchases", purchasesRes.error);
      if (offlineRes.error) console.error("revenue offline", offlineRes.error);
      if (liabilityRes.error) console.error("revenue liability", liabilityRes.error);

      const firstErr =
        purchasesRes.error ?? offlineRes.error ?? liabilityRes.error ?? null;

      const purchases = (purchasesRes.data ?? []) as UserCreditRow[];
      const offlineRows = (offlineRes.data ?? []) as OfflineRow[];
      const liabilityRows = (liabilityRes.data ?? []) as LiabilityRow[];

      // --- Online revenue + by-category + top-products ---
      let onlineRevenue = 0;
      const byCategoryMap = new Map<string, number>();
      for (const g of PRODUCT_DISPLAY_GROUPS) byCategoryMap.set(g.label, 0);

      const productAgg = new Map<string, { units: number; revenue: number }>();
      const onlinePurchases: OnlinePurchaseRow[] = [];

      for (const row of purchases) {
        const prod = pickOne(row.products);
        const price = Number(prod?.price_zar ?? 0) || 0;
        onlineRevenue += price;

        const profile = pickOne(row.profile);
        const buyerName =
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "—";
        const productName =
          (row.product_name ?? "").trim() || (prod?.name ?? "Unknown product").trim();
        if (row.purchased_at) {
          onlinePurchases.push({
            id: row.id,
            purchasedAt: row.purchased_at,
            buyerName,
            productName,
            amount: price,
            yocoPaymentId: row.yoco_payment_id,
          });
        }

        const catLabel = revenueChartLabelForCategories(row.category, prod?.category ?? null);
        byCategoryMap.set(catLabel, (byCategoryMap.get(catLabel) ?? 0) + price);

        const name = (prod?.name ?? "Unknown product").trim();
        const entry = productAgg.get(name) ?? { units: 0, revenue: 0 };
        entry.units += 1;
        entry.revenue += price;
        productAgg.set(name, entry);
      }

      // --- Offline revenue ---
      let offlineRevenue = 0;
      const offlineByCategory = new Map<string, number>();
      for (const row of offlineRows) {
        const amt = Number(row.amount_zar) || 0;
        offlineRevenue += amt;
        const catLabel = revenueChartLabelForCategories(row.category, null);
        offlineByCategory.set(catLabel, (offlineByCategory.get(catLabel) ?? 0) + amt);
      }
      // Roll offline into the by-category chart so totals match.
      for (const [label, amt] of offlineByCategory) {
        byCategoryMap.set(label, (byCategoryMap.get(label) ?? 0) + amt);
      }

      // --- Revenue by day (drives the line chart that defeats single-day R0) ---
      const dayMap = new Map<string, number>();
      for (const k of dateKeys) dayMap.set(k, 0);
      for (const row of purchases) {
        const ts = row.purchased_at;
        if (!ts) continue;
        const k = jhbDateKey(ts);
        if (dayMap.has(k)) {
          const prod = pickOne(row.products);
          dayMap.set(k, (dayMap.get(k) ?? 0) + (Number(prod?.price_zar ?? 0) || 0));
        }
      }
      for (const row of offlineRows) {
        const k = jhbDateKey(row.occurred_at);
        if (dayMap.has(k)) {
          dayMap.set(k, (dayMap.get(k) ?? 0) + (Number(row.amount_zar) || 0));
        }
      }
      const byDay = [...dayMap.entries()].map(([dateKey, revenue]) => ({
        dateKey,
        revenue,
        label: shortDayLabel(dateKey),
      }));

      // --- Liability ---
      let liabilityZar = 0;
      const nowMs = Date.parse(nowIso);
      for (const row of liabilityRows) {
        if (row.is_unlimited) continue; // sold flat-fee; no per-use obligation
        const remaining = Number(row.credits_remaining ?? 0);
        if (!Number.isFinite(remaining) || remaining <= 0) continue;
        if (row.expires_at) {
          const exp = Date.parse(row.expires_at);
          if (Number.isFinite(exp) && exp < nowMs) continue;
        }
        const prod = pickOne(row.products);
        const price = Number(prod?.price_zar ?? 0) || 0;
        const cc = Number(prod?.credit_count ?? 0) || 0;
        if (cc <= 0 || price <= 0) continue;
        const perCredit = price / cc;
        liabilityZar += perCredit * remaining;
      }

      // --- Top selling products ---
      const topProducts = [...productAgg.entries()]
        .map(([name, agg]) => ({ name, units: agg.units, revenue: agg.revenue }))
        .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
        .slice(0, 10);

      onlinePurchases.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

      const totalRevenue = onlineRevenue + offlineRevenue;
      const passesSold = purchases.length;
      const aov = passesSold + offlineRows.length > 0
        ? totalRevenue / (passesSold + offlineRows.length)
        : 0;

      setState({
        loading: false,
        totalRevenue,
        onlineRevenue,
        offlineRevenue,
        passesSold,
        offlineSalesCount: offlineRows.length,
        aov,
        byCategory: PRODUCT_DISPLAY_GROUPS.map((g) => ({
          name: g.label,
          revenue: byCategoryMap.get(g.label) ?? 0,
        })),
        byDay,
        topProducts,
        onlinePurchases,
        liabilityZar,
        errorMsg: firstErr ? firstErr.message : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [startUtcIso, endUtcIso, dateKeys]);

  const exportTopProductsCsv = () => {
    const header = ["Product", "Units sold", "Revenue (ZAR)"];
    const body = state.topProducts.map((p) => [p.name, p.units, Math.round(p.revenue)]);
    downloadReportCsv(
      `top-products-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...body],
    );
  };

  const exportOnlinePurchasesCsv = () => {
    const header = [
      "Date",
      "Buyer",
      "Product",
      "Amount (ZAR)",
      "Yoco checkout ID (Online Reference)",
      "Yoco reference ID",
    ];
    const body = state.onlinePurchases.map((p) => [
      formatStudioDateTime(p.purchasedAt),
      p.buyerName,
      p.productName,
      Math.round(p.amount),
      yocoCheckoutId(p.yocoPaymentId) ?? "",
      yocoReferenceId(p.yocoPaymentId) ?? "",
    ]);
    downloadReportCsv(
      `online-purchases-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...body],
    );
  };

  return (
    <section>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide" style={{ color: SAGE }}>
          Revenue & Sales
        </h3>
      </header>

      {state.errorMsg ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.errorMsg}
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {state.loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total revenue"
              value={formatRand(state.totalRevenue)}
              icon={<Banknote className="h-4 w-4" />}
            />
            <StatCard
              label="Passes sold"
              value={(state.passesSold + state.offlineSalesCount).toLocaleString()}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Avg order value"
              value={formatRand(state.aov)}
              icon={<CreditCard className="h-4 w-4" />}
            />
            <StatCard
              label="Outstanding liability"
              value={formatRand(state.liabilityZar)}
              icon={<Coins className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Total = online (Yoco / app purchases) + offline POS sales. Refunded credits are excluded.
        Outstanding liability values unused, non-expired credits at the per-credit pack price; unlimited passes are flat-fee and excluded.
        Online purchase rows below are the studio source of truth for who bought what. Match Yoco&apos;s CSV <strong>Online Reference</strong> to checkout ID (<code className="text-[10px]">ch_…</code>) and <strong>Reference</strong> to reference ID.
      </p>

      {/* Online vs offline split */}
      {!state.loading && (state.onlineRevenue > 0 || state.offlineRevenue > 0) ? (
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="rounded-xl border border-border bg-card px-3 py-2">
            <p className="font-semibold text-foreground">Online</p>
            <p className="tabular-nums">{formatRand(state.onlineRevenue)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2">
            <p className="font-semibold text-foreground">Offline POS</p>
            <p className="tabular-nums">{formatRand(state.offlineRevenue)}</p>
          </div>
        </div>
      ) : null}

      {/* Revenue by day line chart */}
      <div
        className={cn(
          "mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Revenue by day
        </p>
        {state.loading ? (
          <Skeleton className="h-[240px] w-full rounded-xl" />
        ) : state.byDay.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No data in this period.</p>
        ) : (
          <div className="h-[240px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={SAGE_LIGHT} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#3d4f36" }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#3d4f36" }}
                  tickFormatter={(v) => `R${v}`}
                  width={56}
                />
                <Tooltip
                  formatter={(value: number) => [formatRand(value), "Revenue"]}
                  contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={SAGE_DARK}
                  strokeWidth={2}
                  dot={{ r: 3, fill: SAGE }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Revenue by category bar chart */}
      <div
        className={cn(
          "mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Revenue by product category
        </p>
        {state.loading ? (
          <Skeleton className="h-[240px] w-full rounded-xl" />
        ) : (
          <div className="h-[240px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={state.byCategory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={SAGE_LIGHT} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#3d4f36" }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={72}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#3d4f36" }}
                  tickFormatter={(v) => `R${v}`}
                  width={56}
                />
                <Tooltip
                  formatter={(value: number) => [formatRand(value), "Revenue"]}
                  contentStyle={{ borderRadius: 12, borderColor: SAGE_LIGHT }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {state.byCategory.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_BAR_COLORS[i % CATEGORY_BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Online purchases — buyer / product / checkout ID */}
      <div
        className={cn(
          "mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Online purchases
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={exportOnlinePurchasesCsv}
            disabled={state.loading || state.onlinePurchases.length === 0}
          >
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>
        {state.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : state.onlinePurchases.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No online sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Buyer</th>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Checkout ID</th>
                  <th className="px-2 py-2 font-medium">Reference ID</th>
                </tr>
              </thead>
              <tbody>
                {state.onlinePurchases.map((p) => {
                  const checkoutId = yocoCheckoutId(p.yocoPaymentId);
                  const referenceId = yocoReferenceId(p.yocoPaymentId);
                  return (
                    <tr key={p.id} className="border-t border-[#c5d4b8]/40">
                      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-muted-foreground">
                        {formatStudioDateTime(p.purchasedAt, { year: "numeric" })}
                      </td>
                      <td className="max-w-[140px] px-2 py-2.5">
                        <p className="truncate font-semibold text-foreground">{p.buyerName}</p>
                      </td>
                      <td className="max-w-[180px] px-2 py-2.5">
                        <p className="truncate font-medium">{p.productName}</p>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 font-semibold tabular-nums">
                        {formatRand(p.amount)}
                      </td>
                      <td className="px-2 py-2.5">
                        {checkoutId ? (
                          <CopyableYocoId
                            id={checkoutId}
                            label="Checkout ID"
                            csvColumn="Online Reference"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {referenceId ? (
                          <CopyableYocoId
                            id={referenceId}
                            label="Reference ID"
                            csvColumn="Reference"
                          />
                        ) : checkoutId ? (
                          <span className="text-xs text-muted-foreground">After payment</span>
                        ) : (
                          <span className="text-xs text-amber-800">Not captured</span>
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

      {/* Top-selling products table */}
      <div
        className={cn(
          "mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
          SAGE_BORDER,
          "bg-[#f4f7f0]/80",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Top-selling products
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={exportTopProductsCsv}
            disabled={state.loading || state.topProducts.length === 0}
          >
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>
        {state.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : state.topProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 text-right font-medium">Units</th>
                  <th className="px-2 py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {state.topProducts.map((p, i) => (
                  <tr key={p.name} className="border-t border-[#c5d4b8]/40">
                    <td className="px-2 py-2 font-medium">
                      <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                      {p.name}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.units}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatRand(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
