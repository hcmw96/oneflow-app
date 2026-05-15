import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/checkInRoster";

export function CheckInRosterStatusPill({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, string> = {
    attended: "bg-success/20 text-success-foreground",
    confirmed: "bg-muted text-foreground",
    cancelled: "bg-destructive/15 text-destructive",
    "no-show": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        map[status],
      )}
    >
      {status}
    </span>
  );
}
