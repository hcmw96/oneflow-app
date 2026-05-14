import type { SupabaseClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

/** "The Sage" café product — roster café pill when member has active credit. */
export const THE_SAGE_PRODUCT_ID = "e8ea33ba-0283-41a1-b2c9-60a0b38653e0";

const SAGE_PILL = "#a3b693";

const pillClass =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white";

type SageCreditRow = {
  profile_id: string | null;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
  product_id?: string | null;
  product_name?: string | null;
};

function isActiveSageCredit(row: SageCreditRow, nowMs: number): boolean {
  if (row.expires_at) {
    const t = new Date(row.expires_at).getTime();
    if (Number.isFinite(t) && t <= nowMs) return false;
  }
  if (row.is_unlimited) return true;
  const rem = Number(row.credits_remaining);
  return Number.isFinite(rem) && rem > 0;
}

/** Profile IDs with an active Sage café credit (product_id OR product_name ILIKE '%sage%'). */
export async function fetchTheSageCreditProfileIds(client: SupabaseClient): Promise<Set<string>> {
  const nowMs = Date.now();
  const [byId, byName] = await Promise.all([
    client
      .from("user_credits")
      .select("profile_id, credits_remaining, is_unlimited, expires_at, product_id, product_name")
      .eq("product_id", THE_SAGE_PRODUCT_ID),
    client
      .from("user_credits")
      .select("profile_id, credits_remaining, is_unlimited, expires_at, product_id, product_name")
      .ilike("product_name", "%sage%"),
  ]);

  if (byId.error) console.error(byId.error);
  if (byName.error) console.error(byName.error);

  const out = new Set<string>();
  for (const raw of [...(byId.data ?? []), ...(byName.data ?? [])]) {
    const row = raw as SageCreditRow;
    if (!row.profile_id || !isActiveSageCredit(row, nowMs)) continue;
    out.add(String(row.profile_id));
  }
  return out;
}

export function RosterAddonPills({
  mat,
  towel,
  cafe,
  className,
}: {
  mat: boolean;
  towel: boolean;
  cafe: boolean;
  className?: string;
}) {
  if (!mat && !towel && !cafe) return null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {mat ? (
        <span className={pillClass} style={{ backgroundColor: SAGE_PILL }} title="Mat add-on">
          <span aria-hidden>🧘</span> Mat
        </span>
      ) : null}
      {towel ? (
        <span className={pillClass} style={{ backgroundColor: SAGE_PILL }} title="Towel add-on">
          <span aria-hidden>🪣</span> Towel
        </span>
      ) : null}
      {cafe ? (
        <span className={pillClass} style={{ backgroundColor: SAGE_PILL }} title="The Sage café">
          <span aria-hidden>☕</span> Café
        </span>
      ) : null}
    </span>
  );
}
