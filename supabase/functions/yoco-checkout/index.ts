import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const YOCO_SECRET = Deno.env.get("YOCO_SECRET_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const raw = await req.json();
  console.log("yoco-checkout body keys:", raw && typeof raw === "object" ? Object.keys(raw) : raw);

  if (raw?.type === "class_invite") {
    const class_invite_id = String(raw.class_invite_id ?? "");
    const inviter_profile_id = String(raw.inviter_profile_id ?? "");
    const success_url = String(raw.success_url ?? "");
    const cancel_url = String(raw.cancel_url ?? "");
    const amount_zar = Number(raw.amount_zar);

    if (!class_invite_id || !inviter_profile_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: "class_invite_id, inviter_profile_id, success_url, cancel_url required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: inv, error: invErr } = await supabase
      .from("class_invites")
      .select("id, inviter_id, status, paid_by_inviter")
      .eq("id", class_invite_id)
      .maybeSingle();

    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: "Invite not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const invRow = inv as {
      inviter_id: string;
      status: string | null;
      paid_by_inviter: boolean | null;
    };
    if (invRow.inviter_id !== inviter_profile_id || invRow.status !== "pending_payment") {
      return new Response(JSON.stringify({ error: "Invalid invite for checkout" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!invRow.paid_by_inviter) {
      return new Response(JSON.stringify({ error: "Invite is not pay-for-friend" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const defaultZar = Number(Deno.env.get("CLASS_INVITE_AMOUNT_ZAR") ?? "180");
    const zar = Number.isFinite(amount_zar) && amount_zar > 0 ? amount_zar : defaultZar;
    const amountCents = Math.round(zar * 100);

    const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${YOCO_SECRET}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "ZAR",
        description: "One Flow — class invite (pay for friend)",
        successUrl: success_url,
        cancelUrl: cancel_url,
        failureUrl: cancel_url,
        metadata: {
          type: "class_invite",
          class_invite_id,
          inviter_profile_id,
        },
      }),
    });

    const checkout = await yocoRes.json();
    console.log("yoco class_invite status:", yocoRes.status);
    console.log("yoco class_invite body:", JSON.stringify(checkout));
    return new Response(JSON.stringify(checkout), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { pack_id, profile_id, success_url, cancel_url } = raw;
  console.log("pack_id:", pack_id, "profile_id:", profile_id);

  const authHeader = req.headers.get("Authorization") ?? "";
  let authedUserId: string | null = null;
  if (authHeader.startsWith("Bearer ") && SUPABASE_ANON_KEY) {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await authClient.auth.getUser();
    authedUserId = authData.user?.id ?? null;
  }

  const flowPointsUsedRaw = Number(raw?.flow_points_used ?? 0);
  const flowPointsUsed = Number.isFinite(flowPointsUsedRaw)
    ? Math.max(0, Math.floor(flowPointsUsedRaw))
    : 0;
  const flowPointsDiscountZar = Number(raw?.flow_points_discount_zar ?? 0);

  if (flowPointsUsed > 0) {
    if (!authedUserId || authedUserId !== String(profile_id)) {
      return new Response(
        JSON.stringify({ error: "Sign in to redeem Flow Points on your own account." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const { data: pack, error: packError } = await supabase
    .from("products")
    .select("*")
    .eq("id", pack_id)
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .single();
  console.log("pack result:", JSON.stringify(pack), "error:", JSON.stringify(packError));

  if (!pack) {
    return new Response(JSON.stringify({ error: "Pack not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  const priceZar = Number((pack as { price_zar?: number }).price_zar);
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, late_cancel_fee_pending, flow_points")
    .eq("id", profile_id)
    .maybeSingle();
  const buyerName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Member";
  const hasLateCancelFee = Boolean(
    (profile as { late_cancel_fee_pending?: boolean } | null)?.late_cancel_fee_pending,
  );
  const baseAmountCents = Number.isFinite(priceZar) ? Math.round(priceZar * 100) : NaN;

  let promoDiscountCents = 0;
  let promoApplied: { id: string; code: string } | null = null;
  const rawPromoCode = String(raw?.promo_code ?? "").trim().toUpperCase();
  if (rawPromoCode) {
    const { data: promo } = await supabase
      .from("promotions")
      .select(
        "id, code, discount_type, discount_value, applies_to, max_uses, uses_count, valid_from, valid_until, is_active",
      )
      .eq("code", rawPromoCode)
      .maybeSingle();
    const p = promo as
      | {
          id: string;
          code: string;
          discount_type: string;
          discount_value: number;
          applies_to: string;
          max_uses: number | null;
          uses_count: number | null;
          valid_from: string | null;
          valid_until: string | null;
          is_active: boolean;
        }
      | null;
    if (p && p.is_active) {
      const now = Date.now();
      const validFrom = p.valid_from ? new Date(p.valid_from).getTime() : null;
      const validUntil = p.valid_until ? new Date(p.valid_until).getTime() : null;
      const inWindow =
        (validFrom == null || now >= validFrom) && (validUntil == null || now <= validUntil);
      const usesOk = p.max_uses == null || (p.uses_count ?? 0) < p.max_uses;
      const packCategory = String((pack as { category?: string }).category ?? "");
      const appliesOk =
        p.applies_to === "all" ||
        (p.applies_to === "yoga" && packCategory === "yoga") ||
        (p.applies_to === "wellzone" && packCategory === "wellzone");
      if (inWindow && usesOk && appliesOk && Number.isFinite(baseAmountCents)) {
        if (p.discount_type === "percentage") {
          promoDiscountCents = Math.min(
            baseAmountCents,
            Math.round((baseAmountCents * Number(p.discount_value)) / 100),
          );
        } else {
          promoDiscountCents = Math.min(
            baseAmountCents,
            Math.round(Number(p.discount_value) * 100),
          );
        }
        promoApplied = { id: p.id, code: p.code };
      }
    }
  }

  const afterPromoCents = Number.isFinite(baseAmountCents)
    ? Math.max(0, baseAmountCents - promoDiscountCents)
    : NaN;

  let flowDiscountCents = 0;
  if (flowPointsUsed > 0 && Number.isFinite(afterPromoCents)) {
    const { data: rateRow } = await supabase
      .from("studio_settings")
      .select("value")
      .eq("key", "flow_points_conversion_rate")
      .maybeSingle();
    const rateRaw = Number((rateRow as { value?: string } | null)?.value);
    const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : 10;

    const balance = Math.max(
      0,
      Math.floor(Number((profile as { flow_points?: number } | null)?.flow_points ?? 0)),
    );
    if (flowPointsUsed > balance) {
      return new Response(JSON.stringify({ error: "Not enough Flow Points for this checkout." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedDiscountCents = Math.round(flowPointsUsed * rate);
    const clientDiscountCents = Math.round(flowPointsDiscountZar * 100);
    if (Math.abs(expectedDiscountCents - clientDiscountCents) > 2) {
      return new Response(JSON.stringify({ error: "Flow Points discount does not match the conversion rate." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    flowDiscountCents = Math.min(expectedDiscountCents, afterPromoCents);
    if (flowDiscountCents <= 0) {
      return new Response(
        JSON.stringify({ error: "Flow Points cannot be applied to this checkout amount." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const packPayableCents = Number.isFinite(afterPromoCents)
    ? Math.max(100, afterPromoCents - flowDiscountCents)
    : NaN;
  const amountCents = Number.isFinite(packPayableCents)
    ? packPayableCents + (hasLateCancelFee ? 10000 : 0)
    : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return new Response(JSON.stringify({ error: "Invalid price_zar on product" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (promoApplied) {
    const { data: cur } = await supabase
      .from("promotions")
      .select("uses_count")
      .eq("id", promoApplied.id)
      .maybeSingle();
    const next = (Number((cur as { uses_count?: number } | null)?.uses_count ?? 0) || 0) + 1;
    await supabase.from("promotions").update({ uses_count: next }).eq("id", promoApplied.id);
  }

  const packName = String((pack as { name?: string }).name ?? "One Flow purchase");
  const packLinePriceCents = Number.isFinite(packPayableCents)
    ? packPayableCents
    : Math.round(priceZar * 100);
  const lineItems: Array<{
    displayName: string;
    quantity: number;
    pricingDetails: { price: number };
  }> = [
    {
      displayName: `${packName} — ${buyerName}`,
      quantity: 1,
      pricingDetails: { price: packLinePriceCents },
    },
  ];
  if (hasLateCancelFee) {
    lineItems.push({
      displayName: "Late cancellation fee",
      quantity: 1,
      pricingDetails: { price: 10000 },
    });
  }

  const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${YOCO_SECRET}`,
    },
    body: JSON.stringify({
      amount: amountCents,
      currency: "ZAR",
      lineItems,
      description: hasLateCancelFee
        ? `${packName} — ${buyerName} + R100 late cancellation fee`
        : `${packName} — ${buyerName}`,
      successUrl: success_url,
      cancelUrl: cancel_url,
      failureUrl: cancel_url,
      metadata: {
        pack_id,
        profile_id,
        buyer_name: buyerName,
        late_cancel_fee_applied: hasLateCancelFee,
        description: hasLateCancelFee ? "+ R100 late cancellation fee" : "",
        promo_code_applied: promoApplied?.code ?? null,
        promo_discount_zar: promoDiscountCents > 0 ? Math.round(promoDiscountCents / 100) : 0,
        flow_points_used: flowPointsUsed > 0 ? flowPointsUsed : 0,
        flow_points_discount_zar:
          flowDiscountCents > 0 ? Math.round((flowDiscountCents / 100) * 100) / 100 : 0,
      },
    }),
  });

  const checkout = await yocoRes.json();
  console.log("yoco status:", yocoRes.status);
  console.log("yoco body:", JSON.stringify(checkout));
  return new Response(JSON.stringify(checkout), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
