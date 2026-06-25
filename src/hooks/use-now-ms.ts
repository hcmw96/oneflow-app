import { useEffect, useState } from "react";

/** Ticks so live class lists re-order as the day progresses (default: every minute). */
export function useNowMs(tickMs = 60_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  return nowMs;
}
