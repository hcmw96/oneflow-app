export type EmailCampaignTemplate = {
  id: string;
  label: string;
  subject: string;
  bodyHtml: string;
};

export const EMAIL_CAMPAIGN_TEMPLATES: EmailCampaignTemplate[] = [
  {
    id: "welcome",
    label: "Welcome new member",
    subject: "Welcome to One Flow 🌿",
    bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi there,</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">We're so glad you've joined One Flow. Your account is ready — browse the schedule, book your first class, and explore our passes when you're ready.</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0;">See you on the mat,<br />The One Flow team</p>`,
  },
  {
    id: "class_reminder",
    label: "Class reminder",
    subject: "Reminder — your class at One Flow",
    bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi there,</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Just a friendly reminder about your upcoming class. Please arrive a few minutes early and bring water, a mat (if needed), and an open mind.</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0;">We can't wait to see you,<br />The One Flow team</p>`,
  },
  {
    id: "promotional",
    label: "Promotional offer",
    subject: "A special offer from One Flow",
    bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi there,</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">For a limited time, enjoy an exclusive offer on passes at One Flow. <strong>[Describe your offer here]</strong></p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Visit the app to claim your offer before it expires.</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0;">With gratitude,<br />The One Flow team</p>`,
  },
  {
    id: "announcement",
    label: "Studio announcement",
    subject: "News from One Flow",
    bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi there,</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;"><strong>[Your announcement headline]</strong></p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">[Share studio news, schedule changes, or community updates here.]</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0;">The One Flow team</p>`,
  },
  {
    id: "winback",
    label: "Win-back (lapsed)",
    subject: "We'd love to see you back at One Flow",
    bodyHtml: `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Hi there,</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">It's been a while since we've seen you on the mat. We'd love to welcome you back — your practice is always here when you're ready.</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">Book a class from the app whenever it suits you.</p>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0;">With warmth,<br />The One Flow team</p>`,
  },
];
