import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatRand } from "@/lib/format";

export const Route = createFileRoute("/packages")({
  component: PackagesPage,
});

type Pack = {
  id: string;
  name: string;
  category: "Class Packs" | "Wellzone" | "Power Packs";
  description: string;
  priceCents: number;
  badge?: string;
};

const DEFAULT_PACKS: Pack[] = [
  {
    id: "p1",
    name: "6 Class Pack",
    category: "Class Packs",
    description: "Six classes, valid 3 months.",
    priceCents: 90000,
  },
  {
    id: "p2",
    name: "12 Class Pack",
    category: "Class Packs",
    description: "Twelve classes, valid 6 months.",
    priceCents: 168000,
    badge: "Popular",
  },
  {
    id: "p5",
    name: "Wellzone Unlimited",
    category: "Wellzone",
    description: "Unlimited Wellzone access, 30 days.",
    priceCents: 120000,
  },
  {
    id: "p9",
    name: "Seeker",
    category: "Power Packs",
    description: "All studio classes, monthly.",
    priceCents: 195000,
  },
];

function PackagesPage() {
  const router = useRouter();
  const grouped = DEFAULT_PACKS.reduce<Record<string, Pack[]>>((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {});

  return (
    <AppShell>
      <header className="safe-top flex items-center gap-3 px-5 pt-3 pb-3">
        <button
          onClick={() => router.history.back()}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-2xl font-semibold">Buy a pass</h1>
      </header>

      <main className="flex-1 space-y-6 px-5 pt-2">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h2 className="mb-2 font-display text-lg font-semibold">{category}</h2>
            <div className="space-y-2.5">
              {items.map((p) => (
                <article
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-semibold leading-tight">{p.name}</h3>
                      {p.badge && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-base font-semibold tabular-nums">{formatRand(p.priceCents)}</p>
                    <button className="mt-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                      Buy
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </AppShell>
  );
}
