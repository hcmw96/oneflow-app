import type { SupabaseClient } from "@supabase/supabase-js";

export type QrCheckInRpcResult = {
  ok: boolean;
  code?: string;
  message?: string;
  booking_id?: string;
  profile_id?: string;
  member_name?: string;
  class_starts_at?: string | null;
};

/** Staff QR check-in via DB RPC (bypasses bookings RLS). Falls back to null if RPC is unavailable. */
export async function checkInBookingByQrRpc(
  client: SupabaseClient,
  token: string,
): Promise<{ result: QrCheckInRpcResult | null; rpcError: string | null }> {
  const { data, error } = await client.rpc("check_in_booking_by_qr", { p_token: token });

  if (error) {
    const msg = error.message ?? "";
    if (
      error.code === "PGRST202" ||
      msg.includes("check_in_booking_by_qr") ||
      msg.includes("Could not find the function")
    ) {
      return { result: null, rpcError: null };
    }
    return { result: null, rpcError: msg };
  }

  if (!data || typeof data !== "object") {
    return { result: null, rpcError: "Unexpected check-in response" };
  }

  return { result: data as QrCheckInRpcResult, rpcError: null };
}
