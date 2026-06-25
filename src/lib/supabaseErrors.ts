export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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

/** Prefer the JSON `error` field from an edge function response over the generic invoke message. */
export async function edgeFunctionErrorMessage(
  error: unknown,
  data: unknown,
  fallback = "Please try again",
): Promise<string> {
  if (data && typeof data === "object") {
    const msg = String((data as { error?: unknown }).error ?? "").trim();
    if (msg) return msg;
  }
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as { error?: string };
        const msg = body?.error?.trim();
        if (msg) return msg;
      } catch {
        // ignore parse errors
      }
    }
  }
  return supabaseErrorMessage(error, fallback);
}
