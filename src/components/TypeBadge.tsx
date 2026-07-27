import { classTypeTheme } from "@/lib/classTypeTheme";
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

export function TypeBadge({ type, className, size = "md" }: Props) {
  const theme = classTypeTheme(type);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold uppercase tracking-wide",
        sizeClass[size],
        theme.tagBg,
        theme.tagText,
        className,
      )}
    >
      {type}
    </span>
  );
}
