import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Coffee, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { getUser } from "@/lib/supabase";
import {
  ensureCafeQrToken,
  fetchCafeCredits,
  sumCafeCreditsRemaining,
  type CafeCreditRow,
} from "@/lib/cafeCredits";
import { isUserCreditActiveNow, userCreditPillLabel } from "@/lib/activeUserCredits";

export const Route = createFileRoute("/cafe")({
  component: CafePage,
});

const SAGE = "#a3b693";

function CafePage() {
  const [loading, setLoading] = useState(true);
  const [cafeRows, setCafeRows] = useState<CafeCreditRow[]>([]);
  const [qrToken, setQrToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setCafeRows([]);
      setQrToken(null);
      setLoading(false);
      return;
    }

    const [rows, token] = await Promise.all([
      fetchCafeCredits(user.id),
      ensureCafeQrToken(user.id),
    ]);

    setCafeRows(rows);
    setQrToken(token);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cafeBalance = useMemo(() => sumCafeCreditsRemaining(cafeRows), [cafeRows]);
  const hasUnlimited = cafeBalance === -1;
  const activeRows = cafeRows.filter((r) => isUserCreditActiveNow(r));

  return (
    <AppShell>
      <header className="safe-top px-5 pt-3 pb-2">
        <h1 className="font-display text-2xl font-semibold">Café</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Show this QR at the café to redeem your credits.
        </p>
      </header>

      <main className="flex-1 space-y-5 px-5 pt-4 pb-6">
        {loading ? (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="mx-auto h-[220px] w-[220px] rounded-2xl" />
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card px-5 py-5">
              <div className="flex items-center gap-2">
                <Coffee className="h-5 w-5" style={{ color: SAGE }} aria-hidden />
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Café credits
                </span>
              </div>
              <p className="mt-3 font-display text-5xl font-extrabold leading-none tabular-nums">
                {hasUnlimited ? "∞" : cafeBalance}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {hasUnlimited
                  ? "Unlimited café credits active"
                  : cafeBalance === 1
                    ? "credit available"
                    : "credits available"}
              </p>
              {activeRows.length > 0 ? (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {activeRows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl bg-muted/40 px-3 py-2 text-sm font-medium"
                    >
                      {userCreditPillLabel(row)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No active café credits. Ask the studio to add a café package to your account.
                </p>
              )}
            </section>

            {qrToken && (hasUnlimited || cafeBalance > 0) ? (
              <section className="flex flex-col items-center rounded-2xl border border-border bg-card px-4 py-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <QrCode className="h-4 w-4" style={{ color: SAGE }} aria-hidden />
                  Your café QR
                </div>
                <div className="flex min-h-[200px] min-w-[200px] items-center justify-center rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <QRCodeSVG
                    value={qrToken}
                    size={200}
                    level="M"
                    includeMargin
                    title="Café check-in code"
                    className="h-[200px] w-[200px] max-w-full"
                  />
                </div>
                <p className="mt-4 max-w-[280px] text-center text-sm text-muted-foreground">
                  Staff scan this to apply your café credits. One scan per order, as per studio
                  policy.
                </p>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
                Top up café credits at the studio to unlock your personal QR code.
              </section>
            )}

            <Link
              to="/"
              className="block rounded-xl border border-border bg-background px-4 py-3 text-center text-sm font-medium"
            >
              ← Back to home
            </Link>
          </>
        )}
      </main>
    </AppShell>
  );
}
