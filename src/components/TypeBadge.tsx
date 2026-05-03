import { type ClassType } from "@/types/studio";
import { cn } from "@/lib/utils";

const styles: Record<ClassType, string> = {
  Yoga: "bg-primary-soft text-foreground",
  Sculpt: "bg-accent text-accent-foreground",
  Power: "bg-foreground text-background",
  Wellzone: "bg-secondary text-secondary-foreground",
  "Sauna Journey": "bg-warning/30 text-warning-foreground",
};

export function TypeBadge({ type, className }: { type: ClassType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles[type],
        className,
      )}
    >
      {type}
    </span>
  );
}
