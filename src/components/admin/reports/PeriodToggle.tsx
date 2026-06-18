import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { PeriodMode } from "@/lib/reportsPeriod";

const SAGE_BG = "bg-[#e8efe3]/90";
const SAGE_BORDER = "border-[#c5d4b8]/80";

type Props = {
  mode: PeriodMode;
  customFrom: string;
  customTo: string;
  onModeChange: (mode: PeriodMode) => void;
  onCustomFromChange: (date: string) => void;
  onCustomToChange: (date: string) => void;
};

const MODE_LABELS: { value: PeriodMode; label: string }[] = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "custom", label: "Custom" },
];

export function PeriodToggle({
  mode,
  customFrom,
  customTo,
  onModeChange,
  onCustomFromChange,
  onCustomToChange,
}: Props) {
  return (
    <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (v === "daily" || v === "weekly" || v === "monthly" || v === "custom") {
            onModeChange(v);
          }
        }}
        className={cn("rounded-xl border p-1", SAGE_BORDER, SAGE_BG)}
        variant="outline"
        size="sm"
      >
        {MODE_LABELS.map((m) => (
          <ToggleGroupItem
            key={m.value}
            value={m.value}
            className={cn(
              "rounded-lg px-3 text-xs font-semibold data-[state=on]:bg-[#a3b693] data-[state=on]:text-white",
              "data-[state=off]:text-[#3d4f36]",
            )}
          >
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {mode === "custom" ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="h-9 w-36"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="h-9 w-36"
            aria-label="To date"
          />
        </div>
      ) : null}
    </div>
  );
}
