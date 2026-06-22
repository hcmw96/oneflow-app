import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { plainTextToMarketingHtml, sendMarketingEmail } from "@/lib/marketingEmail";

export type SendMemberEmailTarget = {
  displayName: string;
  email: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SendMemberEmailTarget | null;
};

export function SendMemberEmailDialog({ open, onOpenChange, target }: Props) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject("");
      setMessage("");
    }
  }, [open, target?.email]);

  const toLabel = target
    ? `${target.displayName.trim() || "Member"} <${target.email.trim()}>`
    : "";

  const send = async () => {
    const email = target?.email?.trim();
    if (!email) {
      toast.error("This member has no email address.");
      return;
    }
    const subj = subject.trim();
    const body = message.trim();
    if (!subj) {
      toast.error("Subject is required.");
      return;
    }
    if (!body) {
      toast.error("Message is required.");
      return;
    }

    setSending(true);
    const { ok, error } = await sendMarketingEmail(
      email,
      subj,
      plainTextToMarketingHtml(body),
    );
    setSending(false);

    if (!ok) {
      toast.error(error ?? "Could not send email");
      return;
    }

    toast.success(`Email sent to ${target?.displayName ?? email}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="send-email-to">To</Label>
            <Input id="send-email-to" readOnly value={toLabel} className="bg-muted/50" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-email-subject">Subject</Label>
            <Input
              id="send-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              disabled={sending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-email-message">Message</Label>
            <Textarea
              id="send-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message…"
              rows={6}
              disabled={sending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            disabled={sending || !target?.email?.trim()}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
