import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, Check, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/payment/success")({
  head: () => ({
    meta: [{ title: "Payment successful — One Flow" }],
  }),
  component: PaymentSuccessPage,
});

type BalanceState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error" }
  | { status: "ready"; hasUnlimited: boolean; totalCredits: number };

function PaymentSuccessPage() {
  const [balance, setBalance] = useState<BalanceState>({ status: "loading" });

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBalance({ status: "guest" });
        return;
      }

      const { data, error } = await supabase
        .from("user_credits")
        .select("credits_remaining, is_unlimited")
        .eq("profile_id", user.id);

      if (error) {
        console.error(error);
        setBalance({ status: "error" });
        return;
      }

      let total = 0;
      let hasUnlimited = false;
      for (const row of data ?? []) {
        if (row.is_unlimited === true) {
          hasUnlimited = true;
          continue;
        }
        total += Number(row.credits_remaining ?? 0);
      }
      setBalance({ status: "ready", hasUnlimited, totalCredits: total });
    })();
  }, []);

  const balanceLine =
    balance.status === "ready"
      ? balance.hasUnlimited
        ? balance.totalCredits > 0
          ? `∞ unlimited · ${balance.totalCredits} pack credits`
          : "∞ unlimited"
        : `${balance.totalCredits} credits`
      : null;

  return (
    <AppShell>
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-full bg-[#22c55e]/15 ring-4 ring-[#22c55e]/25"
          aria-hidden
        >
          <Check className="h-14 w-14 stroke-[2.5] text-[#16a34a]" strokeLinecap="round" strokeLinejoin="round" />
        </div>

        <h1 className="mt-8 font-display text-3xl font-bold tracking-tight text-[#3d4f36] dark:text-foreground">
          Payment Successful!
        </h1>

        <div className="mt-10 w-full rounded-2xl border border-[#c5d4b8]/70 bg-[#f4f7f0]/80 p-6 dark:border-border dark:bg-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current credit balance</p>
          {balance.status === "loading" ? (
            <div className="mt-4 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#4a6b3c]" aria-label="Loading balance" />
            </div>
          ) : balance.status === "guest" ? (
            <p className="mt-4 text-sm text-muted-foreground">Sign in to see your balance.</p>
          ) : balance.status === "error" ? (
            <p className="mt-4 text-sm text-muted-foreground">Could not load balance. It may still update shortly.</p>
          ) : (
            <p className="mt-3 font-display text-3xl font-bold tabular-nums text-[#2f3d2a] dark:text-foreground">
              {balanceLine}
            </p>
          )}
        </div>

        <Link
          to="/schedule"
          className="mt-10 inline-flex items-center justify-center gap-2 rounded-full bg-[#4a6b3c] px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 dark:bg-primary dark:text-primary-foreground"
        >
          <CalendarDays className="h-4 w-4" />
          Go to schedule
        </Link>
      </div>
    </AppShell>
  );
}
