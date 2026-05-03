import { type ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, meta, actions }: Props) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(meta || actions) && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {meta}
          {actions}
        </div>
      )}
    </div>
  );
}
