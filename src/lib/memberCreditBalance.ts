import { isBookableClassCredit, type ClassCreditPickSource } from "@/lib/bookingCredits";
import { normalizeProductCategoryKey } from "@/lib/productCategories";

/** Customer-facing credit types shown on home / me / pricing. */
export const MEMBER_CREDIT_DISPLAY_TYPES = [
  { key: "yoga", label: "Yoga", categories: ["yoga"] as const },
  { key: "wellzone", label: "Wellzone", categories: ["wellzone"] as const },
  { key: "all_access", label: "All Access", categories: ["all_access"] as const },
  { key: "power", label: "Power", categories: ["power"] as const },
] as const;

export type MemberCreditDisplayKey = (typeof MEMBER_CREDIT_DISPLAY_TYPES)[number]["key"];

export type MemberCreditRow = ClassCreditPickSource & {
  credits_remaining?: number | null;
  is_unlimited?: boolean | null;
  expires_at?: string | null;
};

export type MemberCreditTypeBalance = {
  key: MemberCreditDisplayKey;
  label: string;
  hasPass: boolean;
  unlimited: boolean;
  remaining: number;
  /** Pricing accordion category to open when buying. */
  pricingCategory: MemberCreditDisplayKey;
};

function creditActive(row: MemberCreditRow, nowMs: number): boolean {
  if (!isBookableClassCredit(row)) return false;
  const exp = row.expires_at;
  if (exp != null && new Date(exp).getTime() <= nowMs) return false;
  if (row.is_unlimited) return true;
  const rem = Number(row.credits_remaining ?? 0);
  return Number.isFinite(rem) && rem > 0;
}

export function summarizeMemberCreditTypes(
  rows: MemberCreditRow[],
  nowMs: number = Date.now(),
): MemberCreditTypeBalance[] {
  const active = rows.filter((r) => creditActive(r, nowMs));

  return MEMBER_CREDIT_DISPLAY_TYPES.map(({ key, label, categories }) => {
    const catSet = new Set(categories.map((c) => normalizeProductCategoryKey(c)));
    const matching = active.filter((r) =>
      catSet.has(normalizeProductCategoryKey(r.category)),
    );
    const unlimited = matching.some((r) => Boolean(r.is_unlimited));
    const remaining = unlimited
      ? 0
      : matching.reduce((sum, r) => {
          const n = Number(r.credits_remaining ?? 0);
          return sum + (Number.isFinite(n) ? Math.max(0, n) : 0);
        }, 0);

    return {
      key,
      label,
      hasPass: matching.length > 0,
      unlimited,
      remaining,
      pricingCategory: key,
    };
  });
}

export function memberCreditBalanceLabel(row: MemberCreditTypeBalance): string {
  if (!row.hasPass) return "";
  if (row.unlimited) return "Unlimited";
  const n = row.remaining;
  return n === 1 ? "1 left" : `${n} left`;
}
