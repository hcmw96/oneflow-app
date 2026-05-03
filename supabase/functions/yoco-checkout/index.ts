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

  const { pack_id, profile_id, success_url, cancel_url } = await req.json();
  console.log("pack_id:", pack_id, "profile_id:", profile_id);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: pack, error: packError } = await supabase.from("products").select("*").eq("id", pack_id).single();
  console.log("pack result:", JSON.stringify(pack), "error:", JSON.stringify(packError));

  if (!pack) {
    return new Response(JSON.stringify({ error: "Pack not found" }), { status: 404, headers: corsHeaders });
  }

  const priceZar = Number((pack as { price_zar?: number }).price_zar);
  const amountCents = Number.isFinite(priceZar) ? Math.round(priceZar * 100) : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return new Response(JSON.stringify({ error: "Invalid price_zar on product" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      successUrl: success_url,
      cancelUrl: cancel_url,
      failureUrl: cancel_url,
      metadata: { pack_id, profile_id },
    }),
  });

  const checkout = await yocoRes.json();
  console.log("yoco status:", yocoRes.status);
  console.log("yoco body:", JSON.stringify(checkout));
  return new Response(JSON.stringify(checkout), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
