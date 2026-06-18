import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RefundRequest = {
  user_credit_id: string;
  reason?: string;
};

type CreditRow = {
  id: string;
  profile_id: string;
  product_id: string | null;
  yoco_payment_id: string | null;
  refunded_at: string | null;
  products:
    | { price_zar: number | null }
    | { price_zar: number | null }[]
    | null;
};

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const YOCO_SECRET = Deno.env.get("YOCO_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!YOCO_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: "Missing server config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller via the anon client carrying their JWT.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Confirm role via service-role lookup (don't trust client claims).
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();
    if (profErr || !callerProfile) {
      return new Response(JSON.stringify({ error: "Caller profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const role = String((callerProfile as { role?: string }).role ?? "").toLowerCase();
    if (role !== "director" && role !== "management") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RefundRequest;
    const userCreditId = String(body?.user_credit_id ?? "").trim();
    const reason = (body?.reason ?? "").trim() || "admin_refund";
    if (!userCreditId) {
      return new Response(JSON.stringify({ error: "user_credit_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load credit + joined product to know the amount.
    const { data: creditData, error: creditErr } = await admin
      .from("user_credits")
      .select(
        "id, profile_id, product_id, yoco_payment_id, refunded_at, products ( price_zar )",
      )
      .eq("id", userCreditId)
      .maybeSingle();

    if (creditErr || !creditData) {
      return new Response(JSON.stringify({ error: "Credit not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credit = creditData as CreditRow;
    if (credit.refunded_at) {
      return new Response(JSON.stringify({ error: "Already refunded" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!credit.yoco_payment_id) {
      return new Response(
        JSON.stringify({
          error: "No Yoco payment ID on this credit. Use the manual mark-as-refunded path.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const product = pickOne(credit.products);
    const amountZar = Number(product?.price_zar ?? 0);
    if (!Number.isFinite(amountZar) || amountZar <= 0) {
      return new Response(JSON.stringify({ error: "Refund amount unknown for this product" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const amountInCents = Math.round(amountZar * 100);

    // Call Yoco refunds endpoint.
    const idempotencyKey = `refund-${userCreditId}`;
    const yocoRes = await fetch("https://payments.yoco.com/api/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${YOCO_SECRET}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        paymentId: credit.yoco_payment_id,
        amountInCents,
        metadata: {
          user_credit_id: userCreditId,
          refunded_by: caller.id,
          reason,
        },
      }),
    });

    const yocoJson = (await yocoRes.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      message?: string;
      errorMessage?: string;
    };

    if (!yocoRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Yoco refund failed",
          details: yocoJson?.message ?? yocoJson?.errorMessage ?? yocoJson,
        }),
        { status: yocoRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark the credit refunded via the SECURITY DEFINER RPC. We use the
    // caller's client so the RPC's auth.uid() reads as the actual admin.
    const { error: rpcErr } = await callerClient.rpc("mark_user_credit_refunded", {
      p_credit_id: userCreditId,
      p_amount_zar: amountZar,
      p_reason: reason,
      p_refund_yoco_id: yocoJson?.id ?? null,
    });

    if (rpcErr) {
      // Yoco was already debited — surface the error but tell the client
      // the refund did go through at Yoco.
      return new Response(
        JSON.stringify({
          error: "Refund processed at Yoco but DB update failed",
          yoco_refund_id: yocoJson?.id ?? null,
          db_error: rpcErr.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        yoco_refund_id: yocoJson?.id ?? null,
        amount_zar: amountZar,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
