import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** Row shape for class guide dropdowns: `guide_id` is `guides.id`. */
export type GuideSelectRow = {
  guide_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

type ProfileEmbed = {
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
} | null;

function oneProfile(raw: unknown): ProfileEmbed {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const x = raw[0] as ProfileEmbed | undefined;
    return x ?? null;
  }
  return raw as ProfileEmbed;
}

/**
 * Active guides with profile names for class forms — one round-trip via FK embed:
 * guides → profiles(profile_id) as `profile`.
 *
 * Dropdown: value = `guides.id`, label = first + last name; classes.guide_id + guide_name on save.
 */
export async function fetchGuidesForClassSelect(): Promise<{
  data: GuideSelectRow[];
  error: PostgrestError | null;
}> {
  const res = await supabase
    .from("guides")
    .select("id, profile:profile_id(first_name, last_name, avatar_url)")
    .eq("is_active", true);

  if (res.error) {
    return { data: [], error: res.error };
  }

  const data: GuideSelectRow[] = (res.data ?? []).map((row) => {
    const r = row as { id: string; profile?: unknown };
    const p = oneProfile(r.profile);
    return {
      guide_id: String(r.id),
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    };
  });

  data.sort((a, b) =>
    (a.first_name ?? "").localeCompare(b.first_name ?? "", undefined, { sensitivity: "base" }),
  );

  return { data, error: null };
}
