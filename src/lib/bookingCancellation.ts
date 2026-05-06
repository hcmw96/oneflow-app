import { supabase } from "@/lib/supabase";

type CancelBookingParams = {
  bookingId: string;
  cancellationReason: "customer_cancelled" | "admin_cancelled";
  waiveLateFee?: boolean;
};

type CancellationResult = {
  lateCancel: boolean;
  waived: boolean;
  className: string;
  startsAt: string;
};

type BookingCancelRow = {
  id: string;
  status: string;
  profile_id: string;
  class_id: string;
  credit_id: string | null;
  mat_addon: boolean | null;
  towel_addon: boolean | null;
  classes:
    | {
        name: string;
        starts_at: string;
        location: string | null;
        guide_name: string | null;
      }
    | {
        name: string;
        starts_at: string;
        location: string | null;
        guide_name: string | null;
      }[]
    | null;
  profiles:
    | {
        email: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | {
        email: string | null;
        first_name: string | null;
        last_name: string | null;
      }[]
    | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function cancelBookingWithPolicy({
  bookingId,
  cancellationReason,
  waiveLateFee = false,
}: CancelBookingParams): Promise<CancellationResult> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      status,
      profile_id,
      class_id,
      credit_id,
      mat_addon,
      towel_addon,
      classes ( name, starts_at, location, guide_name ),
      profiles ( email, first_name, last_name )
    `,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Booking not found");

  const booking = data as unknown as BookingCancelRow;
  if (booking.status === "cancelled") {
    throw new Error("Booking already cancelled");
  }

  const cls = one(booking.classes);
  if (!cls?.starts_at) throw new Error("Booking class details missing");

  const startsAt = new Date(cls.starts_at);
  const now = new Date();
  const hoursUntil = (startsAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  const lateCancel = hoursUntil <= 2;

  const bookingPatch: Record<string, unknown> = {
    status: "cancelled",
    cancelled_at: now.toISOString(),
    cancellation_reason: cancellationReason,
    late_cancel: lateCancel,
  };

  const { error: updateBookingError } = await supabase
    .from("bookings")
    .update(bookingPatch)
    .eq("id", booking.id);
  if (updateBookingError) throw new Error(updateBookingError.message);

  const { data: classRow, error: classReadError } = await supabase
    .from("classes")
    .select("booked_count")
    .eq("id", booking.class_id)
    .maybeSingle();
  if (classReadError) throw new Error(classReadError.message);

  const currentBooked = Number((classRow as { booked_count?: number } | null)?.booked_count ?? 0);
  const nextBooked = Math.max(0, currentBooked - 1);
  const { error: classUpdateError } = await supabase
    .from("classes")
    .update({ booked_count: nextBooked })
    .eq("id", booking.class_id);
  if (classUpdateError) throw new Error(classUpdateError.message);

  if (booking.credit_id) {
    const { data: credit, error: creditError } = await supabase
      .from("user_credits")
      .select("id, credits_remaining, is_unlimited")
      .eq("id", booking.credit_id)
      .maybeSingle();

    if (creditError) throw new Error(creditError.message);

    const isUnlimited = Boolean((credit as { is_unlimited?: boolean } | null)?.is_unlimited);
    if (credit && !isUnlimited) {
      const currentCredits = Number(
        (credit as { credits_remaining?: number }).credits_remaining ?? 0,
      );
      const { error: refundError } = await supabase
        .from("user_credits")
        .update({ credits_remaining: currentCredits + 1 })
        .eq("id", booking.credit_id);
      if (refundError) throw new Error(refundError.message);
    }
  }

  if (lateCancel && !waiveLateFee) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ late_cancel_fee_pending: true })
      .eq("id", booking.profile_id);
    if (profileError) throw new Error(profileError.message);
  }

  const profile = one(booking.profiles);
  const toEmail = profile?.email?.trim() || "";
  if (toEmail) {
    const dt = new Date(cls.starts_at);
    const date = dt.toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "long",
    });
    const time = dt
      .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
      .toUpperCase();

    await supabase.functions.invoke("send-email", {
      body: {
        to: toEmail,
        template: lateCancel && !waiveLateFee ? "late_cancellation" : "booking_cancellation",
        data: {
          class_name: cls.name,
          date,
          time,
          starts_at: cls.starts_at,
          guide_name: cls.guide_name ?? "Guide",
          location: cls.location ?? "One Flow",
          mat_addon: Boolean(booking.mat_addon),
          towel_addon: Boolean(booking.towel_addon),
        },
      },
    });
  }

  return {
    lateCancel,
    waived: lateCancel && waiveLateFee,
    className: cls.name,
    startsAt: cls.starts_at,
  };
}
