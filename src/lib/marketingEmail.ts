import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";

export async function sendMarketingEmail(
  to: string,
  subject: string,
  bodyHtml: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: {
      to,
      template: "marketing",
      data: { subject, body_html: bodyHtml },
    },
  });

  if (error) {
    return { ok: false, error: supabaseErrorMessage(error, "Email send failed") };
  }

  const payload = data as { success?: boolean; error?: unknown } | null;
  if (payload?.error) {
    const msg =
      typeof payload.error === "string"
        ? payload.error
        : JSON.stringify(payload.error);
    return { ok: false, error: msg };
  }

  return { ok: true, error: null };
}

export function plainTextToMarketingHtml(text: string): string {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">${para.replace(/\n/g, "<br />")}</p>`)
    .join("");
}
