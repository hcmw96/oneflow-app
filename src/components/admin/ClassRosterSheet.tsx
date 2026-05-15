import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Undo2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import {
  type BookingRow,
  type RosterRow,
  normalizeBooking,
  patchBookingAttendance,
} from "@/lib/checkInRoster";
import {
  fetchRosterMemberAddonAccess,
  RosterAddonPills,
} from "@/components/admin/RosterAddonPills";
import { CheckInRosterMemberAvatar } from "@/components/admin/CheckInRosterMemberAvatar";
import { CheckInRosterStatusPill } from "@/components/admin/CheckInRosterStatusPill";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TZ = "Africa/Johannesburg";

export type ClassRosterSession = {
  id: string;
  name: string;
  starts_at: string;
  capacity: number;
  booked_count: number;
};

export function ClassRosterSheet({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ClassRosterSession | null;
}) {
  const navigate = useNavigate();
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    if (!session?.id) {
      setRoster([]);
      return;
    }
    setLoading(true);
    try {
      const [{ data: bookingsData, error: bookingsError }, addonAccess] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            `
        id,
        status,
        profile_id,
        class_id,
        qr_token,
        payment_method,
        mat_addon,
        towel_addon,
        profiles ( first_name, last_name, avatar_url ),
        classes ( id, name, starts_at, guide_name )
      `,
          )
          .eq("class_id", session.id),
        fetchRosterMemberAddonAccess(supabase),
      ]);

      if (bookingsError) {
        console.error("dashboard roster: bookings load failed", bookingsError);
        toast.error(supabaseErrorMessage(bookingsError, "Could not load bookings"));
        setRoster([]);
        return;
      }

      const rows = (bookingsData ?? []) as unknown as BookingRow[];
      const normalized = rows
        .map((row) => normalizeBooking(row, addonAccess))
        .filter((r): r is RosterRow => r !== null);
      setRoster(normalized);
    } finally {
      setLoading(false);
    }
  }, [session?.id]);

  useEffect(() => {
    if (!open || !session) return;
    void loadRoster();
  }, [open, session, loadRoster]);

  const bookedNonCancelled = roster.filter((r) => r.status !== "cancelled").length;
  const capacity = session?.capacity ?? 0;

  const updateBookingStatus = async (id: string, status: "attended" | "confirmed") => {
    const row = roster.find((r) => r.id === id);
    const ctx =
      row?.profileId && row.classStartsAt
        ? { profileId: row.profileId, classStartsAt: row.classStartsAt }
        : null;
    setBusyId(id);
    const { error } = await patchBookingAttendance(supabase, {
      bookingId: id,
      status,
      context: ctx,
    });
    setBusyId(null);
    if (error) {
      toast.error(error);
      return;
    }
    if (status === "attended") {
      toast.success("Checked in · +10 Flow Points");
    } else {
      toast.success("Reverted to confirmed");
    }
    await loadRoster();
  };

  const timeLabel =
    session?.starts_at &&
    new Date(session.starts_at).toLocaleTimeString("en-ZA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TZ,
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-8 text-left">{session?.name ?? "Class roster"}</SheetTitle>
          {session ? (
            <p className="text-left text-sm text-muted-foreground">
              {timeLabel} · {bookedNonCancelled} / {capacity} booked
            </p>
          ) : null}
        </SheetHeader>

        <div className="mt-4 flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading roster…
            </div>
          ) : roster.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bookings for this class.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {roster.map((b) => {
                const isIn = b.status === "attended";
                const isNoShow = b.status === "no-show";
                const isCancelled = b.status === "cancelled";
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                    <CheckInRosterMemberAvatar row={b} />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold">
                        <span className="min-w-0 truncate">{b.member}</span>
                        <RosterAddonPills
                          mat={b.matAddon}
                          towel={b.towelAddon}
                          cafe={b.hasSageCredit}
                        />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{b.creditLabel}</p>
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <CheckInRosterStatusPill status={b.status} />
                      {isIn ? (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => void updateBookingStatus(b.id, "confirmed")}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted sm:flex-none"
                        >
                          <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Undo
                        </button>
                      ) : isCancelled ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => void updateBookingStatus(b.id, "attended")}
                          className={cn(
                            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none",
                            isNoShow
                              ? "border border-border bg-background hover:bg-muted"
                              : "bg-primary text-primary-foreground hover:opacity-90",
                          )}
                        >
                          {busyId === b.id ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          )}
                          {isNoShow ? "Mark attended" : "Check in"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <SheetFooter className="mt-auto flex-col gap-2 border-t border-border pt-4 sm:flex-col">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={!session}
            onClick={() => {
              if (!session) return;
              onOpenChange(false);
              void navigate({ to: "/admin/check-in", search: { class: session.id } });
            }}
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            View full check-in
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
