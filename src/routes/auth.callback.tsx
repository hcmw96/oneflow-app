import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { ensureProfileNamesFromOAuth } from "@/lib/oauthProfileNames";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

type ProfileGate = {
  phone: string | null;
  date_of_birth: string | null;
  role: string | null;
  onboarding_complete?: boolean | null;
};

function hasRecoveryMarker(): boolean {
  const search = new URLSearchParams(window.location.search);
  const hashRaw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hash = new URLSearchParams(hashRaw);
  const typeSearch = (search.get("type") ?? "").toLowerCase();
  const typeHash = (hash.get("type") ?? "").toLowerCase();

  return (
    typeSearch === "recovery" ||
    typeHash === "recovery" ||
    search.has("recovery_token") ||
    hash.has("recovery_token")
  );
}

async function loadProfileGate(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("phone, date_of_birth, role, onboarding_complete")
    .eq("id", userId)
    .maybeSingle();
  return data as ProfileGate | null;
}

async function resolveDestination(userId: string): Promise<"/onboarding" | "/admin" | "/"> {
  const profile = await loadProfileGate(userId);

  if (!profile || !profile.phone || !profile.date_of_birth) return "/onboarding";

  const role = (profile.role ?? "").toLowerCase();
  if (role === "director" || role === "management" || role === "guide") return "/admin";
  return "/";
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (done.current) return;

      // Recovery links must bypass onboarding/role routing.
      if (hasRecoveryMarker()) {
        done.current = true;
        window.location.assign(`/auth/reset-password${window.location.search}${window.location.hash}`);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.session?.user) {
          done.current = true;
          navigate({ to: "/auth" });
          return;
        }
        window.history.replaceState({}, "", "/auth/callback");
        await ensureProfileNamesFromOAuth(data.session.user);
        done.current = true;
        const dest = await resolveDestination(data.session.user.id);
        navigate({ to: dest });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        await ensureProfileNamesFromOAuth(session.user);
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
