import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  className?: string;
};

/** Copyable Yoco checkout ID — matches Yoco merchant CSV "Online Reference". */
export function CopyableCheckoutId({ id, className }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success("Checkout ID copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="Copy checkout ID (Yoco CSV: Online Reference)"
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-left font-mono text-[11px] text-foreground transition-colors hover:bg-muted/60",
        className,
      )}
    >
      <span className="truncate">{id}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-[#a3b693]" aria-hidden />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
      )}
    </button>
  );
}
