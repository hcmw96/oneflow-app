import { STUDIO_TIMEZONE, zonedLocalToUtc } from "@/lib/timezone";

/** Logical columns we look for in a Yoco CSV. */
export type YocoColumnKey =
  | "date"
  | "time"
  | "amount"
  | "paymentType"
  | "reference"
  | "status";

export type DetectedColumns = Partial<Record<YocoColumnKey, string>>;

export type ParsedYocoRow = {
  rawIndex: number; // 0-based row in the CSV (post-header)
  rawDate: string;
  rawTime: string | undefined;
  rawAmount: string;
  rawReference: string;
  rawPaymentType: string;
  rawStatus: string;
  amountZar: number;
  occurredAtUtcIso: string | null;
  occurredAtMs: number | null;
};

const COLUMN_PATTERNS: Record<YocoColumnKey, RegExp[]> = {
  date: [
    /^date$/i,
    /^transaction\s*date$/i,
    /^settl\w*\s*date$/i,
    /^paid\s*at$/i,
    /^created\s*at$/i,
  ],
  time: [/^time$/i, /^transaction\s*time$/i],
  amount: [
    /^amount\s*\(?\s*zar\s*\)?$/i,
    /^amount$/i,
    /^value$/i,
    /^gross$/i,
    /^net$/i,
    /^total$/i,
  ],
  paymentType: [
    /^type$/i,
    /^payment\s*type$/i,
    /^payment\s*method$/i,
    /^method$/i,
    /^channel$/i,
    /^source$/i,
  ],
  reference: [
    /^reference$/i,
    /^receipt(\s*no\.?)?$/i,
    /^receipt\s*number$/i,
    /^payment\s*id$/i,
    /^transaction\s*id$/i,
    /^transaction\s*ref(erence)?$/i,
    /^id$/i,
  ],
  status: [/^status$/i, /^state$/i, /^result$/i],
};

/**
 * Find which CSV header maps to each logical column. Returns whatever it can
 * resolve; the caller decides how to handle the gaps (we surface a remap UI).
 */
export function detectColumns(headers: string[]): DetectedColumns {
  const cleaned = headers.map((h) => (h ?? "").trim());
  const out: DetectedColumns = {};
  for (const key of Object.keys(COLUMN_PATTERNS) as YocoColumnKey[]) {
    for (const pat of COLUMN_PATTERNS[key]) {
      const hit = cleaned.find((h) => h && pat.test(h));
      if (hit) {
        out[key] = hit;
        break;
      }
    }
  }
  return out;
}

/** Headers that *must* be mapped before we'll run the matcher. */
export const REQUIRED_COLUMNS: readonly YocoColumnKey[] = [
  "date",
  "amount",
];

/** Strips R/ZAR symbols, thousands separators, parentheses-as-negative. */
export function parseAmountZar(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replace(/[Rr]|ZAR/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/^\((.+)\)$/, "-$1");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const DATE_PATTERNS: Array<{
  re: RegExp;
  yi: number;
  mi: number;
  di: number;
}> = [
  // ISO-ish: 2026-06-15
  { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, yi: 1, mi: 2, di: 3 },
  // South Africa convention: 15/06/2026
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, yi: 3, mi: 2, di: 1 },
  // US-ish: 06/15/2026 — disambiguate vs above only when first num >12
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, yi: 3, mi: 1, di: 2 },
  // Dotted: 15.06.2026
  { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, yi: 3, mi: 2, di: 1 },
];

/**
 * Parses a Yoco date+time into a UTC ISO interpreted as JHB-local.
 *   "2026-06-15", "14:23:01"  →  the UTC instant for 2026-06-15 14:23:01 JHB.
 * Time is optional; defaults to 00:00:00.
 */
export function parseYocoDateTime(
  rawDate: string | undefined,
  rawTime: string | undefined,
): { iso: string; ms: number } | null {
  if (!rawDate) return null;
  const dateStr = rawDate.trim();
  let y = 0, m = 0, d = 0;
  let parsedDate = false;

  // Try ISO + locale shapes first.
  for (const p of DATE_PATTERNS) {
    const mt = dateStr.match(p.re);
    if (!mt) continue;
    const yy = Number(mt[p.yi]);
    const mm = Number(mt[p.mi]);
    const dd = Number(mt[p.di]);
    if (mm > 12) continue; // skip ambiguous matches that mean d/m
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) continue;
    y = yy; m = mm; d = dd;
    parsedDate = true;
    break;
  }

  if (!parsedDate) {
    // Last-ditch: let Date.parse try.
    const guess = new Date(dateStr);
    if (Number.isNaN(guess.getTime())) return null;
    y = guess.getUTCFullYear();
    m = guess.getUTCMonth() + 1;
    d = guess.getUTCDate();
  }

  const timeStr = (rawTime ?? "").trim();
  let hh = 0, mi = 0, ss = 0;
  if (timeStr) {
    const mt = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
    if (mt) {
      hh = Number(mt[1]);
      mi = Number(mt[2]);
      ss = Number(mt[3] ?? 0);
      const ampm = mt[4]?.toUpperCase();
      if (ampm === "PM" && hh < 12) hh += 12;
      if (ampm === "AM" && hh === 12) hh = 0;
    }
  }

  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const hms = `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const utc = zonedLocalToUtc(ymd, hms, STUDIO_TIMEZONE);
  if (!Number.isFinite(utc.getTime())) return null;
  return { iso: utc.toISOString(), ms: utc.getTime() };
}

/** Turn a single parsed CSV row into a ParsedYocoRow. */
export function buildParsedRow(
  raw: Record<string, string>,
  rawIndex: number,
  cols: DetectedColumns,
): ParsedYocoRow {
  const rawDate = cols.date ? String(raw[cols.date] ?? "") : "";
  const rawTime = cols.time ? String(raw[cols.time] ?? "") : "";
  const rawAmount = cols.amount ? String(raw[cols.amount] ?? "") : "";
  const rawReference = cols.reference ? String(raw[cols.reference] ?? "") : "";
  const rawPaymentType = cols.paymentType ? String(raw[cols.paymentType] ?? "") : "";
  const rawStatus = cols.status ? String(raw[cols.status] ?? "") : "";
  const amountZar = parseAmountZar(rawAmount) ?? 0;
  const dt = parseYocoDateTime(rawDate, rawTime);
  return {
    rawIndex,
    rawDate,
    rawTime: rawTime || undefined,
    rawAmount,
    rawReference,
    rawPaymentType,
    rawStatus,
    amountZar,
    occurredAtUtcIso: dt?.iso ?? null,
    occurredAtMs: dt?.ms ?? null,
  };
}

/** App-side credit pulled in for matching. */
export type AppCredit = {
  id: string;
  yoco_payment_id: string | null;
  purchasedAtMs: number;
  amountZar: number;
  productName: string;
  memberName: string;
};

export type MatchedPair = {
  yoco: ParsedYocoRow;
  app: AppCredit;
  score: number;
  reasons: string[];
};

/** Two-phase reconcile: ref-id matches first, then amount + time-window. */
export function reconcile(parsed: ParsedYocoRow[], candidates: AppCredit[]): {
  matched: MatchedPair[];
  unmatchedYoco: ParsedYocoRow[];
  unmatchedApp: AppCredit[];
} {
  const used = new Set<string>();
  const matched: MatchedPair[] = [];
  const remainingYoco: ParsedYocoRow[] = [];

  // Phase 1: exact yoco_payment_id matches (highest confidence).
  for (const y of parsed) {
    if (y.rawReference) {
      const c = candidates.find(
        (cc) => cc.yoco_payment_id && cc.yoco_payment_id === y.rawReference && !used.has(cc.id),
      );
      if (c) {
        used.add(c.id);
        matched.push({ yoco: y, app: c, score: 100, reasons: ["yoco_payment_id"] });
        continue;
      }
    }
    remainingYoco.push(y);
  }

  // Phase 2: amount-equal + within 24h. Pick the closest in time.
  const WINDOW_MS = 24 * 3600_000;
  for (const y of remainingYoco) {
    if (!y.occurredAtMs) continue;
    let best: { app: AppCredit; diff: number } | null = null;
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      if (Math.abs(c.amountZar - y.amountZar) > 0.005) continue;
      const diff = Math.abs(c.purchasedAtMs - y.occurredAtMs);
      if (diff > WINDOW_MS) continue;
      if (!best || diff < best.diff) {
        best = { app: c, diff };
      }
    }
    if (best) {
      used.add(best.app.id);
      matched.push({
        yoco: y,
        app: best.app,
        score: Math.max(10, Math.round(100 - (best.diff / WINDOW_MS) * 50)),
        reasons: ["amount", `within ${Math.round(best.diff / 3600_000)}h`],
      });
    }
  }

  // Anything left unmatched on either side.
  const matchedYocoIdx = new Set(matched.map((p) => p.yoco.rawIndex));
  const unmatchedYoco = parsed.filter((y) => !matchedYocoIdx.has(y.rawIndex));
  const unmatchedApp = candidates.filter((c) => !used.has(c.id));

  return { matched, unmatchedYoco, unmatchedApp };
}
