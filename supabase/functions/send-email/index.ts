import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type TemplateName =
  | "booking_confirmation_class"
  | "booking_confirmation_sauna"
  | "booking_cancellation"
  | "late_cancellation"
  | "friend_request"
  | "class_invite"
  | "waiver_reminder"
  | "package_assigned"
  | "marketing"
  | "leave_request"
  | "leave_request_response"
  | "user_invite";

type RequestPayload = {
  to: string;
  template: TemplateName;
  data?: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGO_URL =
  "https://ubseyvrnravzwiqfxacz.supabase.co/storage/v1/object/public/assets/oneflow-logo.png";

function esc(value: unknown): string {
  const s = String(value ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function detailRow(label: string, value: unknown): string {
  return `<p style="font-size:14px;color:#555;padding:4px 0;margin:0;"><span style="font-weight:600;color:#2d2d2d;">${esc(label)}:</span> ${esc(value)}</p>`;
}

function addonPill(text: string): string {
  return `<span style="display:inline-block;background:#a3b693;color:#fff;border-radius:20px;padding:4px 12px;font-size:12px;margin:4px 4px 0 0;">${esc(text)}</span>`;
}

function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      <a href="${esc(href)}" style="display:inline-block;background-color:#a3b693;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

function formatDateTime(value: unknown): { date: string; time: string } {
  const raw = String(value ?? "");
  const dt = raw ? new Date(raw) : new Date();
  return {
    date: dt.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "long" }),
    time: dt
      .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
      .toUpperCase(),
  };
}

function buildTemplate(template: TemplateName, data: Record<string, unknown> = {}) {
  if (template === "friend_request") {
    const fromName = String(data.from_name ?? "Someone");
    const first = String(data.first_name ?? fromName.split(/\s+/)[0] ?? "A member");
    return {
      subject: `${fromName} wants to connect on One Flow`,
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Friend request</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">${esc(first)} has sent you a friend request on One Flow. Open the app to accept.</p>
        ${ctaButton("https://oneflow1.netlify.app/me/friends", "View Request")}
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  if (template === "waiver_reminder") {
    const firstName = String(data.first_name ?? data.name ?? "there");
    return {
      subject: "Action required — please sign your One Flow waiver",
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Please sign your waiver</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi ${esc(firstName)}, we noticed you haven't completed your One Flow studio waiver yet. Please log into the app and complete your profile setup to book classes.</p>
        ${ctaButton("https://oneflow1.netlify.app/onboarding", "Complete waiver")}
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  if (template === "package_assigned") {
    const first = String(data.first_name ?? "there");
    const packageName = String(data.package_name ?? "Your package");
    const creditsLine = String(
      data.credits_description ??
        "Your credits are now available and ready to use.",
    );
    const note = data.note ? String(data.note).trim() : "";
    return {
      subject: "Your One Flow package has been activated",
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Package activated</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi ${esc(first)}, ${esc(packageName)} has been added to your account by the One Flow team. ${esc(creditsLine)}</p>
        ${note ? `<p style="font-size:14px;line-height:1.5;color:#555;margin:16px 0 0;padding:12px 14px;background:#f5f5f0;border-radius:8px;"><span style="font-weight:600;">Note from the team:</span> ${esc(note)}</p>` : ""}
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  if (template === "marketing") {
    const subject = String(data.subject ?? "An update from One Flow");
    const htmlBody = String(data.body_html ?? "");
    return {
      subject,
      content: htmlBody,
    };
  }

  if (template === "leave_request") {
    const requesterName = String(data.requester_name ?? "Staff member");
    const leaveTypeLabel = String(data.leave_type_label ?? "Leave");
    const startDate = String(data.start_date ?? "");
    const endDate = String(data.end_date ?? "");
    const notes = String(data.notes ?? "None");
    const sickNote = String(data.sick_note ?? "Not provided");
    return {
      subject: `Leave Request — ${requesterName} — ${leaveTypeLabel} — ${startDate}`,
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">New leave request</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">${esc(requesterName)} has submitted a leave request:</p>
        <div style="background:#f5f5f0;border-radius:8px;padding:16px 20px;margin:16px 0;">
          ${detailRow("Type", leaveTypeLabel)}
          ${detailRow("Dates", `${startDate} to ${endDate}`)}
          ${detailRow("Notes", notes)}
          ${detailRow("Sick note", sickNote)}
        </div>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Log into the admin dashboard to approve or decline.</p>
        ${ctaButton("https://oneflow1.netlify.app/admin/timesheets?tab=leave-requests", "Review Request")}
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  if (template === "leave_request_response") {
    const first = String(data.staff_first_name ?? "there");
    const typeLabel = String(data.leave_type_label ?? "leave");
    const start = String(data.start_date ?? "");
    const end = String(data.end_date ?? "");
    const outcome = String(data.outcome ?? "updated");
    const reviewer = String(data.reviewer_name ?? "Management");
    const noteRaw = String(data.review_note ?? "").trim();
    const noteBlock = noteRaw
      ? `<p style="font-size:14px;line-height:1.6;color:#444;margin:16px 0 0;padding:12px 14px;background:#f5f5f0;border-radius:8px;"><span style="font-weight:600;">Note:</span> ${esc(noteRaw)}</p>`
      : "";
    return {
      subject: `Your leave request has been ${outcome}`,
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Leave request ${esc(outcome)}</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi ${esc(first)}, your ${esc(typeLabel)} request from ${esc(start)} to ${esc(end)} has been ${esc(outcome)} by ${esc(reviewer)}.</p>
        ${noteBlock}
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  if (template === "user_invite") {
    const first = String(data.first_name ?? "there");
    const roleLabel = String(data.role_label ?? "member");
    const inviteUrl = String(data.invite_url ?? "https://oneflow1.netlify.app/auth");
    return {
      subject: "You're invited to One Flow",
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Welcome to One Flow</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi ${esc(first)}, you've been invited to join One Flow as a ${esc(roleLabel)}.</p>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Check your inbox for a separate email with a secure link to set your password. After that, sign in to complete your profile.</p>
        ${ctaButton(inviteUrl, "Open One Flow")}
        <p style="font-size:14px;line-height:1.6;color:#888;margin:16px 0 0;">If you need help, contact the studio at <a href="mailto:hello@oneflow.co.za" style="color:#a3b693;">hello@oneflow.co.za</a>.</p>
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  if (template === "class_invite") {
    const inviterName = String(data.inviter_name ?? "A friend");
    const className = String(data.class_name ?? "a class");
    const when = String(data.when_line ?? "");
    const openApp = String(data.open_url ?? "https://oneflow1.netlify.app/schedule");
    return {
      subject: `${inviterName} invited you to ${className}`,
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Class invite</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">${esc(inviterName)} invited you to join <strong>${esc(className)}</strong>${when ? ` · ${esc(when)}` : ""}.</p>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Open One Flow to view the invite and respond.</p>
        ${ctaButton(openApp, "View invite")}
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  const className = String(data.class_name ?? "Class");
  const guideName = String(data.guide_name ?? "Guide");
  const location = String(data.location ?? "One Flow Studio");
  const dt = formatDateTime(data.starts_at ?? data.date_time);
  const date = String(data.date ?? dt.date);
  const time = String(data.time ?? dt.time);
  const matAddon = Boolean(data.mat_addon);
  const towelAddon = Boolean(data.towel_addon);

  if (template === "booking_confirmation_sauna") {
    const addons = [towelAddon ? addonPill("🟢 Towel rental booked") : ""].join("");
    return {
      subject: "Booking Confirmed — Sauna Journey",
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Booking Confirmed</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Your Sauna Journey on ${esc(date)} at ${esc(time)} is confirmed.</p>
        <div style="background:#f5f5f0;border-radius:8px;padding:16px 20px;margin:16px 0;">
          ${detailRow("Date", date)}
          ${detailRow("Time", time)}
        </div>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">What to bring: shower towel only. No workout clothes needed.</p>
        ${addons ? `<div style="margin:8px 0 0;">${addons}</div>` : ""}
        <p style="font-size:14px;color:#888;margin:24px 0 0;">See you soon — One Flow Team</p>
      `,
    };
  }

  if (template === "booking_cancellation") {
    return {
      subject: `Booking Cancelled — ${className}`,
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Booking Cancelled</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Your booking for ${esc(className)} on ${esc(date)} at ${esc(time)} has been cancelled. Your credit has been returned to your account.</p>
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  if (template === "late_cancellation") {
    return {
      subject: `Late Cancellation — ${className}`,
      content: `
        <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Late Cancellation</h2>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Your booking for ${esc(className)} on ${esc(date)} at ${esc(time)} has been cancelled. Your credit has been returned, however a R100 late cancellation fee will be charged on your next transaction.</p>
        <div style="background:#fff8f0;border-left:3px solid #e8923a;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;color:#c17a30;margin:16px 0;">Late cancellation fee pending: R100</div>
        <p style="font-size:14px;color:#888;margin:24px 0 0;">One Flow Team</p>
      `,
    };
  }

  const addons = [
    matAddon ? addonPill("🟢 Mat rental booked") : "",
    towelAddon ? addonPill("🟢 Towel rental booked") : "",
  ].join("");
  return {
    subject: `Booking Confirmed — ${className}`,
    content: `
      <h2 style="font-size:22px;font-weight:600;color:#a3b693;margin:0 0 16px;">Booking Confirmed</h2>
      <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Your booking for ${esc(className)} on ${esc(date)} at ${esc(time)} with ${esc(guideName)} is confirmed.</p>
      <div style="background:#f5f5f0;border-radius:8px;padding:16px 20px;margin:16px 0;">
        ${detailRow("Class", className)}
        ${detailRow("Date", date)}
        ${detailRow("Time", time)}
        ${detailRow("Guide", guideName)}
        ${detailRow("Location", location)}
      </div>
      <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">What to bring: yoga mat (if not renting), water bottle, comfortable clothing.</p>
      ${addons ? `<div style="margin:8px 0 0;">${addons}</div>` : ""}
      <p style="font-size:14px;color:#888;margin:24px 0 0;">See you on the mat — One Flow Team</p>
    `,
  };
}

function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#a3b693;padding:32px;text-align:center;">
              <img src="${LOGO_URL}" alt="One Flow" width="140" style="display:block;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;color:#2d2d2d;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background-color:#f5f5f0;text-align:center;border-top:1px solid #e8e8e4;">
              <p style="margin:0 0 8px;font-size:13px;color:#888;">One Flow Wellness Studio · Cape Town</p>
              <p style="margin:0;font-size:12px;color:#aaa;">
                <a href="https://oneflow.co.za" style="color:#a3b693;text-decoration:none;">oneflow.co.za</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestPayload;
    if (!body?.to || !body?.template) {
      return new Response(JSON.stringify({ error: "Missing to or template" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, content } = buildTemplate(body.template, body.data ?? {});
    const html = wrapHtml(content);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "One Flow <noreply@oneflow.co.za>",
        to: [body.to],
        subject,
        html,
      }),
    });

    const resendJson = await resendRes.json();
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: resendJson }), {
        status: resendRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: resendJson?.id ?? null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
