export type CheckInClassRow = {
  id: string;
  starts_at: string;
  ends_at: string;
};

/** Class in progress, or next starting today, or last class of the day. */
export function pickNextUpcomingClassId(
  classes: CheckInClassRow[],
  nowMs: number = Date.now(),
): string | null {
  if (classes.length === 0) return null;

  const sorted = [...classes].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  const inProgress = sorted.find((c) => {
    const start = new Date(c.starts_at).getTime();
    const end = new Date(c.ends_at).getTime();
    return start <= nowMs && nowMs < end;
  });
  if (inProgress) return inProgress.id;

  const upcoming = sorted.find((c) => new Date(c.starts_at).getTime() >= nowMs);
  if (upcoming) return upcoming.id;

  return sorted[sorted.length - 1]!.id;
}
