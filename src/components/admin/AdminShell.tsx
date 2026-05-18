import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LogOut, PanelLeftClose, PanelLeft, Menu, Inbox } from "lucide-react";
import {
  AdminNav,
  adminNavItems,
  canSeePendingLeaveRequestsBadge,
  navItemsForRole,
} from "./AdminNav";
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
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

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

  const leaveRequestsActive = useRouterState({
    select: (s) => {
      if (s.location.pathname !== "/admin/timesheets") return false;
      const q = s.location.search as string | Record<string, unknown> | undefined;
      if (typeof q === "string") return new URLSearchParams(q).get("tab") === "leave-requests";
      if (q && typeof q === "object" && "tab" in q) return (q as { tab?: string }).tab === "leave-requests";
      return false;
    },
  });

  const canBadge = canSeePendingLeaveRequestsBadge(profile?.role);

  const refreshPendingLeaveCount = useCallback(async () => {
    if (!canBadge) return;
    const { count, error } = await supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) {
      console.error("leave_requests pending count", error);
      return;
    }
    setPendingLeaveCount(count ?? 0);
  }, [canBadge]);

  useEffect(() => {
    if (!canBadge) {
      setPendingLeaveCount(0);
      return;
    }
    void refreshPendingLeaveCount();
  }, [canBadge, refreshPendingLeaveCount]);

  useEffect(() => {
    if (!canBadge) return;
    const channel = supabase
      .channel("admin-shell-leave-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        void refreshPendingLeaveCount();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canBadge, refreshPendingLeaveCount]);

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

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] md:flex",
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

        <AdminNav
          collapsed={collapsed}
          profile={{
            role: profile?.role ?? null,
            secondary_roles: profile?.secondary_roles ?? null,
          }}
        />

        {canBadge ? (
          <div className={cn("border-t border-sidebar-border px-2 py-2", collapsed && "px-0")}>
            <Link
              to="/admin/timesheets"
              search={{ tab: "leave-requests" }}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                leaveRequestsActive
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? "Requests" : undefined}
            >
              <Inbox className="h-4 w-4 shrink-0" strokeWidth={leaveRequestsActive ? 2.2 : 1.8} />
              {!collapsed && <span className="truncate">Requests</span>}
              {pendingLeaveCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground",
                    collapsed ? "absolute right-1 top-1" : "ml-auto",
                  )}
                >
                  {pendingLeaveCount > 99 ? "99+" : pendingLeaveCount}
                </span>
              ) : null}
            </Link>
          </div>
        ) : null}

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
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetHeader className="border-b border-sidebar-border px-4 py-4">
                <SheetTitle className="flex items-center gap-2 text-left">
                  <img src={logo} alt="One Flow" className="h-7 w-7 object-contain" />
                  <span className="font-display text-base font-semibold">One.flow</span>
                </SheetTitle>
              </SheetHeader>
              <div className="border-b border-sidebar-border px-3 py-2">
                <AdminGlobalSearch className="max-w-none border-border bg-background text-foreground hover:bg-muted" />
              </div>
              <div className="flex h-[calc(100vh-65px)] flex-col">
                <AdminNav
                  collapsed={false}
                  profile={{
                    role: profile?.role ?? null,
                    secondary_roles: profile?.secondary_roles ?? null,
                  }}
                  onNavigate={() => setMobileOpen(false)}
                />
                {canBadge ? (
                  <div className="border-t border-sidebar-border px-2 py-2">
                    <Link
                      to="/admin/timesheets"
                      search={{ tab: "leave-requests" }}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        leaveRequestsActive
                          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
                      )}
                    >
                      <Inbox className="h-4 w-4 shrink-0" strokeWidth={leaveRequestsActive ? 2.2 : 1.8} />
                      <span className="truncate">Requests</span>
                      {pendingLeaveCount > 0 ? (
                        <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                          {pendingLeaveCount > 99 ? "99+" : pendingLeaveCount}
                        </span>
                      ) : null}
                    </Link>
                  </div>
                ) : null}
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
        <main
          data-admin-scroll
          className={cn(
            "min-h-0 flex-1 scroll-touch px-4 py-5 md:px-6 md:py-8",
            isCheckInKiosk
              ? "flex flex-col overflow-hidden py-3 md:py-4"
              : "overflow-y-auto",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
