import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SegmentRow } from "@/components/admin/reports/memberNudgeTypes";
import {
  applyNudgeTemplate,
  NUDGE_DEFAULTS,
  type NudgeKind,
} from "@/lib/memberNudgeTemplates";
import { plainTextToMarketingHtml, sendMarketingEmail } from "@/lib/marketingEmail";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: NudgeKind;
  rows: SegmentRow[];
};

export function MemberNudgeDialog({ open, onOpenChange, kind, rows }: Props) {
  const defaults = NUDGE_DEFAULTS[kind];
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [sendAll, setSendAll] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject(defaults.subject);
    setBody(defaults.body);
    setSendAll(true);
    setSelectedIds(new Set(rows.map((r) => r.id)));
  }, [open, kind, rows, defaults.subject, defaults.body]);

  const recipients = useMemo(() => {
    const withEmail = rows.filter((r) => r.email.trim().includes("@"));
    if (sendAll) return withEmail;
    return withEmail.filter((r) => selectedIds.has(r.id));
  }, [rows, sendAll, selectedIds]);

  const toggleRecipient = (id: string, on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const confirmSend = async () => {
    if (recipients.length === 0) {
      toast.error("No recipients with email addresses");
      return;
    }
    const subj = subject.trim();
    const template = body.trim();
    if (!subj || !template) {
      toast.error("Subject and body are required");
      return;
    }

    setSending(true);
    let okCount = 0;
    let failCount = 0;
    for (const row of recipients) {
      const personalBody = applyNudgeTemplate(template, row);
      const personalSubj = applyNudgeTemplate(subj, row);
      const { ok, error } = await sendMarketingEmail(
        row.email.trim(),
        personalSubj,
        plainTextToMarketingHtml(personalBody),
      );
      if (ok) okCount += 1;
      else {
        failCount += 1;
        console.error("nudge send failed", row.email, error);
      }
    }
    setSending(false);

    if (okCount === 0) {
      toast.error("No emails were sent — check send-email / Resend");
      return;
    }
    toast.success(
      `Sent ${okCount} nudge email${okCount === 1 ? "" : "s"}${failCount > 0 ? ` (${failCount} failed)` : ""}`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send nudge — {defaults.audienceLabel}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Audience: <span className="font-semibold text-foreground">{recipients.length}</span>{" "}
          {kind} member{recipients.length === 1 ? "" : "s"} with email
        </p>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="nudge-subject">Subject</Label>
            <Input
              id="nudge-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nudge-body">Body</Label>
            <Textarea
              id="nudge-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="text-[11px]">[first_name]</code> for personalization.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={sendAll}
              onCheckedChange={(v) => setSendAll(v === true)}
            />
            Send to all in this list
          </label>

          {!sendAll ? (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
              {rows
                .filter((r) => r.email.includes("@"))
                .map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={(v) => toggleRecipient(r.id, v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">{r.email}</span>
                    </span>
                  </label>
                ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={sending || recipients.length === 0}
            className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            onClick={() => void confirmSend()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4 shrink-0" aria-hidden />
            )}
            Confirm &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
