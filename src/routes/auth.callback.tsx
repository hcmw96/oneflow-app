import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

async function resolveDestination(userId: string): Promise<"/onboarding" | "/admin" | "/"> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, date_of_birth, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !profile.phone || !profile.date_of_birth) return "/onboarding";
  if (profile.role && profile.role !== "customer") return "/admin";
  return "/";
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (done.current) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        done.current = true;
        const dest = await resolveDestination(session.user.id);
        navigate({ to: dest });
        return;
      }

      done.current = true;
      navigate({ to: "/auth" });
    };

    void run();
  }, [navigate]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
