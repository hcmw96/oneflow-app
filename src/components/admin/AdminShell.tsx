import { type ReactNode, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeft, Menu } from "lucide-react";
import { AdminNav, AdminSidebarFooter, adminNavItems, navItemsForRole } from "./AdminNav";
import { getUser, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import logo from "@/assets/oneflow-logo.webp";
import { AdminGlobalSearch } from "@/components/admin/AdminGlobalSearch";

type AdminProfile = {
  email: string | null;
  role: string | null;
  secondary_roles: string[] | null;
};

export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCheckInKiosk = pathname === "/admin/check-in";

  useEffect(() => {
    if (isCheckInKiosk) setCollapsed(true);
  }, [isCheckInKiosk]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await getUser();
        if (!user || cancelled) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("email, role, secondary_roles")
          .eq("id", user.id)
          .maybeSingle();
        if (error) {
          console.error("admin shell profile load", error);
        }
        if (cancelled) return;
        setProfile({
          email: data?.email ?? user.email ?? null,
          role: data?.role ?? null,
          secondary_roles: (data?.secondary_roles as string[] | null) ?? null,
        });
      } catch (error) {
        console.error("admin shell init failed", error);
        if (cancelled) return;
        setProfile((prev) => prev ?? { email: null, role: null, secondary_roles: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleNav = navItemsForRole({
    role: profile?.role ?? null,
    secondary_roles: profile?.secondary_roles ?? null,
  });
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
  const roleProfile = {
    role: profile?.role ?? null,
    secondary_roles: profile?.secondary_roles ?? null,
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] md:flex",
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

        {!collapsed ? (
          <div className="border-b border-sidebar-border px-2 py-2">
            <AdminGlobalSearch />
          </div>
        ) : (
          <div className="flex justify-center border-b border-sidebar-border py-2">
            <AdminGlobalSearch className="h-9 w-9 min-w-9 max-w-none justify-center px-0 [&_span]:sr-only [&_kbd]:hidden" />
          </div>
        )}

        <AdminNav collapsed={collapsed} profile={roleProfile} />

        <AdminSidebarFooter
          collapsed={collapsed}
          profile={roleProfile}
          emailLine={emailLine}
          roleLine={roleLine}
          onSignOut={() => void signOut()}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
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
            <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
              <SheetHeader className="shrink-0 border-b border-sidebar-border px-4 py-4">
                <SheetTitle className="flex items-center gap-2 text-left">
                  <img src={logo} alt="One Flow" className="h-7 w-7 object-contain" />
                  <span className="font-display text-base font-semibold">One.flow</span>
                </SheetTitle>
              </SheetHeader>
              <div className="shrink-0 border-b border-sidebar-border px-3 py-2">
                <AdminGlobalSearch className="max-w-none border-border bg-background text-foreground hover:bg-muted" />
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <AdminNav
                    collapsed={false}
                    fill={false}
                    profile={roleProfile}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
                <AdminSidebarFooter
                  collapsed={false}
                  profile={roleProfile}
                  emailLine={emailLine}
                  roleLine={roleLine}
                  onNavigate={() => setMobileOpen(false)}
                  onSignOut={() => void signOut()}
                />
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
        <main
          data-admin-scroll
          className={cn(
            "min-h-0 flex-1 scroll-touch px-4 py-5 md:px-6 md:py-8",
            isCheckInKiosk
              ? "flex flex-col overflow-hidden max-[599px]:overflow-y-auto max-[599px]:scroll-touch py-3 md:py-4"
              : "overflow-y-auto",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
