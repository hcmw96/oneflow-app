import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TypeBadge } from "@/components/TypeBadge";
import { upcomingBookings, pastClasses, getGuide } from "@/data/mock";
import { formatTime, formatDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bookings")({
  component: BookingsPage,
});

function BookingsPage() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const upcoming = upcomingBookings();

  return (
    <AppShell>
      <header className="safe-top px-5 pt-3 pb-3">
        <h1 className="font-display text-2xl font-semibold">My bookings</h1>
      </header>

      <div className="px-5">
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 space-y-3 px-5 pt-4">
        {tab === "upcoming" && upcoming.length === 0 && (
          <Empty text="No upcoming bookings yet — head to Schedule to book." />
        )}
        {tab === "upcoming" &&
          upcoming.map(({ booking, session }) => {
            const guide = getGuide(session.guideId);
            return (
              <article key={booking.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-1 flex items-center gap-2">
                  <TypeBadge type={session.type} />
                </div>
                <h3 className="font-display text-lg font-semibold">{session.name}</h3>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatDayLabel(session.startsAt)}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatTime(session.startsAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {session.location}
                  </span>
                  {guide && <span>with {guide.name.split(" ")[0]}</span>}
                </div>
                <button
                  onClick={() => toast("Booking cancelled", { description: "Credit refunded." })}
                  className="mt-3 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  <X className="h-3 w-3" /> Cancel booking
                </button>
              </article>
            );
          })}

        {tab === "past" &&
          Object.entries(pastClasses).map(([id, c]) => (
            <article key={id} className="rounded-2xl border border-border bg-card p-4 opacity-90">
              <div className="mb-1 flex items-center gap-2">
                <TypeBadge type={c.type} />
                <span className="text-[10px] uppercase tracking-wide text-success">Attended</span>
              </div>
              <h3 className="font-display text-lg font-semibold">{c.name}</h3>
              <div className="mt-1 text-xs text-muted-foreground">{formatDayLabel(c.startsAt)}</div>
            </article>
          ))}
      </main>
    </AppShell>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
