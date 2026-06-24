import { useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getUser, supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MessageStudioSheet({ open, onOpenChange }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const reset = () => {
    setSubject("");
    setBody("");
  };

  const send = async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast.error("Please enter a message");
      return;
    }
    const user = await getUser();
    if (!user) {
      toast.error("Sign in to message the studio");
      return;
    }

    setSending(true);
    console.info("[MessageStudio] submit", {
      profileId: user.id,
      subject: subject.trim() || null,
      bodyLength: trimmedBody.length,
    });
    const { error } = await supabase.from("member_messages").insert({
      profile_id: user.id,
      subject: subject.trim() || null,
      body: trimmedBody,
      status: "unread",
    });
    setSending(false);

    if (error) {
      console.error("[MessageStudio] member_messages insert failed", error);
      toast.error(supabaseErrorMessage(error, "Could not send message"));
      return;
    }

    console.info("[MessageStudio] message sent");

    toast.success("Message sent to the studio");
    reset();
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Message the studio</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="studio-msg-subject">Subject (optional)</Label>
            <Input
              id="studio-msg-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Class question"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="studio-msg-body">Message</Label>
            <Textarea
              id="studio-msg-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="How can we help?"
            />
          </div>
        </div>
        <SheetFooter className="mt-6 flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={sending || !body.trim()}
            className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            onClick={() => void send()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4 shrink-0" aria-hidden />
            )}
            Send
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type MessageStudioButtonProps = {
  className?: string;
};

export function MessageStudioButton({ className }: MessageStudioButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        className={className ?? "w-full gap-2 bg-[#a3b693] font-semibold text-white hover:bg-[#8fa67d]"}
        onClick={() => setOpen(true)}
      >
        <Mail className="h-4 w-4 shrink-0" aria-hidden />
        Message the studio
      </Button>
      <MessageStudioSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
