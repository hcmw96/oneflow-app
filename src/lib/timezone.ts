/** Studio venue timezone — class times and operational “today” use this. */
export const STUDIO_TIMEZONE = "Africa/Johannesburg";

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Browser IANA timezone, falling back to studio. */
export function detectUserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidIanaTimeZone(tz)) return tz;
  } catch {
    /* ignore */
  }
  return STUDIO_TIMEZONE;
}

export function ymdInTimeZone(instant: string | Date, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Civil calendar ±days for YYYY-MM-DD strings (Gregorian). */
export function civilAddDaysYmd(ymd: string, deltaDays: number): string {
  const [y, M, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, M - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function partsInTimeZone(instant: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Local wall-clock in `timeZone` → UTC instant (`time` as HH:mm:ss). */
export function zonedLocalToUtc(ymd: string, time: string, timeZone: string): Date {
  const [y, M, d] = ymd.split("-").map(Number);
  const [hh, mm, ss = 0] = time.split(":").map(Number);
  let utcMs = Date.UTC(y, M - 1, d, hh, mm, ss);
  for (let i = 0; i < 4; i++) {
    const p = partsInTimeZone(new Date(utcMs), timeZone);
    const renderedMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const targetMs = Date.UTC(y, M - 1, d, hh, mm, ss);
    utcMs += targetMs - renderedMs;
  }
  return new Date(utcMs);
}

export function dayBoundsInTimeZone(
  timeZone: string,
  anchor: Date = new Date(),
): { startUtcIso: string; endUtcIso: string; dateKey: string } {
  const dateKey = ymdInTimeZone(anchor, timeZone);
  const { startUtcIso, endUtcIso } = dayBoundsForDateKey(dateKey, timeZone);
  return { startUtcIso, endUtcIso, dateKey };
}

export function dayBoundsForDateKey(
  dateKey: string,
  timeZone: string,
): { startUtcIso: string; endUtcIso: string } {
  const startUtc = zonedLocalToUtc(dateKey, "00:00:00", timeZone);
  const nextKey = civilAddDaysYmd(dateKey, 1);
  const endUtc = new Date(zonedLocalToUtc(nextKey, "00:00:00", timeZone).getTime() - 1);
  return { startUtcIso: startUtc.toISOString(), endUtcIso: endUtc.toISOString() };
}

export function todayDateKey(timeZone: string): string {
  return ymdInTimeZone(new Date(), timeZone);
}

export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isPastDateKey(dayKey: string, timeZone: string): boolean {
  return compareDateKeys(dayKey, todayDateKey(timeZone)) < 0;
}

/** 0 = Sunday … 6 = Saturday in the given time zone. */
export function weekdayIndexSundayZero(dateKey: string, timeZone: string): number {
  const noon = zonedLocalToUtc(dateKey, "12:00:00", timeZone);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

export function weekSundayDateKey(dateKey: string, timeZone: string): string {
  const dow = weekdayIndexSundayZero(dateKey, timeZone);
  return civilAddDaysYmd(dateKey, -dow);
}

export function weekDateKeysFromSunday(sundayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => civilAddDaysYmd(sundayKey, i));
}

export function dayOfMonthFromDateKey(dateKey: string): number {
  return Number(dateKey.split("-")[2]) || 1;
}

export function formatTimeInZone(
  iso: string | Date,
  timeZone: string,
  options?: { hour12?: boolean },
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: options?.hour12 ?? false,
    timeZone,
  });
}

export function formatShortDateInZone(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d
    .toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    })
    .replace(/,/g, "")
    .trim();
}

export function formatMonthYearFromDateKey(dateKey: string, timeZone: string): string {
  const noon = zonedLocalToUtc(dateKey, "12:00:00", timeZone);
  return noon.toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone });
}

export function formatLongDayFromDateKey(dateKey: string, timeZone: string): string {
  const noon = zonedLocalToUtc(dateKey, "12:00:00", timeZone);
  return noon.toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

export function formatWeekdayShortFromDateKey(dateKey: string, timeZone: string): string {
  const noon = zonedLocalToUtc(dateKey, "12:00:00", timeZone);
  return noon.toLocaleDateString("en-ZA", { weekday: "short", timeZone }).slice(0, 3);
}

export function timezoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** 12-hour studio time, uppercased (e.g. email subjects). */
export function formatStudioTime12Upper(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d
    .toLocaleTimeString("en-ZA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: STUDIO_TIMEZONE,
    })
    .toUpperCase();
}

/** Studio calendar date without time (locale default shape). */
export function formatStudioDateOnly(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", { timeZone: STUDIO_TIMEZONE });
}

/** e.g. Mon, 22 May 2026 */
export function formatStudioDateShort(
  iso: string | Date,
  options?: { weekday?: "short" | "long"; year?: boolean },
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", {
    weekday: options?.weekday ?? "short",
    day: "numeric",
    month: "short",
    ...(options?.year ? { year: "numeric" } : {}),
    timeZone: STUDIO_TIMEZONE,
  });
}

/** e.g. 22 May 2026 */
export function formatStudioDateNumeric(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: STUDIO_TIMEZONE,
  });
}

/** e.g. Monday, 22 May */
export function formatStudioDateLong(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: STUDIO_TIMEZONE,
  });
}

/** Reminder / booking email date line. */
export function formatStudioEmailDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: STUDIO_TIMEZONE,
  });
}

export function formatStudioDateTime(
  iso: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-ZA", {
    timeZone: STUDIO_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  });
}

/** Class wall time for the member: studio time, plus local label when they differ. */
export function formatClassDateTime(
  iso: string,
  displayTimeZone: string,
  studioTimeZone: string = STUDIO_TIMEZONE,
): { time: string; zoneLabel: string | null } {
  const time = formatTimeInZone(iso, displayTimeZone, { hour12: true });
  if (displayTimeZone === studioTimeZone) {
    return { time, zoneLabel: null };
  }
  const studioTime = formatTimeInZone(iso, studioTimeZone, { hour12: true });
  const abbr = timezoneAbbreviation(studioTimeZone, new Date(iso));
  return {
    time,
    zoneLabel: `${studioTime} ${abbr} at studio`,
  };
}
