import { useCallback, useEffect, useState } from "react";
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
  fetchPendingClassReview,
  submitClassReview,
  type PendingClassReview,
} from "@/lib/classReviews";

const DISMISS_KEY = "oneflow:class-review-dismissed";

function sessionDismissed(bookingId: string): boolean {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw) as string[];
    return ids.includes(bookingId);
  } catch {
    return false;
  }
}

function dismissForSession(bookingId: string) {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!ids.includes(bookingId)) ids.push(bookingId);
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    /* ignore */
  }
}

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
  const { user, authReady } = useAuth();
  const [pending, setPending] = useState<PendingClassReview | null>(null);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPending = useCallback(async () => {
    if (!user?.id) {
      setPending(null);
      setOpen(false);
      return;
    }
    const next = await fetchPendingClassReview(user.id);
    if (!next || sessionDismissed(next.bookingId)) {
      setPending(null);
      setOpen(false);
      return;
    }
    setPending(next);
    setRating(0);
    setComment("");
    setOpen(true);
  }, [user?.id]);

  useEffect(() => {
    if (!authReady) return;
    void loadPending();
  }, [authReady, loadPending]);

  const close = (bookingId: string | null, dismissed: boolean) => {
    if (dismissed && bookingId) dismissForSession(bookingId);
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
    toast.success("Thanks for your feedback!");
    close(pending.bookingId, false);
    void loadPending();
  };

  if (!pending) return null;

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
