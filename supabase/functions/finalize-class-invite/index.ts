import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  class_invite_id?: string;
  after_payment?: boolean;
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
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const classInviteId = String(body?.class_invite_id ?? "").trim();
    const afterPayment = Boolean(body?.after_payment);
    if (!classInviteId) {
      return new Response(JSON.stringify({ error: "class_invite_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: inv, error: invErr } = await admin
      .from("class_invites")
      .select(
        "id, inviter_id, invitee_id, invitee_email, invitee_name, class_id, paid_by_inviter, status",
      )
      .eq("id", classInviteId)
      .maybeSingle();

    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: "Invite not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((inv as { inviter_id: string }).inviter_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = inv as {
      id: string;
      inviter_id: string;
      invitee_id: string | null;
      invitee_email: string | null;
      invitee_name: string | null;
      class_id: string;
      paid_by_inviter: boolean | null;
      status: string | null;
    };

    if (afterPayment) {
      if (row.status !== "pending_payment") {
        return new Response(
          JSON.stringify({ error: "Invite is not awaiting payment confirmation" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const { error: updErr } = await admin
        .from("class_invites")
        .update({ status: "pending" })
        .eq("id", classInviteId);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      if (row.paid_by_inviter) {
        return new Response(
          JSON.stringify({ error: "Use payment completion for paid invites" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (row.status !== "pending") {
        return new Response(JSON.stringify({ error: "Invalid invite state" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Lookups: inviter + class always; recipient profile + prior-notif only
    // for in-app (invitee_id) invites.
    const lookupPromises: Promise<unknown>[] = [
      admin
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", row.inviter_id)
        .maybeSingle(),
      admin
        .from("classes")
        .select("name, starts_at")
        .eq("id", row.class_id)
        .maybeSingle(),
    ];
    if (row.invitee_id) {
      lookupPromises.push(
        admin
          .from("notifications")
          .select("id")
          .eq("profile_id", row.invitee_id)
          .eq("type", "class_invite")
          .eq("metadata->>class_invite_id", classInviteId)
          .maybeSingle(),
      );
    }
    const lookupResults = await Promise.all(lookupPromises);
    const { data: inviter } = lookupResults[0] as { data: unknown };
    const { data: cls } = lookupResults[1] as { data: unknown };
    const prior = row.invitee_id
      ? ((lookupResults[2] as { data: { id?: string } | null }).data ?? null)
      : null;

    if (prior?.id) {
      return new Response(JSON.stringify({ success: true, skipped: "already_notified" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inviterP = inviter as {
      first_name?: string | null;
      last_name?: string | null;
    } | null;
    const inviterName = [inviterP?.first_name, inviterP?.last_name].filter(Boolean).join(" ").trim() ||
      "A friend";
    const c = cls as { name?: string | null; starts_at?: string | null } | null;
    const className = c?.name ?? "Class";
    const starts = c?.starts_at ? new Date(c.starts_at) : null;
    const whenLine = starts
      ? `${starts.toLocaleDateString("en-ZA", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })} · ${starts.toLocaleTimeString("en-ZA", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).toUpperCase()}`
      : "";

    // Resolve recipient email + (if in-app) push an in-app notification.
    let toEmail = "";
    if (row.invitee_id) {
      const { data: inviteeProf } = await admin
        .from("profiles")
        .select("email, unread_notification_count")
        .eq("id", row.invitee_id)
        .maybeSingle();
      toEmail = (inviteeProf as { email?: string | null } | null)?.email?.trim() ?? "";

      const notifyMeta = {
        class_invite_id: classInviteId,
        class_id: row.class_id,
        inviter_id: row.inviter_id,
      };
      const title = "You've been invited to a class";
      const bodyText = `${inviterName.split(/\s+/)[0] || inviterName} invited you to ${className}.`;

      await admin.from("notifications").insert({
        profile_id: row.invitee_id,
        type: "class_invite",
        title,
        body: bodyText,
        metadata: notifyMeta,
      });

      const unread = Number(
        (inviteeProf as { unread_notification_count?: number } | null)?.unread_notification_count ?? 0,
      );
      await admin
        .from("profiles")
        .update({ unread_notification_count: unread + 1 })
        .eq("id", row.invitee_id);
    } else {
      // Email-only invite (recipient not in app yet).
      toEmail = (row.invitee_email ?? "").trim();
    }

    // Deep-link to the specific class so they land on the right card after login.
    const openUrl = `https://oneflow1.netlify.app/schedule?class=${encodeURIComponent(row.class_id)}`;

    if (toEmail) {
      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: toEmail,
          template: "class_invite",
          data: {
            inviter_name: inviterName,
            class_name: className,
            when_line: whenLine,
            open_url: openUrl,
          },
        }),
      });
      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error("send-email failed:", errText);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
