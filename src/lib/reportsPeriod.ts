import {
  civilAddDaysYmd,
  dayBoundsForDateKey,
  STUDIO_TIMEZONE,
  weekSundayDateKey,
  ymdInTimeZone,
} from "@/lib/timezone";

export type PeriodMode = "daily" | "weekly" | "monthly" | "custom";

export type PeriodBounds = {
  /** Inclusive start of period, UTC instant. */
  start: Date;
  /** Inclusive end of period, UTC instant. */
  end: Date;
  /** UTC ISO of start — pass to .gte() on a timestamptz column. */
  startUtcIso: string;
  /** UTC ISO of end — pass to .lte() on a timestamptz column. */
  endUtcIso: string;
  /** JHB calendar date keys covered by the period, oldest to newest. */
  dateKeys: string[];
  /** Human-readable label for the header. */
  label: string;
};

/**
 * JHB-anchored period bounds. Used by every reports query so date filters
 * line up with the studio's calendar day rather than the browser's.
 */
export function jhbPeriodBounds(
  mode: PeriodMode,
  custom?: { fromDateKey?: string; toDateKey?: string },
  anchor: Date = new Date(),
): PeriodBounds {
  const tz = STUDIO_TIMEZONE;
  const anchorKey = ymdInTimeZone(anchor, tz);

  if (mode === "daily") {
    const { startUtcIso, endUtcIso } = dayBoundsForDateKey(anchorKey, tz);
    return {
      start: new Date(startUtcIso),
      end: new Date(endUtcIso),
      startUtcIso,
      endUtcIso,
      dateKeys: [anchorKey],
      label: formatLabel("daily", anchorKey, anchorKey),
    };
  }

  if (mode === "weekly") {
    const sunKey = weekSundayDateKey(anchorKey, tz);
    const satKey = civilAddDaysYmd(sunKey, 6);
    const startUtcIso = dayBoundsForDateKey(sunKey, tz).startUtcIso;
    const endUtcIso = dayBoundsForDateKey(satKey, tz).endUtcIso;
    return {
      start: new Date(startUtcIso),
      end: new Date(endUtcIso),
      startUtcIso,
      endUtcIso,
      dateKeys: enumerateDateKeys(sunKey, satKey),
      label: formatLabel("weekly", sunKey, satKey),
    };
  }

  if (mode === "monthly") {
    const [y, m] = anchorKey.split("-").map(Number);
    const firstKey = `${y}-${String(m).padStart(2, "0")}-01`;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const firstNextKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    const lastKey = civilAddDaysYmd(firstNextKey, -1);
    const startUtcIso = dayBoundsForDateKey(firstKey, tz).startUtcIso;
    const endUtcIso = dayBoundsForDateKey(lastKey, tz).endUtcIso;
    return {
      start: new Date(startUtcIso),
      end: new Date(endUtcIso),
      startUtcIso,
      endUtcIso,
      dateKeys: enumerateDateKeys(firstKey, lastKey),
      label: formatLabel("monthly", firstKey, lastKey),
    };
  }

  // custom
  const from = (custom?.fromDateKey ?? anchorKey).trim();
  const to = (custom?.toDateKey ?? from).trim();
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const startUtcIso = dayBoundsForDateKey(start, tz).startUtcIso;
  const endUtcIso = dayBoundsForDateKey(end, tz).endUtcIso;
  return {
    start: new Date(startUtcIso),
    end: new Date(endUtcIso),
    startUtcIso,
    endUtcIso,
    dateKeys: enumerateDateKeys(start, end),
    label: formatLabel("custom", start, end),
  };
}

function enumerateDateKeys(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let k = fromKey;
  let safety = 0;
  while (k <= toKey && safety < 400) {
    out.push(k);
    k = civilAddDaysYmd(k, 1);
    safety++;
  }
  return out;
}

function formatLabel(mode: PeriodMode, startKey: string, endKey: string): string {
  const tz = STUDIO_TIMEZONE;
  const startNoon = new Date(`${startKey}T12:00:00Z`);
  const endNoon = new Date(`${endKey}T12:00:00Z`);
  if (mode === "daily") {
    return startNoon.toLocaleDateString("en-ZA", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: tz,
    });
  }
  if (mode === "monthly") {
    return startNoon.toLocaleDateString("en-ZA", {
      month: "long",
      year: "numeric",
      timeZone: tz,
    });
  }
  // weekly + custom
  const startStr = startNoon.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
  const endStr = endNoon.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  });
  return `${startStr} – ${endStr}`;
}

/** YYYY-MM-DD key for an instant, in studio TZ. Use to bucket purchases by day. */
export function jhbDateKey(instant: string | Date): string {
  return ymdInTimeZone(typeof instant === "string" ? new Date(instant) : instant, STUDIO_TIMEZONE);
}
