import type { RosterRow } from "@/lib/checkInRoster";
import { rosterInitials } from "@/lib/checkInRoster";

export function CheckInRosterMemberAvatar({ row }: { row: RosterRow }) {
  if (row.avatarUrl) {
    return (
      <img src={row.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
      {rosterInitials(row.memberFirst, row.memberLast)}
    </div>
  );
}
