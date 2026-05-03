import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: ReactNode;
  delta?: string;
  positive?: boolean;
  icon?: ReactNode;
}

export function StatCard({ label, value, delta, positive, icon }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <p className="mt-3 font-display text-3xl font-bold leading-none">{value}</p>
      {delta && (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            positive ? "text-success" : "text-muted-foreground",
          )}
        >
          {delta}
        </p>
      )}
    </div>
  );
}
