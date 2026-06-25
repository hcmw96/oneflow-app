import { useCallback, useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTimezone } from "@/hooks/use-timezone";
import { CLASS_REVIEW_FLOW_COMPLETE } from "@/lib/classReviews";
import type { ClassPracticeShareInput } from "@/lib/classPracticeShare";
import {
  dismissShareForSession,
  fetchPendingPracticeShare,
  markShareCompletedForSession,
  type PendingPracticeShare,
} from "@/lib/practiceSharePrompt";
import { PracticeShareComposerSheet } from "@/components/PracticeShareComposerSheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function PracticeSharePrompt() {
  const { user, authReady } = useAuth();
  const { timeZone, studioTimeZone } = useTimezone();
  const [pending, setPending] = useState<PendingPracticeShare | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInput, setComposerInput] = useState<ClassPracticeShareInput | null>(null);

  const loadPending = useCallback(async () => {
    if (!user?.id) {
      setPending(null);
      setDialogOpen(false);
      return;
    }
    const next = await fetchPendingPracticeShare(user.id);
    if (!next) {
      setPending(null);
      setDialogOpen(false);
      return;
    }
    setPending(next);
    setDialogOpen(true);
  }, [user?.id]);

  useEffect(() => {
    if (!authReady) return;
    void loadPending();
  }, [authReady, loadPending]);

  useEffect(() => {
    const onReviewDone = () => {
      void loadPending();
    };
    window.addEventListener(CLASS_REVIEW_FLOW_COMPLETE, onReviewDone);
    return () => window.removeEventListener(CLASS_REVIEW_FLOW_COMPLETE, onReviewDone);
  }, [loadPending]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadPending();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadPending]);

  const closeDialog = (bookingId: string | null, dismissed: boolean) => {
    if (dismissed && bookingId) dismissShareForSession(bookingId);
    setDialogOpen(false);
    setPending(null);
  };

  const openComposer = () => {
    if (!pending) return;
    const tz = timeZone ?? studioTimeZone;
    setComposerInput({
      className: pending.className,
      guideName: pending.guideName ?? "",
      startsAt: new Date(pending.startsAt),
      timeZone: tz,
    });
    setDialogOpen(false);
    setComposerOpen(true);
  };

  if (!pending && !composerOpen) return null;

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog(pending?.bookingId ?? null, true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Share your practice</DialogTitle>
            <DialogDescription>
              {pending?.className}
              {pending?.guideName ? ` with ${pending.guideName}` : ""} — add a photo and post to
              your story.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="w-full gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
              onClick={() => openComposer()}
            >
              <Share2 className="h-4 w-4 shrink-0" aria-hidden />
              Create story
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => closeDialog(pending?.bookingId ?? null, true)}
            >
              Not now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PracticeShareComposerSheet
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) {
            if (pending?.bookingId) markShareCompletedForSession(pending.bookingId);
            setComposerInput(null);
            setPending(null);
          }
        }}
        input={composerInput}
      />
    </>
  );
}
