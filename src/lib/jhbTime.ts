const TZ = "Africa/Johannesburg";

/** Studio-local calendar day bounds as UTC ISO strings (JHB is UTC+2, no DST). */
export function jhbDayBounds(): { startUtcIso: string; endUtcIso: string; dateKey: string } {
  const now = new Date();
  const jhbNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const y = jhbNow.getFullYear();
  const m = jhbNow.getMonth();
  const d = jhbNow.getDate();
  const startUtc = new Date(Date.UTC(y, m, d, -2, 0, 0, 0));
  const endUtc = new Date(Date.UTC(y, m, d + 1, -2, 0, 0, -1));
  const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { startUtcIso: startUtc.toISOString(), endUtcIso: endUtc.toISOString(), dateKey };
}
