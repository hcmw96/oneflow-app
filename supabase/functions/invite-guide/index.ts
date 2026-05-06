import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCIPLINE_OPTIONS = new Set(["Yoga", "Sculpt", "Pilates", "Wellzone", "Sauna Journey"]);

function normalizeDisciplines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => {
      const lower = value.toLowerCase();
      if (lower === "sauna_journey") return "Sauna Journey";
      return value;
    })
    .filter((value) => DISCIPLINE_OPTIONS.has(value))
    .filter((value, idx, arr) => arr.indexOf(value) === idx);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerErr,
    } = await callerClient.auth.getUser();

    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", callerUser.id)
      .maybeSingle();

    if ((callerProfile?.role ?? "").toLowerCase() !== "director") {
      return new Response(JSON.stringify({ error: "Only directors can invite guides" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();
    const first_name = String(body?.first_name ?? "").trim();
    const last_name = String(body?.last_name ?? "").trim();
    const disciplines = normalizeDisciplines(body?.disciplines);

    if (!email || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: "email, first_name, and last_name are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteErr) {
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const invitedUser = inviteData.user;
    if (!invitedUser) {
      return new Response(JSON.stringify({ error: "Invite did not return a user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profilePayload = {
      id: invitedUser.id,
      email,
      first_name,
      last_name,
      role: "guide",
    };

    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: guideErr } = await admin.from("guides").upsert(
      {
        profile_id: invitedUser.id,
        disciplines,
        is_active: true,
      },
      { onConflict: "profile_id" },
    );

    if (guideErr) {
      return new Response(JSON.stringify({ error: guideErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: invitedUser.id,
        email,
        first_name,
        last_name,
        disciplines,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
