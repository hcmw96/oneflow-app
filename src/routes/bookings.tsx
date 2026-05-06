import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Clock, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TypeBadge } from "@/components/TypeBadge";
import { formatTime, formatDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getUser, supabase } from "@/lib/supabase";
import { displayClassType, type ClassType } from "@/types/studio";

export const Route = createFileRoute("/bookings")({
  component: BookingsPage,
});

type ClassJoin = {
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  guides?: {
    profiles: { first_name: string } | { first_name: string }[] | null;
  } | null;
};

type RawBooking = {
  id: string;
  status: string;
  qr_token: string | null;
  classes: ClassJoin | ClassJoin[] | null;
};

type BookingListRow = {
  id: string;
  status: string;
  qrToken: string | null;
  className: string;
  classType: ClassType;
  location: string;
  startsAt: Date;
  guideFirst: string | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function guideFirstFromClass(cls: ClassJoin | null): string | null {
  const g = cls?.guides;
  if (!g) return null;
  const p = g.profiles;
  const prof = one(p);
  return prof?.first_name?.trim() || null;
}

function BookingsPage() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BookingListRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `id, status, qr_token,
         classes ( name, class_type, location, starts_at,
           guides ( profiles ( first_name ) ) )`,
      )
      .eq("profile_id", user.id)
      .in("status", ["confirmed", "attended"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: BookingListRow[] =
      (data as unknown as RawBooking[] | null)?.map((raw) => {
        const cls = one(raw.classes);
        return {
          id: raw.id,
          status: raw.status,
          qrToken: raw.qr_token ?? null,
          className: cls?.name ?? "Class",
          classType: displayClassType(cls?.class_type),
          location: cls?.location ?? "",
          startsAt: new Date(cls?.starts_at ?? Date.now()),
          guideFirst: guideFirstFromClass(cls),
        };
      }) ?? [];

    mapped.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = rows.filter(
    (r) => r.status === "confirmed" && r.startsAt.getTime() >= Date.now(),
  );
  const past = rows.filter((r) => r.status === "attended");

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
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {tab === "upcoming" && upcoming.length === 0 && (
              <Empty text="No upcoming bookings yet — head to Schedule to book." />
            )}
            {tab === "upcoming" &&
              upcoming.map((b) => (
                <article key={b.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <TypeBadge type={b.classType} />
                  </div>
                  <h3 className="truncate font-display text-lg font-semibold">{b.className}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDayLabel(b.startsAt)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden /> {formatTime(b.startsAt)}
                    </span>
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />{" "}
                      <span className="min-w-0 break-words">{b.location}</span>
                    </span>
                    {b.guideFirst && <span>with {b.guideFirst}</span>}
                  </div>
                  {b.qrToken && (
                    <div className="mt-4 flex flex-col items-center border-t border-border pt-4">
                      <div className="flex min-h-[200px] min-w-[200px] items-center justify-center rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                        <QRCodeSVG
                          value={b.qrToken}
                          size={200}
                          level="M"
                          includeMargin
                          title="Class check-in code"
                          className="h-[200px] w-[200px] max-w-full"
                        />
                      </div>
                      <p className="mt-3 max-w-[260px] text-center text-sm font-medium text-muted-foreground">
                        Show this at the desk to check in
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => toast("Booking cancelled", { description: "Credit refunded." })}
                    className="mt-3 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    <X className="h-3 w-3 shrink-0" aria-hidden /> Cancel booking
                  </button>
                </article>
              ))}

            {tab === "past" && past.length === 0 && (
              <Empty text="No past classes yet — your attended sessions will show here." />
            )}
            {tab === "past" &&
              past.map((b) => (
                <article
                  key={b.id}
                  className="rounded-2xl border border-border bg-card p-4 opacity-90"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <TypeBadge type={b.classType} />
                    <span className="text-[10px] uppercase tracking-wide text-success">
                      Attended
                    </span>
                  </div>
                  <h3 className="truncate font-display text-lg font-semibold">{b.className}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDayLabel(b.startsAt)}
                  </div>
                </article>
              ))}
          </>
        )}
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
