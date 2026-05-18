import { Check, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  type RosterRow,
  patchBookingAttendance,
} from "@/lib/checkInRoster";
import { upsertMayChallengeCheckIn } from "@/lib/mayChallengeCheckIn";
import { awardClassesAttendedBadges } from "@/lib/badges";
import { RosterAddonPills } from "@/components/admin/RosterAddonPills";
import { CheckInRosterMemberAvatar } from "@/components/admin/CheckInRosterMemberAvatar";
import { CheckInRosterStatusPill } from "@/components/admin/CheckInRosterStatusPill";
import { manualCheckInToastMessage } from "@/lib/flowPoints";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function CheckInRosterList({
  roster,
  loading,
  onUpdated,
  compact,
}: {
  roster: RosterRow[];
  loading?: boolean;
  onUpdated: () => void | Promise<void>;
  compact?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

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
    if (status === "attended" && ctx) {
      await upsertMayChallengeCheckIn({
        profileId: ctx.profileId,
        bookingId: id,
        classStartsAtIso: ctx.classStartsAt,
      });
      void awardClassesAttendedBadges(ctx.profileId);
      toast.success(manualCheckInToastMessage(row?.memberRole), {
        duration: 3000,
        className:
          "!border-emerald-600/30 !bg-emerald-600 !px-4 !py-3 !text-sm !font-semibold !text-white",
      });
    } else if (status === "confirmed") {
      toast.success("Reverted to confirmed");
    }
    await onUpdated();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading roster…
      </div>
    );
  }

  if (roster.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No bookings for this class.</p>
    );
  }

  return (
    <ul className={cn("divide-y divide-border", compact && "text-sm")}>
      {roster.map((b) => {
        const isIn = b.status === "attended";
        const isNoShow = b.status === "no-show";
        const isCancelled = b.status === "cancelled";
        return (
          <li
            key={b.id}
            className={cn(
              "flex flex-wrap items-center gap-2 py-2.5 sm:flex-nowrap",
              compact ? "py-2" : "py-3",
            )}
          >
            <CheckInRosterMemberAvatar row={b} />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
                <span className="min-w-0 truncate">{b.member}</span>
                <RosterAddonPills
                  mat={b.matAddon}
                  towel={b.towelAddon}
                  cafe={b.hasSageCredit}
                />
              </p>
              {!compact ? (
                <p className="truncate text-xs text-muted-foreground">{b.creditLabel}</p>
              ) : null}
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <CheckInRosterStatusPill status={b.status} />
              {isIn ? (
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={() => void updateBookingStatus(b.id, "confirmed")}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted sm:flex-none"
                >
                  <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Undo
                </button>
              ) : isCancelled ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={() => void updateBookingStatus(b.id, "attended")}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:flex-none",
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
                  Check in
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
