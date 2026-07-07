import { useCallback, useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTimezone } from "@/hooks/use-timezone";
import { CLASS_REVIEW_FLOW_COMPLETE, shouldOfferMemberPostClassPrompts } from "@/lib/classReviews";
import type { ClassPracticeShareInput } from "@/lib/classPracticeShare";
import { supabase } from "@/lib/supabase";
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
  const { user, authReady, profile, profileReady } = useAuth();
  const { timeZone, studioTimeZone } = useTimezone();
  const memberPromptsEnabled = shouldOfferMemberPostClassPrompts(profile);
  const [pending, setPending] = useState<PendingPracticeShare | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInput, setComposerInput] = useState<ClassPracticeShareInput | null>(null);
  const dialogOpenRef = useRef(false);
  const composerOpenRef = useRef(false);

  useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);

  useEffect(() => {
    composerOpenRef.current = composerOpen;
  }, [composerOpen]);

  const loadPending = useCallback(async () => {
    if (!user?.id || !memberPromptsEnabled) {
      setPending(null);
      setDialogOpen(false);
      return;
    }
    if (composerOpenRef.current) return;

    const next = await fetchPendingPracticeShare(user.id, profile);
    if (!next) {
      if (!composerOpenRef.current) {
        setPending(null);
        setDialogOpen(false);
      }
      return;
    }

    setPending(next);
    if (!composerOpenRef.current) {
      setDialogOpen(true);
    }
  }, [user?.id, profile, memberPromptsEnabled]);

  useEffect(() => {
    if (!authReady || !profileReady || !memberPromptsEnabled) return;
    void loadPending();
  }, [authReady, profileReady, memberPromptsEnabled, loadPending]);

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

  useEffect(() => {
    if (!user?.id || !memberPromptsEnabled) return;

    const channel = supabase
      .channel(`practice-share-prompt-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void loadPending();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, memberPromptsEnabled, loadPending]);

  const closeDialog = (bookingId: string | null, dismissed: boolean) => {
    if (dismissed && bookingId) dismissShareForSession(bookingId);
    dialogOpenRef.current = false;
    setDialogOpen(false);
    setPending(null);
  };

  const openComposer = () => {
    if (!pending) return;
    setComposerInput({
      className: pending.className,
      guideName: pending.guideName ?? "",
      startsAt: new Date(pending.startsAt),
      timeZone: timeZone ?? studioTimeZone,
    });
    dialogOpenRef.current = false;
    setDialogOpen(false);
    setComposerOpen(true);
  };

  const onComposerClosed = () => {
    composerOpenRef.current = false;
    setComposerOpen(false);
    setComposerInput(null);
    if (pending) {
      dialogOpenRef.current = true;
      setDialogOpen(true);
    }
  };

  const onShared = () => {
    if (pending?.bookingId) markShareCompletedForSession(pending.bookingId);
    composerOpenRef.current = false;
    dialogOpenRef.current = false;
    setComposerOpen(false);
    setComposerInput(null);
    setPending(null);
    setDialogOpen(false);
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
          if (!open) onComposerClosed();
        }}
        input={composerInput}
        onShared={onShared}
      />
    </>
  );
}
