import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHECK_IN_STAFF_ROLES = new Set([
  "director",
  "management",
  "front_desk",
  "guide",
  "boh",
]);

const MAY_START = "2026-05-01";
const MAY_END = "2026-05-31";

type DebugStep = Record<string, unknown>;

function adminApiKey(): string {
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    const secretKeys = JSON.parse(secretKeysRaw) as Record<string, string>;
    if (secretKeys["default"]) return secretKeys["default"];
  }
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (service) return service;
  throw new Error("No admin API key configured");
}

function classDateFromStartsAtIso(startsAtIso: string): string {
  return new Date(startsAtIso).toISOString().split("T")[0] ?? "";
}

function isMay2026ClassDate(dateStr: string): boolean {
  return dateStr >= MAY_START && dateStr <= MAY_END;
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const getByEmail = (
    admin.auth.admin as { getUserByEmail?: (e: string) => Promise<{ data: { user: { id: string } | null } }> }
  ).getUserByEmail;
  if (getByEmail) {
    try {
      const { data } = await getByEmail.call(admin.auth.admin, email);
      if (data?.user?.id) return data.user.id;
    } catch {
      // fall through to listUsers
    }
  }

  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email);
    if (hit?.id) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const debug: Record<string, DebugStep> = {};

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerErr,
    } = await caller.auth.getUser();

    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized", debug }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await caller
      .from("profiles")
      .select("role")
      .eq("id", callerUser.id)
      .maybeSingle();

    const callerRole = String(callerProfile?.role ?? "").toLowerCase();
    if (!CHECK_IN_STAFF_ROLES.has(callerRole)) {
      return new Response(JSON.stringify({ ok: false, error: "You do not have permission to check in walk-ins", debug }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const first_name = String(body?.first_name ?? "").trim();
    const last_name = String(body?.last_name ?? "").trim();
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();
    const class_id = String(body?.class_id ?? "").trim();

    if (!first_name || !last_name || !email || !class_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "first_name, last_name, email, and class_id are required", debug }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(SUPABASE_URL, adminApiKey());
    const waiverAt = new Date().toISOString();

    const { data: existingProfile, error: lookupErr } = await admin
      .from("profiles")
      .select("id, role, waiver_accepted_at")
      .ilike("email", email)
      .maybeSingle();

    debug.profile_lookup = { existingProfile, lookupErr };
    console.log("[walk-in-checkin] after profile lookup by email", debug.profile_lookup);

    if (lookupErr) {
      return new Response(JSON.stringify({ ok: false, error: lookupErr.message, debug }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let profileId = existingProfile?.id as string | undefined;
    let createdProfile = false;
    const role = String(existingProfile?.role ?? "customer");

    if (!profileId) {
      const { data: createData, error: createUserErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name, last_name, role: "customer" },
      });

      if (createUserErr) {
        const msg = createUserErr.message.toLowerCase();
        const alreadyRegistered =
          msg.includes("already") || msg.includes("registered") || msg.includes("exists");

        if (!alreadyRegistered) {
          debug.profile_create = { createUserErr };
          console.error("[walk-in-checkin] profile create failed", createUserErr);
          return new Response(JSON.stringify({ ok: false, error: createUserErr.message, debug }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const authUserId = await findAuthUserIdByEmail(admin, email);
        if (!authUserId) {
          debug.profile_create = { createUserErr, note: "auth user not found after duplicate email error" };
          return new Response(JSON.stringify({ ok: false, error: createUserErr.message, debug }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        profileId = authUserId;
      } else {
        profileId = createData.user?.id;
        if (!profileId) {
          return new Response(JSON.stringify({ ok: false, error: "Auth user was not created", debug }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error: upsertErr } = await admin.from("profiles").upsert(
        {
          id: profileId,
          email,
          first_name,
          last_name,
          role: "customer",
          waiver_accepted_at: waiverAt,
        },
        { onConflict: "id" },
      );

      debug.profile_create = { profileId, upsertErr, createdAuthUser: !createUserErr };
      console.log("[walk-in-checkin] after profile creation", debug.profile_create);

      if (upsertErr) {
        console.error("[walk-in-checkin] profile upsert failed", upsertErr);
        return new Response(JSON.stringify({ ok: false, error: upsertErr.message, debug }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      createdProfile = true;
    } else if (!existingProfile?.waiver_accepted_at) {
      const { error: waiverErr } = await admin
        .from("profiles")
        .update({ waiver_accepted_at: waiverAt })
        .eq("id", profileId);

      debug.waiver_update = { profileId, waiverErr };
      console.log("[walk-in-checkin] after waiver update", debug.waiver_update);

      if (waiverErr) {
        console.error("[walk-in-checkin] waiver update failed", waiverErr);
        return new Response(JSON.stringify({ ok: false, error: waiverErr.message, debug }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: classRow, error: classErr } = await admin
      .from("classes")
      .select("id, starts_at")
      .eq("id", class_id)
      .maybeSingle();

    if (classErr || !classRow?.starts_at) {
      return new Response(JSON.stringify({ ok: false, error: classErr?.message ?? "Class not found", debug }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const checkedAt = new Date().toISOString();
    const qrToken = crypto.randomUUID();

    const { data: existingBooking, error: existingBookErr } = await admin
      .from("bookings")
      .select("id, status")
      .eq("profile_id", profileId)
      .eq("class_id", class_id)
      .neq("status", "cancelled")
      .maybeSingle();

    if (existingBookErr) {
      return new Response(JSON.stringify({ ok: false, error: existingBookErr.message, debug }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let bookingId: string;

    if (existingBooking?.id) {
      const { data: updated, error: updateErr } = await admin
        .from("bookings")
        .update({
          status: "attended",
          checked_in: true,
          checked_in_at: checkedAt,
        })
        .eq("id", existingBooking.id)
        .select("id")
        .single();

      debug.booking_insert = { mode: "update_existing", existingBooking, updated, updateErr };
      console.log("[walk-in-checkin] after booking insert", debug.booking_insert);

      if (updateErr || !updated?.id) {
        console.error("[walk-in-checkin] booking update failed", updateErr);
        return new Response(JSON.stringify({ ok: false, error: updateErr?.message ?? "Could not update booking", debug }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      bookingId = updated.id as string;
    } else {
      const { data: inserted, error: bookErr } = await admin
        .from("bookings")
        .insert({
          profile_id: profileId,
          class_id,
          status: "attended",
          payment_method: "drop_in",
          qr_token: qrToken,
          checked_in: true,
          checked_in_at: checkedAt,
        })
        .select("id")
        .single();

      debug.booking_insert = { mode: "insert", inserted, bookErr };
      console.log("[walk-in-checkin] after booking insert", debug.booking_insert);

      if (bookErr || !inserted?.id) {
        console.error("[walk-in-checkin] booking insert failed", bookErr);
        return new Response(JSON.stringify({ ok: false, error: bookErr?.message ?? "Could not create booking", debug }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      bookingId = inserted.id as string;
    }

    const classDate = classDateFromStartsAtIso(classRow.starts_at as string);
    if (classDate && isMay2026ClassDate(classDate)) {
      const { error: challengeErr } = await admin.from("challenge_checkins").upsert(
        {
          profile_id: profileId,
          class_date: classDate,
          booking_id: bookingId,
        },
        { onConflict: "booking_id" },
      );

      debug.challenge_checkin = { classDate, challengeErr };
      console.log("[walk-in-checkin] after challenge_checkins insert", debug.challenge_checkin);

      if (challengeErr) {
        console.error("[walk-in-checkin] challenge_checkins upsert failed", challengeErr);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        profile_id: profileId,
        booking_id: bookingId,
        role,
        created_profile: createdProfile,
        debug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[walk-in-checkin] error", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message, debug }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
