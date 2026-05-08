import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { isGuideRole, isPathAllowedForGuide } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — One Flow" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

function isAdminRole(role: string | null | undefined) {
  const r = (role ?? "").toLowerCase();
  return r === "director" || r === "management" || r === "guide";
}

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, authReady, profile, profileReady } = useAuth();
  const profileRole = profile?.role ?? null;

  useEffect(() => {
    if (authReady && !user) {
      window.location.assign("/auth");
    }
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !user || !profileReady) return;
    if (!isAdminRole(profileRole)) {
      navigate({ to: "/", replace: true });
    }
  }, [authReady, user, profileReady, profileRole, navigate]);

  useEffect(() => {
    if (!authReady || !user || !profileReady) return;
    if (!isAdminRole(profileRole)) return;
    if (isGuideRole(profileRole) && !isPathAllowedForGuide(pathname)) {
      navigate({ to: "/admin/check-in", replace: true });
    }
  }, [authReady, user, profileReady, profileRole, pathname, navigate]);

  const loading =
    !authReady || (!!user && !profileReady) || (authReady && !user);

  const canAccess =
    authReady && !!user && profileReady && isAdminRole(profileRole);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  if (!canAccess) {
    return null;
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
