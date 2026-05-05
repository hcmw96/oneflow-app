import { type ReactNode, useEffect, useState } from "react";
import { BottomNav } from "./BottomNav";
import { WhatsAppFab } from "./WhatsAppFab";
import { supabase } from "@/lib/supabase";
import logo from "@/assets/oneflow-logo.webp";

export function AppShell({ children }: { children: ReactNode }) {
  const [showAdminCta, setShowAdminCta] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const r = (data?.role as string | undefined) ?? null;
      const rl = (r ?? "").toLowerCase();
      setShowAdminCta(rl === "director" || rl === "management" || rl === "guide");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col safe-bottom-nav">
        <header className="safe-top sticky top-0 z-30 flex flex-col border-b border-border/60 bg-background/95 backdrop-blur">
          {showAdminCta && (
            <div className="border-b border-primary/20 bg-primary-soft/40 px-4 py-2">
              <button
                type="button"
                onClick={() => window.location.assign("/admin")}
                className="w-full rounded-lg border border-primary/25 bg-background/80 py-2 text-center text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary/10"
              >
                Admin Dashboard
              </button>
            </div>
          )}
          <div className="flex items-center justify-center px-5 pb-3 pt-2">
            <img src={logo} alt="One Flow" className="h-9 w-auto" />
          </div>
        </header>
        {children}
      </div>
      <WhatsAppFab />
      <BottomNav />
    </div>
  );
}
