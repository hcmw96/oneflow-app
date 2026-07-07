import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cancelBookingWithPolicy } from "@/lib/bookingCancellation";
import { cn } from "@/lib/utils";

type Props = {
  bookingId: string;
  onCancelled?: () => void | Promise<void>;
  /** `card` — full-width on booking cards; `inline` — compact for home list */
  variant?: "card" | "inline";
  className?: string;
};

export function CancelBookingButton({
  bookingId,
  onCancelled,
  variant = "card",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const confirmCancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelBookingWithPolicy({
        bookingId,
        cancellationReason: "customer_cancelled",
      });
      toast.success(
        result.lateCancel
          ? "Booking cancelled. Late cancellation fee will apply on next transaction."
          : "Booking cancelled. Credit returned.",
      );
      setOpen(false);
      await onCancelled?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel booking");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          variant === "card"
            ? "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 transition-opacity active:opacity-80 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
            : "inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
          className,
        )}
      >
        <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Cancel class
      </button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !cancelling) setOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>Cancellations more than 2 hours before class: your credit will be returned.</p>
                <p>
                  Late cancellations (within 2 hours): your credit will be returned, but a R100
                  fee applies on your next transaction.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(event) => {
                event.preventDefault();
                void confirmCancel();
              }}
            >
              {cancelling ? "Cancelling…" : "Cancel booking"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
