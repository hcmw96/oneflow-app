import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Horizontal scroll on narrow viewports (admin tables). */
export function AdminTableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-[100vw] overflow-x-auto [-webkit-overflow-scrolling:touch] xl:max-w-none",
        "[@media(max-width:899px)]:-mx-4 [@media(max-width:899px)]:px-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
