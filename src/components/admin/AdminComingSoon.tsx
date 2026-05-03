import { Wrench } from "lucide-react";
import { PageHeader } from "./PageHeader";

export function AdminComingSoon({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Wrench className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <p className="text-sm text-muted-foreground">This feature is coming soon.</p>
      </div>
    </div>
  );
}
