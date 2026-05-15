/** Format ISO timestamp for `<input type="date">` (UTC calendar date). */
export function creditExpiresToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse date input to end-of-day UTC ISO (or null if empty). */
export function dateInputToCreditExpires(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(`${v}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const UNLIMITED_CREDIT_DISPLAY = 999;
