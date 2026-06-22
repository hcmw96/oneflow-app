import type { SupabaseClient } from "@supabase/supabase-js";
import { userCreditCoversClassType } from "@/lib/allowedClassTypes";
import { isPastDateKey, STUDIO_TIMEZONE } from "@/lib/timezone";

export type BookedClassInterval = {
  class_id: string;
  name: string | null;
  starts_at: string;
  ends_at: string;
};

/** True when the two half-open intervals [start, end) overlap. */
export function intervalsOverlap(
  a: { starts_at: string; ends_at: string },
  b: { starts_at: string; ends_at: string },
): boolean {
  const aStart = new Date(a.starts_at).getTime();
  const aEnd = new Date(a.ends_at).getTime();
  const bStart = new Date(b.starts_at).getTime();
  const bEnd = new Date(b.ends_at).getTime();
  if ([aStart, aEnd, bStart, bEnd].some((t) => Number.isNaN(t))) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function findOverlappingBooking(
  target: { starts_at: string; ends_at: string },
  existing: readonly BookedClassInterval[],
  excludeClassId?: string,
): BookedClassInterval | null {
  for (const booking of existing) {
    if (excludeClassId && booking.class_id === excludeClassId) continue;
    if (intervalsOverlap(target, booking)) return booking;
  }
  return null;
}

function oneClassEmbed(raw: unknown): {
  name: string | null;
  starts_at: string;
  ends_at: string;
} | null {
  if (raw == null) return null;
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  if (!row?.starts_at || !row?.ends_at) return null;
  const name = row.name != null ? String(row.name).trim() : "";
  return {
    name: name || null,
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
  };
}

/** Confirmed bookings with class times (future / in-progress only). */
export async function fetchConfirmedBookingIntervals(
  client: SupabaseClient,
  profileId: string,
  nowMs: number = Date.now(),
): Promise<BookedClassInterval[]> {
  const { data, error } = await client
    .from("bookings")
    .select("class_id, classes ( name, starts_at, ends_at )")
    .eq("profile_id", profileId)
    .in("status", ["confirmed", "attended"]);

  if (error) {
    console.error("fetchConfirmedBookingIntervals", error);
    return [];
  }

  const out: BookedClassInterval[] = [];
  for (const row of data ?? []) {
    const classId = (row as { class_id?: string | null }).class_id;
    if (!classId) continue;
    const cls = oneClassEmbed((row as { classes?: unknown }).classes);
    if (!cls) continue;
    if (new Date(cls.ends_at).getTime() <= nowMs) continue;
    out.push({
      class_id: String(classId),
      name: cls.name,
      starts_at: cls.starts_at,
      ends_at: cls.ends_at,
    });
  }
  return out;
}

export function overlapBookingMessage(conflict: BookedClassInterval): string {
  if (conflict.name) {
    return `You’re already booked for ${conflict.name}, which overlaps this class.`;
  }
  return "You already have a booking that overlaps this class time.";
}

/** Minutes after class start before it is treated as past (no new bookings). */
export const CLASS_BOOKING_GRACE_MS = 15 * 60 * 1000;

/** Calendar day before studio “today” (YYYY-MM-DD in studio TZ). */
export function isPastScheduleDay(dayKey: string, timeZone: string = STUDIO_TIMEZONE): boolean {
  return isPastDateKey(dayKey, timeZone);
}

export function isPastScheduleClass(
  startsAt: string | Date,
  nowMs: number = Date.now(),
  graceMs: number = CLASS_BOOKING_GRACE_MS,
): boolean {
  return new Date(startsAt).getTime() <= nowMs - graceMs;
}

const FREE_BEGINNER_CLASS_TYPES = new Set(["beginner", "beginner_sculpt"]);

/** Intro classes booked without credits or payment. */
export function isFreeBeginnerClass(classType: string | null | undefined): boolean {
  return FREE_BEGINNER_CLASS_TYPES.has(String(classType ?? "").toLowerCase());
}

type BookableProductRow = {
  price_zar: number | null;
  allowed_class_types: string[] | null;
  category: string | null;
};

function productCoversClassType(product: BookableProductRow, classType: string): boolean {
  return userCreditCoversClassType({
    category: product.category,
    allowed_class_types: product.allowed_class_types,
    classType,
  });
}

/** True when booking should skip credits/payment (free class, R0 product, or no paid product applies). */
export function classSkipsPayment(
  classType: string | null | undefined,
  catalog: readonly BookableProductRow[],
): boolean {
  if (isFreeBeginnerClass(classType)) return true;
  const ct = String(classType ?? "").trim();
  if (!ct) return false;

  const covering = catalog.filter((p) => productCoversClassType(p, ct));
  if (covering.some((p) => Number(p.price_zar ?? 0) === 0)) return true;
  if (covering.length === 0) return true;
  return false;
}

/** Load active non-addon products used to decide if a class requires payment. */
export async function fetchBookableProductCatalog(
  client: SupabaseClient,
): Promise<BookableProductRow[]> {
  const { data, error } = await client
    .from("products")
    .select("price_zar, allowed_class_types, category")
    .eq("is_active", true)
    .eq("is_addon", false);
  if (error) {
    console.error("fetchBookableProductCatalog", error);
    return [];
  }
  return (data ?? []) as BookableProductRow[];
}
