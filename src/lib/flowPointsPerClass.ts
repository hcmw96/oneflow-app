import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches `studio_settings.flow_points_per_class` and the DB attend trigger default. */
export async function fetchFlowPointsPerClass(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("studio_settings")
    .select("value")
    .eq("key", "flow_points_per_class")
    .maybeSingle();
  const n = Math.floor(Number((data as { value?: string } | null)?.value));
  return Number.isFinite(n) && n > 0 ? n : 10;
}
