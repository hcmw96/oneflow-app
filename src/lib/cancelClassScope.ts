import { supabase } from "@/lib/supabase";
import {
  dayBoundsForDateKey,
  formatStudioEmailDate,
  formatStudioTime12Upper,
} from "@/lib/timezone";

export type CancelScope = "single" | "range" | "future";

export type CancelTargetClass = {
  id: string;
  starts_at: string;
  recurring_group_id: string | null;
};

export type CancelScopePreview = {
  classIds: string[];
  classCount: number;
  memberCount: number;
};

type CancelRpcResult = {
  classes_cancelled: number;
  bookings_cancelled: number;
  credits_returned: number;
  notifications: {
    to: string;
    class_name: string;
    starts_at: string;
    location: string;
    guide_name: string;
    mat_addon: boolean;
    towel_addon: boolean;
  }[];
};

const TZ = "Africa/Johannesburg";

export async function fetchClassesInCancelScope(args: {
  cls: CancelTargetClass;
  scope: CancelScope;
  rangeFrom: string;
  rangeTo: string;
}): Promise<{ id: string }[]> {
  const { cls, scope, rangeFrom, rangeTo } = args;

  if (scope === "single" || !cls.recurring_group_id) {
    return [{ id: cls.id }];
  }

  let query = supabase
    .from("classes")
    .select("id")
    .eq("recurring_group_id", cls.recurring_group_id)
    .eq("is_cancelled", false);

  if (scope === "future") {
    query = query.gte("starts_at", cls.starts_at);
  } else {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) {
      throw new Error("Pick a start date on or before the end date");
    }
    const from = dayBoundsForDateKey(rangeFrom, TZ).startUtcIso;
    const to = dayBoundsForDateKey(rangeTo, TZ).endUtcIso;
    query = query.gte("starts_at", from).lte("starts_at", to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as { id: string }[];
}

export async function previewCancelScope(args: {
  cls: CancelTargetClass;
  scope: CancelScope;
  rangeFrom: string;
  rangeTo: string;
}): Promise<CancelScopePreview> {
  const classes = await fetchClassesInCancelScope(args);
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) {
    return { classIds: [], classCount: 0, memberCount: 0 };
  }

  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in("class_id", classIds)
    .in("status", ["confirmed", "attended"]);
  if (error) throw error;

  return {
    classIds,
    classCount: classIds.length,
    memberCount: count ?? 0,
  };
}

export async function cancelClassesAndRefund(classIds: string[]): Promise<CancelRpcResult> {
  const { data, error } = await supabase.rpc("cancel_classes_and_refund", {
    p_class_ids: classIds,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<CancelRpcResult>;
  return {
    classes_cancelled: Number(raw.classes_cancelled ?? 0),
    bookings_cancelled: Number(raw.bookings_cancelled ?? 0),
    credits_returned: Number(raw.credits_returned ?? 0),
    notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
  };
}

/** Best-effort; matches `cancelBookingWithPolicy` (booking_cancellation, no late fee). */
export async function notifyCancelledBookings(
  notifications: CancelRpcResult["notifications"],
): Promise<void> {
  for (const n of notifications) {
    try {
      await supabase.functions.invoke("send-email", {
        body: {
          to: n.to,
          template: "booking_cancellation",
          data: {
            class_name: n.class_name,
            date: formatStudioEmailDate(n.starts_at),
            time: formatStudioTime12Upper(n.starts_at),
            starts_at: n.starts_at,
            guide_name: n.guide_name,
            location: n.location,
            mat_addon: n.mat_addon,
            towel_addon: n.towel_addon,
          },
        },
      });
    } catch (e) {
      console.error("cancel-class notification failed", n.to, e);
    }
  }
}
