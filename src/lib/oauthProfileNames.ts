import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type ParsedOAuthName = { first_name: string | null; last_name: string | null };

/** Derive display names from Google / OIDC user_metadata. */
export function parseOAuthNameFromUser(user: User): ParsedOAuthName {
  const m = user.user_metadata ?? {};
  const given = typeof m.given_name === "string" ? m.given_name.trim() : "";
  const family = typeof m.family_name === "string" ? m.family_name.trim() : "";
  if (given || family) {
    return {
      first_name: given || null,
      last_name: family || null,
    };
  }
  const full =
    (typeof m.full_name === "string" && m.full_name.trim()) ||
    (typeof m.name === "string" && m.name.trim()) ||
    "";
  if (!full) return { first_name: null, last_name: null };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

/**
 * If profiles.first_name is empty, copy parsed OAuth names into profiles.
 * Safe for directors and all roles — only fills blanks.
 */
export async function ensureProfileNamesFromOAuth(user: User): Promise<void> {
  const { data: row, error } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("ensureProfileNamesFromOAuth select:", error);
    return;
  }

  const existing = (row?.first_name ?? "").trim();
  if (existing) return;

  const { first_name, last_name } = parseOAuthNameFromUser(user);
  if (!first_name && !last_name) return;

  const { data: updated, error: upErr } = await supabase
    .from("profiles")
    .update({
      first_name: first_name ?? null,
      last_name: last_name ?? null,
    })
    .eq("id", user.id)
    .select("id");

  if (upErr) {
    console.error("ensureProfileNamesFromOAuth update:", upErr);
    return;
  }
  if (updated && updated.length > 0) return;

  const { error: insErr } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? "",
    first_name: first_name ?? null,
    last_name: last_name ?? null,
    role: "customer",
  });
  if (insErr?.code === "23505") {
    await supabase
      .from("profiles")
      .update({
        first_name: first_name ?? null,
        last_name: last_name ?? null,
      })
      .eq("id", user.id);
    return;
  }
  if (insErr) console.error("ensureProfileNamesFromOAuth insert:", insErr);
}
