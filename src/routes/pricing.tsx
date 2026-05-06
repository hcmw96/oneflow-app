import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getUser, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Buy A Pass — One Flow" },
      { name: "description", content: "Class packs and passes for One Flow." },
    ],
  }),
  component: PricingPage,
});

type ProductCategory = "yoga" | "wellzone" | "all_access";

type ProductRow = {
  id: string;
  name: string;
  price_zar: number;
  credit_count: number | null;
  description: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  category: string | null;
  allowed_class_types: string[] | null;
};

const ACCORDION_SECTIONS: { category: ProductCategory; title: string }[] = [
  { category: "yoga", title: "CLASS PACKS (YOGA, SCULPT & PILATES)" },
  { category: "wellzone", title: "WELLZONE (SAUNA, PLUNGE & SAUNA JOURNEY)" },
  { category: "all_access", title: "ALL ACCESS (YOGA, SCULPT & WELLZONE)" },
];

function formatPriceZar(zar: number) {
  const n = Number(zar);
  if (Number.isNaN(n)) return "R—";
  return `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

/** Credits line for display; omit row when null (unknown count). */
function creditsLine(p: ProductRow): string | null {
  const raw = p.credit_count;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n >= 999) return "Unlimited";
  if (n === 1) return "1 class";
  return `${Math.trunc(n)} classes`;
}

function dedupeProductsById(rows: ProductRow[]): ProductRow[] {
  const byId = new Map<string, ProductRow>();
  for (const row of rows) {
    if (row?.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function PricingPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [checkoutSlow, setCheckoutSlow] = useState(false);
  const [openSections, setOpenSections] = useState<Record<ProductCategory, boolean>>({
    yoga: true,
    wellzone: false,
    all_access: false,
  });

  const itemsByCategory = useMemo(() => {
    const yoga: ProductRow[] = [];
    const wellzone: ProductRow[] = [];
    const all_access: ProductRow[] = [];

    for (const p of products) {
      if (p.category === "yoga") yoga.push(p);
      else if (p.category === "wellzone") wellzone.push(p);
      else if (p.category === "all_access") all_access.push(p);
    }

    const bySortOrder = (a: ProductRow, b: ProductRow) =>
      Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
      Number(a.price_zar) - Number(b.price_zar);

    yoga.sort(bySortOrder);
    wellzone.sort(bySortOrder);
    all_access.sort(bySortOrder);

    return { yoga, wellzone, all_access };
  }, [products]);

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .eq("is_addon", false)
        .order("sort_order");

      if (cancelled) return;

      if (error) {
        console.error(error);
        toast.error("Could not load products");
        setProducts([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as ProductRow[];
      setProducts(dedupeProductsById(rows));
      setLoading(false);
    }

    void fetchOnce();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!buyingId) {
      setCheckoutSlow(false);
      return;
    }
    setCheckoutSlow(false);
    const t = window.setTimeout(() => setCheckoutSlow(true), 5000);
    return () => window.clearTimeout(t);
  }, [buyingId]);

  const toggleSection = (category: ProductCategory) => {
    setOpenSections((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const buyNow = async (packId: string) => {
    if (buyingId) return;
    const user = await getUser();
    if (!user) {
      toast.error("Please sign in to purchase");
      window.location.assign("/auth");
      return;
    }

    setBuyingId(packId);
    setCheckoutSlow(false);
    const origin = window.location.origin;
    const { data, error } = await supabase.functions.invoke("yoco-checkout", {
      body: {
        pack_id: packId,
        profile_id: user.id,
        success_url: `${origin}/payment/success?pack_id=${packId}&profile_id=${user.id}`,
        cancel_url: `${origin}/pricing`,
      },
    });
    setBuyingId(null);

    if (error) {
      toast.error(error.message ?? "Checkout failed");
      setBuyingId(null);
      setCheckoutSlow(false);
      return;
    }

    const redirect =
      (data as { redirectUrl?: string; redirect_url?: string } | null)?.redirectUrl ??
      (data as { redirect_url?: string })?.redirect_url;
    if (!redirect || typeof redirect !== "string") {
      toast.error("No payment link returned");
      setBuyingId(null);
      setCheckoutSlow(false);
      return;
    }
    window.location.href = redirect;
  };

  return (
    <AppShell>
      <div className="min-h-[100dvh] bg-gradient-to-b from-[#f4f7f0] to-background dark:from-background dark:to-background">
        <header className="safe-top flex items-center gap-3 px-5 pt-4 pb-2">
          <button
            type="button"
            onClick={() => router.history.back()}
            aria-label="Back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#c5d4b8]/80 bg-card shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </header>

        <main className="relative flex-1 space-y-4 px-5 pb-6 pt-0" aria-busy={!!buyingId}>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#a3b693] dark:text-foreground">
            Buy A Pass
          </h1>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2
                className="h-8 w-8 animate-spin text-[#a3b693]"
                aria-label="Loading products"
              />
            </div>
          ) : products.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No packs available yet.
            </p>
          ) : (
            <div className="space-y-3">
              {ACCORDION_SECTIONS.map(({ category, title }) => {
                const open = openSections[category];
                const items = itemsByCategory[category];
                const panelId = `pricing-panel-${category}`;
                const headerId = `pricing-header-${category}`;

                return (
                  <div
                    key={category}
                    className="overflow-hidden rounded-2xl border border-[#c5d4b8]/70 bg-card shadow-sm dark:border-border"
                  >
                    <button
                      type="button"
                      id={headerId}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggleSection(category)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#e8efe3]/60 dark:hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1 truncate font-display text-[11px] font-bold uppercase leading-snug tracking-[0.12em] text-[#a3b693] dark:text-foreground sm:text-xs">
                        {title}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 text-[#a3b693] transition-transform duration-200 dark:text-primary",
                          open && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </button>
                    {open ? (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={headerId}
                        className="border-t border-[#c5d4b8]/50 bg-[#fafbf8]/80 px-3 py-4 dark:border-border dark:bg-card/50"
                      >
                        {items.length === 0 ? (
                          <p className="px-1 py-4 text-center text-sm text-muted-foreground">
                            No packs in this category.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-3">
                            {items.map((p) => {
                              const credits = creditsLine(p);
                              return (
                                <li
                                  key={p.id}
                                  className={cn(
                                    "rounded-xl border border-[#c5d4b8]/60 bg-card p-4 shadow-sm",
                                    "dark:border-border",
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold leading-snug text-[#a3b693] dark:text-foreground">
                                      {p.name}
                                    </h3>
                                    <p className="shrink-0 font-display text-base font-bold tabular-nums text-[#a3b693] dark:text-foreground">
                                      {formatPriceZar(p.price_zar)}
                                    </p>
                                  </div>
                                  {credits ? (
                                    <p className="mt-1 text-sm font-medium text-[#a3b693] dark:text-primary">
                                      {credits}
                                    </p>
                                  ) : null}
                                  {p.description ? (
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                      {p.description}
                                    </p>
                                  ) : null}
                                  <div className="mt-4 space-y-2">
                                    <button
                                      type="button"
                                      disabled={buyingId !== null}
                                      onClick={() => void buyNow(p.id)}
                                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#a3b693] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60 dark:bg-primary dark:text-primary-foreground"
                                    >
                                      {buyingId === p.id ? (
                                        <>
                                          <Loader2
                                            className="h-4 w-4 animate-spin shrink-0"
                                            aria-hidden
                                          />
                                          <span>Redirecting…</span>
                                        </>
                                      ) : (
                                        "Buy Now"
                                      )}
                                    </button>
                                    {buyingId === p.id ? (
                                      <p className="text-center text-xs text-muted-foreground">
                                        Redirecting to secure payment…
                                        {checkoutSlow ? (
                                          <span className="mt-1 block font-medium text-foreground">
                                            Still loading — please wait.
                                          </span>
                                        ) : null}
                                      </p>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Questions?{" "}
            <Link
              to="/me"
              className="font-medium text-[#a3b693] underline-offset-2 hover:underline dark:text-primary"
            >
              Contact us from your profile
            </Link>
            .
          </p>
        </main>
      </div>
    </AppShell>
  );
}
