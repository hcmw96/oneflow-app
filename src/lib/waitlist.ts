import { supabase } from "@/lib/supabase";
import {
  bookingConfirmationEmailData,
  bookingConfirmationTemplateForClassType,
} from "@/lib/bookingConfirmationEmail";

export type WaitlistPaymentMethod = "free" | "credit" | "flow_points";

export type WaitlistEntry = {
  id: string;
  classId: string;
  status: "waiting" | "promoted" | "cancelled";
  joinedAt: string;
  paymentMethod: WaitlistPaymentMethod | null;
  creditId: string | null;
  flowPointsPledged: number | null;
  promotedBookingId: string | null;
};

export type WaitlistEntryWithClass = WaitlistEntry & {
  className: string;
  classType: string;
  location: string;
  startsAt: string;
  guideName: string | null;
  position: number;
};

type RawEntry = {
  id: string;
  class_id: string;
  status: string;
  joined_at: string;
  payment_method: string | null;
  credit_id: string | null;
  flow_points_pledged: number | null;
  promoted_booking_id: string | null;
};

type ClassJoin = {
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  guide_name: string | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function joinWaitlist(args: {
  classId: string;
  profileId: string;
  paymentMethod: WaitlistPaymentMethod;
  creditId?: string | null;
  flowPointsPledged?: number;
}): Promise<WaitlistEntry> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .insert({
      class_id: args.classId,
      profile_id: args.profileId,
      payment_method: args.paymentMethod,
      credit_id: args.paymentMethod === "credit" ? (args.creditId ?? null) : null,
      flow_points_pledged:
        args.paymentMethod === "flow_points" ? (args.flowPointsPledged ?? 100) : null,
      status: "waiting",
    })
    .select("id, class_id, status, joined_at, payment_method, credit_id, flow_points_pledged, promoted_booking_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not join waitlist");

  const raw = data as RawEntry;
  return {
    id: raw.id,
    classId: raw.class_id,
    status: raw.status as WaitlistEntry["status"],
    joinedAt: raw.joined_at,
    paymentMethod: raw.payment_method as WaitlistPaymentMethod | null,
    creditId: raw.credit_id,
    flowPointsPledged: raw.flow_points_pledged,
    promotedBookingId: raw.promoted_booking_id,
  };
}

export async function leaveWaitlist(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("waitlist_entries")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "user_left",
    })
    .eq("id", entryId);
  if (error) throw new Error(error.message);
}

export async function fetchMyActiveWaitlistEntries(
  profileId: string,
): Promise<WaitlistEntryWithClass[]> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(
      `id, class_id, status, joined_at, payment_method, credit_id, flow_points_pledged, promoted_booking_id,
       classes ( name, class_type, location, starts_at, guide_name )`,
    )
    .eq("profile_id", profileId)
    .eq("status", "waiting")
    .order("joined_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<RawEntry & { classes: ClassJoin | ClassJoin[] | null }>;

  // Compute positions in parallel.
  const positions = await Promise.all(
    rows.map((row) => fetchWaitlistPosition({ entryId: row.id, classId: row.class_id })),
  );

  return rows.map((raw, i) => {
    const cls = pickOne(raw.classes);
    return {
      id: raw.id,
      classId: raw.class_id,
      status: raw.status as WaitlistEntry["status"],
      joinedAt: raw.joined_at,
      paymentMethod: raw.payment_method as WaitlistPaymentMethod | null,
      creditId: raw.credit_id,
      flowPointsPledged: raw.flow_points_pledged,
      promotedBookingId: raw.promoted_booking_id,
      className: cls?.name ?? "Class",
      classType: cls?.class_type ?? "",
      location: cls?.location ?? "",
      startsAt: cls?.starts_at ?? new Date().toISOString(),
      guideName: cls?.guide_name ?? null,
      position: positions[i] ?? 0,
    };
  });
}

export async function fetchMyWaitlistEntryForClass(
  classId: string,
  profileId: string,
): Promise<WaitlistEntry | null> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(
      "id, class_id, status, joined_at, payment_method, credit_id, flow_points_pledged, promoted_booking_id",
    )
    .eq("class_id", classId)
    .eq("profile_id", profileId)
    .eq("status", "waiting")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = data as RawEntry;
  return {
    id: raw.id,
    classId: raw.class_id,
    status: raw.status as WaitlistEntry["status"],
    joinedAt: raw.joined_at,
    paymentMethod: raw.payment_method as WaitlistPaymentMethod | null,
    creditId: raw.credit_id,
    flowPointsPledged: raw.flow_points_pledged,
    promotedBookingId: raw.promoted_booking_id,
  };
}

/** 1-based position in the waiting queue for this class. Returns 0 if not waiting. */
async function fetchWaitlistPosition(args: {
  entryId: string;
  classId: string;
}): Promise<number> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("id, joined_at")
    .eq("class_id", args.classId)
    .eq("status", "waiting")
    .order("joined_at", { ascending: true });
  if (error) return 0;
  const rows = (data ?? []) as Array<{ id: string }>;
  const idx = rows.findIndex((r) => r.id === args.entryId);
  return idx < 0 ? 0 : idx + 1;
}

type PromotionResult = {
  bookingId: string;
  profileId: string;
  paymentMethod: string;
};

/**
 * Auto-promote the next eligible waiter when a spot opens.
 * Returns the promotion result or null when no one was promoted.
 */
export async function promoteNextWaitlistEntry(classId: string): Promise<PromotionResult | null> {
  const { data, error } = await supabase.rpc("promote_next_waitlist_entry", {
    p_class_id: classId,
  });
  if (error) {
    console.error("promote_next_waitlist_entry", error);
    return null;
  }
  const rows = (data ?? []) as Array<{
    promoted_booking_id: string;
    promoted_profile_id: string;
    payment_method: string;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    bookingId: row.promoted_booking_id,
    profileId: row.promoted_profile_id,
    paymentMethod: row.payment_method,
  };
}

/** Look up the promoted booking + class + member email and send the email. */
export async function sendWaitlistPromotionEmail(promotedBookingId: string): Promise<void> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `id, mat_addon, towel_addon,
       classes ( name, class_type, location, starts_at, guide_name ),
       profiles ( email )`,
    )
    .eq("id", promotedBookingId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("waitlist email lookup", error);
    return;
  }

  const row = data as unknown as {
    mat_addon: boolean | null;
    towel_addon: boolean | null;
    classes: ClassJoin | ClassJoin[] | null;
    profiles: { email: string | null } | { email: string | null }[] | null;
  };

  const cls = pickOne(row.classes);
  const prof = pickOne(row.profiles);
  const toEmail = (prof?.email ?? "").trim();
  if (!toEmail || !cls) return;

  await supabase.functions.invoke("send-email", {
    body: {
      to: toEmail,
      // Reuse the booking confirmation template; payload shape matches.
      // Switch to a dedicated `waitlist_promoted` SendGrid template later for
      // clearer copy ("good news — a spot opened up").
      template: bookingConfirmationTemplateForClassType(cls.class_type),
      data: bookingConfirmationEmailData({
        className: cls.name,
        startsAtIso: cls.starts_at,
        guideName: cls.guide_name,
        location: cls.location,
        matAddon: Boolean(row.mat_addon),
        towelAddon: Boolean(row.towel_addon),
      }),
    },
  });
}
