export const STUDIO_TIMEZONE = "Africa/Johannesburg";

export function formatStudioEmailDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: STUDIO_TIMEZONE,
  });
}

export function formatStudioTime12Upper(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d
    .toLocaleTimeString("en-ZA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: STUDIO_TIMEZONE,
    })
    .toUpperCase();
}

export function formatStudioDateLong(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: STUDIO_TIMEZONE,
  });
}

export function formatStudioDateShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: STUDIO_TIMEZONE,
  });
}

export function formatEmailDateTime(value: unknown): { date: string; time: string } {
  const raw = String(value ?? "");
  const dt = raw ? new Date(raw) : new Date();
  return {
    date: formatStudioEmailDate(dt),
    time: formatStudioTime12Upper(dt),
  };
}
