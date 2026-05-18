import type { PostgrestError } from "@supabase/supabase-js";

/** Maps DB trigger errors from `deduct_credit_on_booking_insert` to user-facing copy. */
export function bookingCreditInsertErrorMessage(
  error: PostgrestError | null | undefined,
  fallback: string,
): string {
  const msg = (error?.message ?? "").toLowerCase();
  const details = (error?.details ?? "").toLowerCase();
  const combined = `${msg} ${details}`;
  if (combined.includes("insufficient_credits")) {
    return "This pass has no credits left.";
  }
  if (combined.includes("credit_not_found")) {
    return "Could not find your pass — booking was not created.";
  }
  if (combined.includes("booking_profile_required")) {
    return "Could not complete booking — sign in again and try once more.";
  }
  return fallback;
}
