import { STUDIO_TIMEZONE, dayBoundsInTimeZone } from "@/lib/timezone";

export { STUDIO_TIMEZONE };

/** Studio-local calendar day bounds as UTC ISO strings. */
export function jhbDayBounds(): { startUtcIso: string; endUtcIso: string; dateKey: string } {
  return dayBoundsInTimeZone(STUDIO_TIMEZONE);
}
