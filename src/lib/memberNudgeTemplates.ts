import type { SegmentRow } from "@/components/admin/reports/memberNudgeTypes";

export type NudgeKind = "lapsed" | "churned";

export const NUDGE_DEFAULTS: Record<
  NudgeKind,
  { subject: string; body: string; audienceLabel: string }
> = {
  lapsed: {
    audienceLabel: "lapsed members",
    subject: "We miss you at One Flow 🌿",
    body: `Hey [first_name] 🌿 We've missed you at One Flow! Life gets busy, we get it. Your mat is waiting whenever you're ready. Come back this week and reconnect with your practice.

Book a class → https://oneflow1.netlify.app/schedule`,
  },
  churned: {
    audienceLabel: "churned members",
    subject: "Come back to One Flow 🙏",
    body: `Hey [first_name] — it's been a while since we've seen you at One Flow. We'd love to welcome you back. Reply to this email and we'll sort you out.

See you on the mat 🙏`,
  },
};

export function firstNameFromSegment(row: SegmentRow): string {
  const fromEmail = row.email.split("@")[0]?.trim();
  const chunk = row.name.trim().split(/\s+/)[0];
  return chunk || fromEmail || "there";
}

export function applyNudgeTemplate(template: string, row: SegmentRow): string {
  return template.replaceAll("[first_name]", firstNameFromSegment(row));
}
