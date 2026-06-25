import type { PostgrestError } from "@supabase/supabase-js";
import { isCafeCredit } from "@/lib/cafeCredits";
import { isMatTowelAccessCredit } from "@/lib/matTowelAccess";

export type ClassCreditPickSource = {
  category?: string | null;
  mat_access?: boolean | null;
  towel_access?: boolean | null;
};

/** Credits that can pay for a class booking (not café, mat storage, or towel service). */
export function isBookableClassCredit(row: ClassCreditPickSource): boolean {
  return !isCafeCredit(row) && !isMatTowelAccessCredit(row);
}

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
