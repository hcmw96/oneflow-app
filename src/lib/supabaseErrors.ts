/**
 * Supabase PostgREST errors are plain objects with `message` and may not be `instanceof Error`.
 * Use this whenever surfacing Supabase failures in toasts so users never see a blank message.
 */
export function supabaseErrorMessage(error: unknown, fallback = "Please try again"): string {
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown };
    const msg = typeof e.message === "string" ? e.message.trim() : "";
    if (msg) {
      const details = typeof e.details === "string" ? e.details.trim() : "";
      const hint = typeof e.hint === "string" ? e.hint.trim() : "";
      const extra = [details, hint].filter(Boolean).join(" — ");
      return extra ? `${msg} (${extra})` : msg;
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}
