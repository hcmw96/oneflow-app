/**
 * @deprecated Use `invite-guide` with `role: "customer"` (or another allowed role).
 * Kept for backwards compatibility; behaviour matches invite-guide for members.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const body = await req.json();

  const role = body?.role != null ? String(body.role) : "customer";

  const forwardRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-guide`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, role }),
  });

  const text = await forwardRes.text();
  return new Response(text, {
    status: forwardRes.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
