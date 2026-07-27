import { cn } from "@/lib/utils";

/** Horizontal “now” marker between past and upcoming classes on a day list. */
export function CurrentTimeLine({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      aria-label="Current time"
      className={cn("flex items-center gap-2 py-1", className)}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive shadow-sm" aria-hidden />
      <span className="h-0.5 flex-1 rounded-full bg-destructive" aria-hidden />
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-destructive">
        Now
      </span>
    </div>
  );
}

/**
 * Index to insert a current-time line: after the last class that has started
 * (or ended), before the first that has not started yet. Returns -1 if no
 * insert (all upcoming or all past, or empty).
 */
export function currentTimeLineInsertIndex(
  classes: { starts_at: string }[],
  nowMs: number = Date.now(),
): number {
  if (classes.length === 0) return -1;
  let lastStarted = -1;
  for (let i = 0; i < classes.length; i++) {
    if (new Date(classes[i]!.starts_at).getTime() <= nowMs) lastStarted = i;
  }
  // All upcoming
  if (lastStarted < 0) return -1;
  // All past / started
  if (lastStarted >= classes.length - 1) {
    const lastStart = new Date(classes[lastStarted]!.starts_at).getTime();
    // Only show line if we're still "in the day" with something upcoming conceptually —
    // if everything has started, put line after last only when last hasn't ended? Spec:
    // "between classes that have passed and those upcoming". If none upcoming, no line.
    return -1;
  }
  return lastStarted + 1;
}
