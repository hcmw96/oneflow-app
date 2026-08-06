import { CLASS_TYPE_BADGE_CLASS } from "@/lib/allowedClassTypes";
import { cn } from "@/lib/utils";

type Props = {
  /** Display label from `displayClassType()` */
  type: string;
  className?: string;
  /** Larger, more prominent tag (schedule cards). */
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
} as const;

/** Class-type label pill — shared muted sage style (colour lives on the card stripe/tint). */
export function TypeBadge({ type, className, size = "md" }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold uppercase tracking-wide",
        sizeClass[size],
        CLASS_TYPE_BADGE_CLASS,
        className,
      )}
    >
      {type}
    </span>
  );
}
