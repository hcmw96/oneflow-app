import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Users } from "lucide-react";
import { type ClassType } from "@/types/studio";
import { TypeBadge } from "./TypeBadge";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ClassCardSession = {
  id: string;
  name: string;
  type: ClassType;
  startsAt: Date;
  durationMin: number;
  location: string;
  capacity: number;
  booked: number;
  guide?: { name: string; initials: string; color: string } | null;
};

export function ClassCard({ session }: { session: ClassCardSession }) {
  const guide = session.guide;
  const fillRatio = session.booked / session.capacity;
  const almostFull = fillRatio >= 0.8 && fillRatio < 1;
  const full = fillRatio >= 1;
  const started = session.startsAt.getTime() < Date.now() - 15 * 60 * 1000;
  if (started) return null;

  return (
    <Link
      to="/class/$classId"
      params={{ classId: session.id }}
      className="block rounded-2xl border border-border bg-card p-4 transition-colors active:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <TypeBadge type={session.type} />
            {almostFull && (
              <span className="inline-flex shrink-0 rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-foreground">
                Almost Full
              </span>
            )}
            {full && (
              <span className="inline-flex shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                Waitlist
              </span>
            )}
          </div>
          <h3 className="truncate font-display text-lg font-semibold leading-tight">{session.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" aria-hidden /> {formatTime(session.startsAt)} ·{" "}
              {session.durationMin}m
            </span>
            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{session.location}</span>
            </span>
          </div>
        </div>
        {guide && (
          <div className="flex shrink-0 flex-col items-center text-center">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-semibold text-foreground"
              style={{ backgroundColor: guide.color }}
            >
              {guide.initials}
            </div>
            <span className="mt-1 max-w-[64px] truncate text-[10px] text-muted-foreground">
              {guide.name.split(" ")[0]}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              full ? "bg-destructive" : almostFull ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${Math.min(100, fillRatio * 100)}%` }}
          />
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" aria-hidden /> {session.booked}/{session.capacity}
        </span>
      </div>
    </Link>
  );
}
