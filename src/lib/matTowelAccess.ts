import { supabase } from "@/lib/supabase";
import { isUserCreditActiveNow, type UserCreditPillSource } from "@/lib/activeUserCredits";

export type MatTowelAccessRow = UserCreditPillSource & {
  id: string;
  category: string | null;
  mat_access?: boolean | null;
  towel_access?: boolean | null;
};

export function isMatTowelAccessCredit(row: {
  category?: string | null;
  mat_access?: boolean | null;
  towel_access?: boolean | null;
}): boolean {
  if (row.mat_access === true || row.towel_access === true) return true;
  return (row.category ?? "").trim().toLowerCase() === "mat_towel";
}

function isAccessRowActive(row: MatTowelAccessRow, nowMs = Date.now()): boolean {
  if (row.expires_at) {
    const t = new Date(row.expires_at).getTime();
    if (Number.isFinite(t) && t <= nowMs) return false;
  }
  if (row.mat_access === true || row.towel_access === true) return true;
  return isUserCreditActiveNow(row, nowMs);
}

export function hasActiveMatAccess(rows: MatTowelAccessRow[], nowMs = Date.now()): boolean {
  return rows.some((r) => r.mat_access === true && isAccessRowActive(r, nowMs));
}

export function hasActiveTowelAccess(rows: MatTowelAccessRow[], nowMs = Date.now()): boolean {
  return rows.some((r) => r.towel_access === true && isAccessRowActive(r, nowMs));
}

function activeAccessLabels(
  rows: MatTowelAccessRow[],
  kind: "mat" | "towel",
  fallback: string,
  nowMs = Date.now(),
): string[] {
  const out: string[] = [];
  const flag = kind === "mat" ? "mat_access" : "towel_access";
  for (const row of rows) {
    if (row[flag] !== true || !isAccessRowActive(row, nowMs)) continue;
    const name = (row.product_name ?? "").trim() || fallback;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

export function activeMatAccessLabels(rows: MatTowelAccessRow[], nowMs = Date.now()): string[] {
  return activeAccessLabels(rows, "mat", "Mat storage", nowMs);
}

export function activeTowelAccessLabels(rows: MatTowelAccessRow[], nowMs = Date.now()): string[] {
  return activeAccessLabels(rows, "towel", "Towel service", nowMs);
}

export async function fetchMatTowelAccess(profileId: string): Promise<MatTowelAccessRow[]> {
  const { data, error } = await supabase
    .from("user_credits")
    .select(
      "id, product_name, credits_remaining, is_unlimited, expires_at, category, mat_access, towel_access",
    )
    .eq("profile_id", profileId);

  if (error) {
    console.error("fetchMatTowelAccess", error);
    return [];
  }

  return (data ?? [])
    .filter((raw) => isMatTowelAccessCredit(raw as MatTowelAccessRow))
    .map((raw) => raw as MatTowelAccessRow);
}
