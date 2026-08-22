/**
 * Yoco Sales History note (`metadata.billNote`).
 *
 * Yoco does not copy `lineItems` into Sales History; only this string replaces the
 * checkout UUID in the Notes column.
 *
 * There is no short human booking-reference column. Callers pass a UUID (`bookings.id`
 * when it exists; otherwise the class / product / invite id) and we use the first 8 chars.
 */

export const BILL_NOTE_MAX_LENGTH = 120;

export type BillNoteInput = {
  id: string;
  kind: "class" | "package";
  classTitle?: string | null;
  startsAt?: string | Date | null;
  packageName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export function shortRef(id: string | null | undefined): string {
  const raw = String(id ?? "").trim();
  if (!raw) return "unknown";
  return raw.slice(0, 8);
}

/** First initial + surname. Empty names become "Member". */
export function memberShortName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first && last) return `${first.charAt(0).toUpperCase()} ${last}`;
  if (last) return last;
  if (first) return first.charAt(0).toUpperCase();
  return "Member";
}

/** Class start as HH:mm in Africa/Johannesburg (24h). */
export function startTimeHHmm(startsAt: string | Date): string {
  const dt = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(dt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const hh = hour === "24" ? "00" : hour.padStart(2, "0");
  return `${hh}:${minute.padStart(2, "0")}`;
}

/**
 * Two-level title from the `class_types` / `class_categories` lookup.
 * Does not read `allowedClassTypes.ts`.
 */
export function classTitleFromLookup(args: {
  titleOverride?: string | null;
  storedName?: string | null;
  categoryName?: string | null;
  typeName?: string | null;
}): string {
  const override = args.titleOverride?.trim();
  if (override) return override;
  const category = args.categoryName?.trim() ?? "";
  const type = args.typeName?.trim() ?? "";
  if (category && type && category !== type) return `${category}: ${type}`;
  if (type) return type;
  if (category) return category;
  return args.storedName?.trim() || "Class";
}

export function truncateBillNote(value: string, max = BILL_NOTE_MAX_LENGTH): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").replace(/[ \t]+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const head = cleaned.slice(0, max);
  const lastSpace = head.lastIndexOf(" ");
  if (lastSpace > 0) return head.slice(0, lastSpace);
  return head;
}

export function buildBillNote(booking: BillNoteInput): string {
  const ref = shortRef(booking.id);
  const member = memberShortName(booking.firstName, booking.lastName);

  let body: string;
  if (booking.kind === "package") {
    const packageName = booking.packageName?.trim() || "Package";
    body = `${ref} | ${packageName} | ${member}`;
  } else {
    const title = booking.classTitle?.trim() || "Class";
    const time =
      booking.startsAt != null && booking.startsAt !== ""
        ? startTimeHHmm(booking.startsAt)
        : "";
    const titleAndTime = time ? `${title} ${time}` : title;
    body = `${ref} | ${titleAndTime} | ${member}`;
  }

  return truncateBillNote(body);
}
