import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { isGuideRole, isPathAllowedForGuide } from "@/components/admin/AdminNav";
import { supabase } from "@/lib/supabase";

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
  const [gate, setGate] = useState<"loading" | "ok" | "denied">("loading");
  const [profileRole, setProfileRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        window.location.assign("/auth");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = profile?.role ?? null;
      setProfileRole(role);
      if (!isAdminRole(role)) {
        setGate("denied");
        navigate({ to: "/" });
        return;
      }
      setGate("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (gate !== "ok") return;
    if (isGuideRole(profileRole) && !isPathAllowedForGuide(pathname)) {
      navigate({ to: "/admin/check-in", replace: true });
    }
  }, [gate, profileRole, pathname, navigate]);

  if (gate === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  if (gate === "denied") {
    return null;
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
