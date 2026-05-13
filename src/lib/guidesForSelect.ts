import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** Row shape for class guide dropdowns: `guide_id` is `guides.id`. */
export type GuideSelectRow = {
  guide_id: string;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Loads active guides with profile names — equivalent to:
 * SELECT g.id, p.first_name, p.last_name FROM guides g
 * JOIN profiles p ON p.id = g.profile_id WHERE g.is_active = true ORDER BY p.first_name
 *
 * Uses two round-trips so RLS/embed quirks on `guides → profiles` do not drop rows.
 */
export async function fetchGuidesForClassSelect(): Promise<{
  data: GuideSelectRow[];
  error: PostgrestError | null;
}> {
  const gRes = await supabase.from("guides").select("id, profile_id").eq("is_active", true);

  if (gRes.error) {
    return { data: [], error: gRes.error };
  }

  const guideRows = (gRes.data ?? []) as { id: string; profile_id: string }[];
  if (guideRows.length === 0) {
    return { data: [], error: null };
  }

  const profileIds = [...new Set(guideRows.map((r) => r.profile_id).filter(Boolean))];
  const pRes = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", profileIds);

  if (pRes.error) {
    return { data: [], error: pRes.error };
  }

  const pmap = new Map(
    (pRes.data ?? []).map((p) => [String((p as { id: string }).id), p as { first_name: string | null; last_name: string | null }]),
  );

  const data: GuideSelectRow[] = guideRows.map((g) => {
    const p = pmap.get(String(g.profile_id));
    return {
      guide_id: String(g.id),
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
    };
  });

  data.sort((a, b) =>
    (a.first_name ?? "").localeCompare(b.first_name ?? "", undefined, { sensitivity: "base" }),
  );

  return { data, error: null };
}

