import type { SupabaseClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

/** "The Sage" café product — roster café pill when member has active credit. */
export const THE_SAGE_PRODUCT_ID = "e8ea33ba-0283-41a1-b2c9-60a0b38653e0";

const SAGE_PILL = "#a3b693";

const pillClass =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white";

/** Single query: profile IDs with The Sage credit (credits left or unlimited). */
export async function fetchTheSageCreditProfileIds(
  client: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await client
    .from("user_credits")
    .select("profile_id")
    .eq("product_id", THE_SAGE_PRODUCT_ID)
    .or("is_unlimited.eq.true,credits_remaining.gt.0");

  if (error) {
    console.error(error);
    return new Set();
  }

  return new Set(
    (data ?? [])
      .map((r) => (r as { profile_id: string | null }).profile_id)
      .filter((id): id is string => Boolean(id)),
  );
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
