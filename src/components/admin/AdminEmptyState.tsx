import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SAGE = "#a3b693";

type Props = {
  title: string;
  description?: string;
  /** Primary navigation (preferred for SPA navigation). */
  actionTo?: string;
  actionLabel?: string;
  /** Primary button (e.g. opens a dialog). */
  onAction?: () => void;
  className?: string;
};

export function AdminEmptyState({
  title,
  description,
  actionTo,
  actionLabel,
  onAction,
  className,
}: Props) {
  const hasAction = Boolean((actionTo && actionLabel) || (onAction && actionLabel));

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center",
        className,
      )}
    >
      <div className="max-w-md space-y-2">
        <p className="font-display text-base font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {hasAction ? (
        actionTo && actionLabel ? (
          <Button
            asChild
            className="w-full max-w-xs text-white hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: SAGE }}
          >
            <Link to={actionTo}>{actionLabel}</Link>
          </Button>
        ) : onAction && actionLabel ? (
          <Button
            type="button"
            onClick={onAction}
            className="w-full max-w-xs text-white hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: SAGE }}
          >
            {actionLabel}
          </Button>
        ) : null
      ) : null}
    </div>
  );
}
