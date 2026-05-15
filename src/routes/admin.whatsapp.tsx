import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { ensureMarketingAdminAccess } from "@/lib/ensureMarketingAdminAccess";

export const Route = createFileRoute("/admin/whatsapp")({
  beforeLoad: () => ensureMarketingAdminAccess(),
  head: () => ({ meta: [{ title: "WhatsApp — One Flow Admin" }] }),
  component: WhatsAppPage,
});

const SUPPORT_NUMBER_DISPLAY = "+27 82 553 3032";
const SUPPORT_NUMBER_LINK = "27825533032";

const QUICK_REPLIES: { label: string; body: string }[] = [
  {
    label: "Welcome",
    body: "Hi! Thanks for reaching out to One Flow. How can we help you today? 🙏",
  },
  {
    label: "Booking confirmation",
    body: "Your booking has been confirmed! See you on the mat 🌿",
  },
  {
    label: "Class reminder",
    body: "Hi [name], just a reminder you have a class tomorrow at [time]. See you soon! ✨",
  },
  {
    label: "Holding response",
    body: "Thanks for your message! Our team will get back to you shortly.",
  },
];

function WhatsAppPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1800);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description="Customer support is handled on WhatsApp."
      />

      <div className="mb-6 rounded-2xl border border-[#c5d4b8]/80 bg-[#f4f7f0]/70 p-6 shadow-sm">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#3d4f36]">
              Support number
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
              {SUPPORT_NUMBER_DISPLAY}
            </p>
          </div>
          <a
            href={`https://wa.me/${SUPPORT_NUMBER_LINK}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-full bg-[#a3b693] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
          >
            <MessageCircle className="h-4 w-4" />
            Open WhatsApp
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <section className="mb-6">
        <h3 className="mb-3 font-display text-lg font-semibold">Customer enquiry log</h3>
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">WhatsApp message logs coming soon.</p>
          <p className="max-w-md px-4 text-xs text-muted-foreground">
            Once the WhatsApp Business API is connected, customer enquiries will appear here for
            triage.
          </p>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg font-semibold">Quick reply templates</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Tap copy and paste straight into WhatsApp.
        </p>
        <ul className="space-y-3">
          {QUICK_REPLIES.map((qr, idx) => {
            const copied = copiedIndex === idx;
            return (
              <li
                key={qr.label}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {qr.label}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{qr.body}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => void copy(qr.body, idx)}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
