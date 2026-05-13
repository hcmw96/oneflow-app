import { cn } from "@/lib/utils";
import {
  isUserCreditActiveNow,
  userCreditPillLabel,
  type GuideCreditPillRow,
} from "@/lib/activeUserCredits";

const PILL =
  "inline-flex max-w-full shrink-0 items-center rounded-full border border-[#c5d4b8]/90 bg-[#e8eee3] px-2 py-0.5 text-[10px] font-semibold leading-tight text-[#4a5a42]";

type Props = {
  credits: readonly GuideCreditPillRow[];
  className?: string;
  /** When set, each pill is a button and calls this (e.g. open assign dialog). */
  onPillClick?: () => void;
};

export function GuideActivePackagePills({ credits, className, onPillClick }: Props) {
  const active = credits.filter((c) => isUserCreditActiveNow(c));
  if (active.length === 0) return null;

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {active.map((c) => {
        const label = userCreditPillLabel(c);
        if (onPillClick) {
          return (
            <button
              key={c.id}
              type="button"
              className={cn(PILL, "cursor-pointer text-left hover:bg-[#dce5d4]")}
              onClick={(e) => {
                e.stopPropagation();
                onPillClick();
              }}
            >
              {label}
            </button>
          );
        }
        return (
          <span key={c.id} className={PILL} title={label}>
            {label}
          </span>
        );
      })}
    </span>
  );
}
