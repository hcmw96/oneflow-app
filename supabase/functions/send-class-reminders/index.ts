import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_WINDOW_MIN_MS = 55 * 60 * 1000;
const REMINDER_WINDOW_MAX_MS = 65 * 60 * 1000;

type ClassRow = {
  id: string;
  name: string;
  class_type: string | null;
  location: string | null;
  starts_at: string;
  guide_name: string | null;
  is_cancelled: boolean | null;
};

type BookingRow = {
  id: string;
  class_id: string;
  profile_id: string;
  mat_addon: boolean | null;
  towel_addon: boolean | null;
  classes: ClassRow | ClassRow[] | null;
  profiles:
    | { email: string | null; notification_preferences: unknown }
    | { email: string | null; notification_preferences: unknown }[]
    | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function resolveAdminApiKey(): string {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (service) return service;

  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    const secretKeys = JSON.parse(secretKeysRaw) as Record<string, string>;
    if (secretKeys["default"]) return secretKeys["default"];
  }

  throw new Error("No admin API key configured");
}

function classRemindersEnabled(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  return (prefs as { class_reminders?: unknown }).class_reminders !== false;
}

function reminderTemplateForClassType(
  classType: string | null | undefined,
): "class_reminder_sauna" | "class_reminder" {
  const s = String(classType ?? "").toLowerCase();
  if (s.includes("sauna") || s.includes("wellzone")) return "class_reminder_sauna";
  return "class_reminder";
}

function formatEmailDateTime(startsAtIso: string): { date: string; time: string } {
  const start = new Date(startsAtIso);
  return {
    date: start.toLocaleDateString("en-ZA", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    time: start
      .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
      .toUpperCase(),
  };
}

async function sendReminderEmail(
  supabaseUrl: string,
  serviceKey: string,
  to: string,
  template: "class_reminder" | "class_reminder_sauna",
  data: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, template, data }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || `send-email HTTP ${res.status}` };
  }

  const json = (await res.json()) as { error?: unknown };
  if (json?.error) {
    return { ok: false, error: String(json.error) };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    let serviceKey: string;
    try {
      serviceKey = resolveAdminApiKey();
    } catch {
      return new Response(JSON.stringify({ error: "No admin API key configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const nowMs = Date.now();
    const windowStartIso = new Date(nowMs + REMINDER_WINDOW_MIN_MS).toISOString();
    const windowEndIso = new Date(nowMs + REMINDER_WINDOW_MAX_MS).toISOString();

    const { data: classes, error: classErr } = await admin
      .from("classes")
      .select("id, name, class_type, location, starts_at, guide_name, is_cancelled")
      .gte("starts_at", windowStartIso)
      .lt("starts_at", windowEndIso)
      .or("is_cancelled.is.null,is_cancelled.eq.false");

    if (classErr) {
      return new Response(JSON.stringify({ error: classErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classIds = (classes ?? []).map((c) => String((c as ClassRow).id)).filter(Boolean);
    if (classIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classById = new Map<string, ClassRow>();
    for (const raw of classes ?? []) {
      const row = raw as ClassRow;
      classById.set(row.id, row);
    }

    const { data: bookings, error: bookingErr } = await admin
      .from("bookings")
      .select(
        `
        id,
        class_id,
        profile_id,
        mat_addon,
        towel_addon,
        classes ( id, name, class_type, location, starts_at, guide_name, is_cancelled ),
        profiles ( email, notification_preferences )
      `,
      )
      .in("class_id", classIds)
      .eq("status", "confirmed")
      .is("reminder_email_sent_at", null);

    if (bookingErr) {
      return new Response(JSON.stringify({ error: bookingErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let skipped = 0;
    const failures: { booking_id: string; error: string }[] = [];

    for (const raw of bookings ?? []) {
      const row = raw as BookingRow;
      const cls =
        pickOne(row.classes) ??
        (row.class_id ? classById.get(String(row.class_id)) ?? null : null);
      const profile = pickOne(row.profiles);
      const email = (profile?.email ?? "").trim().toLowerCase();

      if (!cls || cls.is_cancelled) {
        skipped += 1;
        continue;
      }
      if (!email) {
        skipped += 1;
        continue;
      }
      if (!classRemindersEnabled(profile?.notification_preferences)) {
        skipped += 1;
        await admin
          .from("bookings")
          .update({ reminder_email_sent_at: new Date().toISOString() })
          .eq("id", row.id)
          .is("reminder_email_sent_at", null);
        continue;
      }

      const { date, time } = formatEmailDateTime(cls.starts_at);
      const template = reminderTemplateForClassType(cls.class_type);
      const mail = await sendReminderEmail(supabaseUrl, serviceKey, email, template, {
        class_name: cls.name,
        date,
        time,
        guide_name: cls.guide_name?.trim() || "Guide",
        location: cls.location?.trim() || "One Flow Studio",
        mat_addon: Boolean(row.mat_addon),
        towel_addon: Boolean(row.towel_addon),
        starts_at: cls.starts_at,
      });

      if (!mail.ok) {
        failures.push({ booking_id: row.id, error: mail.error ?? "send failed" });
        continue;
      }

      const { error: markErr } = await admin
        .from("bookings")
        .update({ reminder_email_sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("reminder_email_sent_at", null);

      if (markErr) {
        failures.push({ booking_id: row.id, error: markErr.message });
        continue;
      }

      sent += 1;
    }

    return new Response(
      JSON.stringify({
        success: failures.length === 0,
        sent,
        skipped,
        failures,
        window_start: windowStartIso,
        window_end: windowEndIso,
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
