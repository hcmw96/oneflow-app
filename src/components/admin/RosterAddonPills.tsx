import type { SupabaseClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

const SAGE_PILL = "#a3b693";

const pillClass =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white";

type CreditAccessRow = {
  profile_id: string | null;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
  mat_access?: boolean | null;
  towel_access?: boolean | null;
  category?: string | null;
};

export type RosterMemberAddonAccess = {
  matProfileIds: Set<string>;
  towelProfileIds: Set<string>;
  cafeProfileIds: Set<string>;
};

function isActiveCredit(row: CreditAccessRow, nowMs: number): boolean {
  if (row.expires_at) {
    const t = new Date(row.expires_at).getTime();
    if (Number.isFinite(t) && t <= nowMs) return false;
  }
  if (row.is_unlimited) return true;
  const rem = Number(row.credits_remaining);
  return Number.isFinite(rem) && rem > 0;
}

/** Active mat / towel / café access from `user_credits` for check-in roster pills. */
export async function fetchRosterMemberAddonAccess(
  client: SupabaseClient,
): Promise<RosterMemberAddonAccess> {
  const nowMs = Date.now();
  const { data, error } = await client
    .from("user_credits")
    .select(
      "profile_id, credits_remaining, is_unlimited, expires_at, mat_access, towel_access, category",
    );

  if (error) {
    console.error("fetchRosterMemberAddonAccess", error);
    return {
      matProfileIds: new Set(),
      towelProfileIds: new Set(),
      cafeProfileIds: new Set(),
    };
  }

  const matProfileIds = new Set<string>();
  const towelProfileIds = new Set<string>();
  const cafeProfileIds = new Set<string>();

  for (const raw of data ?? []) {
    const row = raw as CreditAccessRow;
    const pid = row.profile_id ? String(row.profile_id) : "";
    if (!pid || !isActiveCredit(row, nowMs)) continue;

    if (row.mat_access === true) matProfileIds.add(pid);
    if (row.towel_access === true) towelProfileIds.add(pid);

    const cat = (row.category ?? "").trim().toLowerCase();
    if (cat === "cafe") {
      const rem = Number(row.credits_remaining);
      if (row.is_unlimited || (Number.isFinite(rem) && rem > 0)) {
        cafeProfileIds.add(pid);
      }
    }
  }

  return { matProfileIds, towelProfileIds, cafeProfileIds };
}

/** @deprecated Use fetchRosterMemberAddonAccess — café set only. */
export async function fetchTheSageCreditProfileIds(client: SupabaseClient): Promise<Set<string>> {
  const access = await fetchRosterMemberAddonAccess(client);
  return access.cafeProfileIds;
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
        <span className={pillClass} style={{ backgroundColor: SAGE_PILL }} title="Mat access">
          <span aria-hidden>🧘</span> Mat
        </span>
      ) : null}
      {towel ? (
        <span className={pillClass} style={{ backgroundColor: SAGE_PILL }} title="Towel access">
          <span aria-hidden>🪣</span> Towel
        </span>
      ) : null}
      {cafe ? (
        <span className={pillClass} style={{ backgroundColor: SAGE_PILL }} title="Café credits">
          <span aria-hidden>☕</span> Café
        </span>
      ) : null}
    </span>
  );
}
