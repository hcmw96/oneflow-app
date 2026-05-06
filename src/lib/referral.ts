import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "oneflow_ref";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function captureReferrerFromSearch(search: string) {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    const ref = params.get("ref");
    if (ref && UUID_RE.test(ref)) {
      sessionStorage.setItem(STORAGE_KEY, ref);
    }
  } catch {
    /* ignore */
  }
}

export async function applyStoredReferrerToProfile(userId: string) {
  const ref = sessionStorage.getItem(STORAGE_KEY);
  if (!ref || !UUID_RE.test(ref) || ref === userId) return;

  const { data: row, error: selErr } = await supabase
    .from("profiles")
    .select("referred_by")
    .eq("id", userId)
    .maybeSingle();

  if (selErr || (row as { referred_by?: string | null } | null)?.referred_by) return;

  const { error } = await supabase.from("profiles").update({ referred_by: ref }).eq("id", userId);

  if (!error) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
