import { type ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { WhatsAppFab } from "./WhatsAppFab";
import logo from "@/assets/oneflow-logo.webp";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col safe-bottom-nav">
        <header className="safe-top sticky top-0 z-30 flex items-center justify-center border-b border-border/60 bg-background/95 px-5 pb-3 pt-2 backdrop-blur">
          <img src={logo} alt="One Flow" className="h-9 w-auto" />
        </header>
        {children}
      </div>
      <WhatsAppFab />
      <BottomNav />
    </div>
  );
}
