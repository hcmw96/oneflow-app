import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SAGE = "#a3b693";

/** Sunday-first single letters for the compact strip. */
export const WEEKDAY_STRIP_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function weekdayStripLetter(dowSundayZero: number): string {
  return WEEKDAY_STRIP_LETTERS[dowSundayZero] ?? "?";
}

export type WeekDayStripDay = {
  key: string;
  weekdayLetter: string;
  dayOfMonth: number;
  selected: boolean;
  isToday: boolean;
  /** Selected past day uses muted fill instead of sage (member schedule). */
  selectedMuted?: boolean;
  /** Soften non-selected past days (member schedule). */
  dimmed?: boolean;
};

type Props = {
  days: WeekDayStripDay[];
  onSelect: (key: string) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  className?: string;
};

/**
 * Compact 7-day week strip with optional week paging arrows.
 * Shared by admin Bookings and member Schedule.
 */
export function WeekDayStrip({
  days,
  onSelect,
  onPrevWeek,
  onNextWeek,
  className,
}: Props) {
  const showNav = Boolean(onPrevWeek && onNextWeek);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {showNav ? (
        <button
          type="button"
          aria-label="Previous week"
          onClick={onPrevWeek}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div className="min-w-0 flex-1 rounded-xl border border-border bg-card px-1 py-1 sm:px-1.5">
        <div className="flex justify-between gap-0.5">
          {days.map((d) => {
            const useSage = d.selected && !d.selectedMuted;
            const useMuted = d.selected && d.selectedMuted;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onSelect(d.key)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0 rounded-md px-0.5 py-1 transition",
                  useSage && "text-white shadow-sm",
                  useMuted && "bg-muted text-muted-foreground shadow-sm",
                  !d.selected &&
                    d.isToday &&
                    "text-[#5f6b52] ring-1 ring-[#a3b693] ring-offset-1 ring-offset-background",
                  !d.selected && !d.isToday && "text-foreground hover:bg-muted/80",
                  d.dimmed && !d.selected && "opacity-45",
                )}
                style={useSage ? { backgroundColor: SAGE } : undefined}
              >
                <span
                  className={cn(
                    "text-[9px] font-medium uppercase leading-none tracking-wide",
                    useSage ? "text-white/80" : "text-muted-foreground",
                  )}
                >
                  {d.weekdayLetter}
                </span>
                <span className="font-display text-sm font-semibold leading-none tabular-nums">
                  {d.dayOfMonth}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showNav ? (
        <button
          type="button"
          aria-label="Next week"
          onClick={onNextWeek}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
