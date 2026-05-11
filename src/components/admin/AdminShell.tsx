import { type ReactNode, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LogOut, PanelLeftClose, PanelLeft, Menu } from "lucide-react";
import { AdminNav, adminNavItems, navItemsForRole } from "./AdminNav";
import { getUser, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import logo from "@/assets/oneflow-logo.webp";

type AdminProfile = {
  email: string | null;
  role: string | null;
};

export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await getUser();
        if (!user || cancelled) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("email, role")
          .eq("id", user.id)
          .maybeSingle();
        if (error) {
          console.error("admin shell profile load", error);
        }
        if (cancelled) return;
        setProfile({
          email: data?.email ?? user.email ?? null,
          role: data?.role ?? null,
        });
      } catch (error) {
        console.error("admin shell init failed", error);
        if (cancelled) return;
        setProfile((prev) => prev ?? { email: null, role: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visibleNav = navItemsForRole(profile?.role);
  const currentLabel =
    visibleNav.find(
      (i) =>
        (i.to === "/admin" && pathname === "/admin") ||
        (i.to !== "/admin" && (pathname === i.to || pathname.startsWith(i.to + "/"))),
    )?.label ??
    adminNavItems.find(
      (i) =>
        (i.to === "/admin" && pathname === "/admin") ||
        (i.to !== "/admin" && (pathname === i.to || pathname.startsWith(i.to + "/"))),
    )?.label ??
    "Admin";

  const emailLine = profile?.email ?? "…";
  const roleLine = (profile?.role ?? "—").toString();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar transition-[width] md:flex",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border px-4",
            collapsed && "justify-center px-0",
          )}
        >
          <Link to="/admin" className="flex items-center gap-2">
            <img src={logo} alt="One Flow" className="h-8 w-8 object-contain" />
          </Link>
        </div>

        <AdminNav collapsed={collapsed} role={profile?.role} />

        <div className="mt-auto flex flex-col border-t border-sidebar-border">
          <Link
            to="/"
            title={collapsed ? "My Customer View" : undefined}
            className={cn(
              "flex w-full items-center gap-2 text-xs font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50",
              collapsed ? "justify-center px-0 py-3" : "px-3 py-2.5 text-left",
            )}
          >
            <Home className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed && <span>My Customer View</span>}
          </Link>
          <div
            className={cn(
              "flex items-center gap-2 border-t border-sidebar-border px-3 py-3 text-xs",
              collapsed && "justify-center px-0",
            )}
          >
            {!collapsed ? (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-sidebar-foreground">{emailLine}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {roleLine}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={() => void signOut()}
                  className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-label="Sign out"
                onClick={() => void signOut()}
                className="rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
              >
                <Menu className="h-5 w-5 shrink-0" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetHeader className="border-b border-sidebar-border px-4 py-4">
                <SheetTitle className="flex items-center gap-2 text-left">
                  <img src={logo} alt="One Flow" className="h-7 w-7 object-contain" />
                  <span className="font-display text-base font-semibold">One.flow</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex h-[calc(100vh-65px)] flex-col">
                <AdminNav
                  collapsed={false}
                  role={profile?.role}
                  onNavigate={() => setMobileOpen(false)}
                />
                <div className="mt-auto flex flex-col border-t border-sidebar-border">
                  <Link
                    to="/"
                    onClick={() => setMobileOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
                  >
                    <Home className="h-4 w-4 shrink-0" aria-hidden />
                    <span>My Customer View</span>
                  </Link>
                  <div className="flex items-center gap-2 border-t border-sidebar-border px-3 py-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-sidebar-foreground">{emailLine}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {roleLine}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Sign out"
                      onClick={() => void signOut()}
                      className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted md:inline-flex"
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4 shrink-0" />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" />
            )}
          </button>

          <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold">
            {currentLabel}
          </h1>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
