import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { type BookingRow, type RosterRow, normalizeBooking } from "@/lib/checkInRoster";
import { fetchRosterMemberAddonAccess } from "@/components/admin/RosterAddonPills";
import { CheckInRosterList } from "@/components/admin/CheckInRosterList";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
        profiles ( first_name, last_name, avatar_url, role ),
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
          <CheckInRosterList
            roster={roster.filter((r) => r.status !== "cancelled")}
            loading={loading}
            onUpdated={loadRoster}
          />
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
