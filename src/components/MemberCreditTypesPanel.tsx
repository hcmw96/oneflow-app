import { Link } from "@tanstack/react-router";
import { Ticket } from "lucide-react";
import {
  memberCreditBalanceLabel,
  type MemberCreditTypeBalance,
} from "@/lib/memberCreditBalance";

type Props = {
  balances: MemberCreditTypeBalance[];
  compact?: boolean;
};

export function MemberCreditTypesPanel({ balances, compact = false }: Props) {
  return (
    <div className={compact ? "space-y-2" : "rounded-2xl border border-border bg-card px-5 py-5"}>
      {!compact ? (
        <div className="mb-3 flex items-center gap-2">
          <Ticket className="h-4 w-4 text-[#a3b693]" />
          <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Your passes
          </span>
        </div>
      ) : null}

      <ul className="space-y-2">
        {balances.map((row) => {
          const balanceLabel = memberCreditBalanceLabel(row);
          return (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
            >
              <span className="text-sm font-semibold">{row.label}</span>
              {row.hasPass ? (
                <span className="text-sm font-medium text-[#4a6b3c]">{balanceLabel}</span>
              ) : (
                <Link
                  to="/pricing"
                  search={{ category: row.pricingCategory }}
                  className="rounded-full border border-[#a3b693] px-3 py-1 text-xs font-semibold text-[#a3b693] transition-opacity active:opacity-70"
                >
                  Buy
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
