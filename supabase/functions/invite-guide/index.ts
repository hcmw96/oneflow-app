import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_CALLBACK_URL = "https://oneflow1.netlify.app/auth/callback";

const ALLOWED_ROLES = new Set([
  "customer",
  "other",
  "guide",
  "management",
  "director",
  "boh",
  "front_desk",
  "marketing",
  "team",
]);

const ROLE_EMAIL_LABEL: Record<string, string> = {
  customer: "member",
  other: "member",
  guide: "guide",
  management: "team member",
  director: "director",
  boh: "team member",
  front_desk: "team member",
  marketing: "team member",
  team: "team member",
};

const DISCIPLINE_OPTIONS = new Set([
  "Yoga",
  "Sculpt",
  "Wellzone",
  "Sauna Journey",
  "Power",
  "Beginner",
  "Beginner sculpt",
  "Event",
  "Pilates",
]);

function normalizeDisciplines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => {
      const lower = value.toLowerCase();
      if (lower === "sauna_journey") return "Sauna Journey";
      if (lower === "beginner_sculpt" || lower === "beginner sculpt") return "Beginner sculpt";
      return value;
    })
    .filter((value) => DISCIPLINE_OPTIONS.has(value))
    .filter((value, idx, arr) => arr.indexOf(value) === idx);
}

async function sendBrandedInviteEmail(
  supabaseUrl: string,
  serviceKey: string,
  to: string,
  data: Record<string, unknown>,
): Promise<void> {
  const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      template: "user_invite",
      data,
    }),
  });
  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("send-email user_invite failed:", errText);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!secretKeysRaw) {
      return new Response(JSON.stringify({ error: "SUPABASE_SECRET_KEYS is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const secretKeys = JSON.parse(secretKeysRaw) as Record<string, string>;
    const adminApiKey = secretKeys["default"];
    if (!adminApiKey) {
      return new Response(JSON.stringify({ error: "No default key in SUPABASE_SECRET_KEYS" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const callerRole = (callerProfile?.role ?? "").toLowerCase();
    if (callerRole !== "director" && callerRole !== "management") {
      return new Response(JSON.stringify({ error: "Only admins can send invites" }), {
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
    const requestedRole = String(body?.role ?? "guide").trim().toLowerCase();
    const role = ALLOWED_ROLES.has(requestedRole) ? requestedRole : "customer";
    const phone = body?.phone != null ? String(body.phone).trim() : "";
    const date_of_birth = body?.date_of_birth != null ? String(body.date_of_birth).trim() : "";

    if (callerRole !== "director" && (role === "director" || role === "management")) {
      return new Response(
        JSON.stringify({ error: "Only directors can invite management or director roles" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!email || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: "email, first_name, and last_name are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(SUPABASE_URL, adminApiKey);

    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: APP_CALLBACK_URL,
      data: { first_name, last_name, role },
    });
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

    const profilePayload: Record<string, unknown> = {
      id: invitedUser.id,
      email,
      first_name,
      last_name,
      role,
    };
    if (phone) profilePayload.phone = phone;
    if (date_of_birth) profilePayload.date_of_birth = date_of_birth;

    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role === "guide") {
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
    }

    await sendBrandedInviteEmail(SUPABASE_URL, adminApiKey, email, {
      first_name,
      last_name,
      role_label: ROLE_EMAIL_LABEL[role] ?? "member",
      invite_url: APP_CALLBACK_URL,
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: invitedUser.id,
        email,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`.trim(),
        role,
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
