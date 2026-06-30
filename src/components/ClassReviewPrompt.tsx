import { useCallback, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CLASS_REVIEW_FLOW_COMPLETE,
  dismissClassReview,
  fetchPendingClassReview,
  reviewDismissed,
  shouldOfferMemberPostClassPrompts,
  submitClassReview,
  type PendingClassReview,
} from "@/lib/classReviews";

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="rounded-full p-1 transition-transform active:scale-95"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(
              "h-10 w-10",
              n <= value ? "fill-[#a3b693] text-[#a3b693]" : "text-muted-foreground/35",
            )}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}

export function ClassReviewPrompt() {
  const { user, authReady, profile, profileReady } = useAuth();
  const [pending, setPending] = useState<PendingClassReview | null>(null);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const openRef = useRef(false);

  const memberPromptsEnabled = shouldOfferMemberPostClassPrompts(profile);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const loadPending = useCallback(async () => {
    if (!user?.id || !memberPromptsEnabled) {
      setPending(null);
      setOpen(false);
      return;
    }
    if (openRef.current) return;

    const next = await fetchPendingClassReview(user.id);
    if (!next || reviewDismissed(next.bookingId)) {
      setPending(null);
      setOpen(false);
      return;
    }

    setPending(next);
    setRating(0);
    setComment("");
    setOpen(true);
  }, [user?.id, memberPromptsEnabled]);

  useEffect(() => {
    if (!authReady || !profileReady || !user?.id) return;
    void loadPending();
  }, [authReady, profileReady, user?.id, memberPromptsEnabled, loadPending]);

  const close = (bookingId: string | null, dismissed: boolean) => {
    if (bookingId && dismissed) {
      dismissClassReview(bookingId);
    }
    openRef.current = false;
    setOpen(false);
    setPending(null);
  };

  const submit = async () => {
    if (!pending || !user?.id) return;
    if (rating < 1) {
      toast.error("Tap a star rating to continue.");
      return;
    }
    setSubmitting(true);
    const { error } = await submitClassReview({
      bookingId: pending.bookingId,
      classId: pending.classId,
      profileId: user.id,
      rating,
      comment,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    dismissClassReview(pending.bookingId);
    toast.success("Thanks for your feedback!");
    openRef.current = false;
    setOpen(false);
    setPending(null);
    window.dispatchEvent(
      new CustomEvent(CLASS_REVIEW_FLOW_COMPLETE, { detail: { bookingId: pending.bookingId } }),
    );
  };

  if (!memberPromptsEnabled || !pending) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close(pending.bookingId, true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">How was your class?</DialogTitle>
          <DialogDescription>
            {pending.className}
            {pending.guideName ? ` with ${pending.guideName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <StarRow value={rating} onChange={setRating} />

        <Textarea
          placeholder="Optional comment…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="resize-none"
        />

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" className="w-full" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Submitting…" : "Submit review"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => close(pending.bookingId, true)}
          >
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
