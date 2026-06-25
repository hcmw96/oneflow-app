export type LiveClassRow = {
  id: string;
  starts_at: string;
  ends_at: string;
};

/** Class currently running (started, not yet ended). */
export function isClassInProgress(row: LiveClassRow, nowMs: number = Date.now()): boolean {
  const start = new Date(row.starts_at).getTime();
  const end = new Date(row.ends_at).getTime();
  return start <= nowMs && nowMs < end;
}

/** Class has fully ended. */
export function isClassEnded(row: LiveClassRow, nowMs: number = Date.now()): boolean {
  return new Date(row.ends_at).getTime() <= nowMs;
}

/** In progress, then upcoming, then ended — all chronological within each group. */
export function orderClassesForLiveDay<T extends LiveClassRow>(
  classes: T[],
  nowMs: number = Date.now(),
): T[] {
  const sorted = [...classes].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
  const inProgress: T[] = [];
  const upcoming: T[] = [];
  const ended: T[] = [];
  for (const c of sorted) {
    if (isClassInProgress(c, nowMs)) inProgress.push(c);
    else if (new Date(c.starts_at).getTime() > nowMs) upcoming.push(c);
    else ended.push(c);
  }
  return [...inProgress, ...upcoming, ...ended];
}

/** In-progress class, or next starting, or last class of the day. */
export function pickFocusClassId(
  classes: LiveClassRow[],
  nowMs: number = Date.now(),
): string | null {
  if (classes.length === 0) return null;

  const sorted = [...classes].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  const inProgress = sorted.find((c) => isClassInProgress(c, nowMs));
  if (inProgress) return inProgress.id;

  const upcoming = sorted.find((c) => new Date(c.starts_at).getTime() > nowMs);
  if (upcoming) return upcoming.id;

  return sorted[sorted.length - 1]!.id;
}
