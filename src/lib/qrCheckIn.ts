const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Extract booking `qr_token` from raw scan text (UUID, URL, or noisy reads). */
export function parseQrCheckInToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase();

  const compact = trimmed.replace(/\s+/g, "");
  if (UUID_RE.test(compact)) return compact.toLowerCase();

  const match = trimmed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  if (match?.[0]) return match[0].toLowerCase();

  return null;
}
