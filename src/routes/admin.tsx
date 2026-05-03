import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
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
  return r === "director" || r === "management";
}

function AdminLayout() {
  const navigate = useNavigate();
  const [gate, setGate] = useState<"loading" | "ok" | "denied">("loading");

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
      if (!isAdminRole(profile?.role)) {
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
