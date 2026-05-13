import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerErr,
    } = await caller.auth.getUser();
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await caller
      .from("profiles")
      .select("role")
      .eq("id", callerUser.id)
      .maybeSingle();
    const r = String((callerProfile as { role?: string } | null)?.role ?? "").toLowerCase();
    if (r !== "director" && r !== "management") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      profile_id?: string;
      action?: string;
    };
    const profileId = String(body.profile_id ?? "").trim();
    if (!profileId) {
      return new Response(JSON.stringify({ error: "profile_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.action === "status") {
      const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profileId);
      if (authErr || !authUser?.user) {
        return new Response(
          JSON.stringify({ verified: false, unknown: true }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const verified = Boolean(authUser.user.email_confirmed_at);
      return new Response(JSON.stringify({ verified, unknown: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prof, error: pErr } = await admin
      .from("profiles")
      .select("email")
      .eq("id", profileId)
      .maybeSingle();
    if (pErr || !prof?.email) {
      return new Response(JSON.stringify({ error: "Profile or email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = String((prof as { email: string }).email).trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ error: "No email on profile" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profileId);
    if (authErr || !authUser?.user) {
      return new Response(
        JSON.stringify({
          error: authErr?.message ?? "No auth user for this profile — they may use a different login.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (authUser.user.email_confirmed_at) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, message: "Email already verified" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ type: "signup", email }),
    });

    const resText = await res.text();
    if (!res.ok) {
      console.error("auth resend failed", res.status, resText);
      return new Response(
        JSON.stringify({
          error: `Auth resend failed (${res.status}): ${resText.slice(0, 500)}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, message: "Verification email queued" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
