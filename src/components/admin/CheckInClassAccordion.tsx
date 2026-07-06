import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckInRosterList } from "@/components/admin/CheckInRosterList";
import type { RosterRow } from "@/lib/checkInRoster";
import { cn } from "@/lib/utils";

export type CheckInClassSession = {
  key: string;
  label: string;
  time: string;
  total: number;
  attended: number;
  guideName?: string | null;
};

export function CheckInClassAccordion({
  session,
  roster,
  expanded,
  onExpandedChange,
  loading,
  onUpdated,
  openMinutesBefore,
}: {
  session: CheckInClassSession;
  roster: RosterRow[];
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  loading?: boolean;
  onUpdated: () => void | Promise<void>;
  openMinutesBefore?: number;
}) {
  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange}>
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
          expanded ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted",
        )}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-snug">{session.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {session.time} · {session.attended}/{session.total} checked in
          </p>
          {session.guideName ? (
            <p className="mt-1 text-[10px] font-medium text-[#4a5a42]">Guide · {session.guideName}</p>
          ) : null}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1.5">
        <div className="rounded-xl border border-border bg-background/80 px-2 py-1">
          <CheckInRosterList
            roster={roster}
            loading={loading}
            compact
            checkInStyle="checkbox"
            onUpdated={onUpdated}
            openMinutesBefore={openMinutesBefore}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
