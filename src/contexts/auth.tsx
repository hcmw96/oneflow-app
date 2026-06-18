import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, syncCachedAuthUser } from "@/lib/supabase";

type AuthProfile = {
  onboarding_complete: boolean | null;
  role: string | null;
  secondary_roles: string[] | null;
  timezone: string | null;
};

type AuthState = {
  user: User | null;
  authReady: boolean;
  profile: AuthProfile | null;
  profileReady: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * React Query key for the auth profile lookup. Exported so consumers can
 * invalidate / read this cache (e.g. onboarding-complete mutation).
 */
export const authProfileQueryKey = (userId: string | null | undefined) =>
  ["auth-profile", userId ?? "anon"] as const;

async function fetchAuthProfile(userId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_complete, role, secondary_roles, timezone")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  return (data as AuthProfile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Profile fetch lives in React Query so navigations between routes
  // (each of which used to read it independently) hit a shared cache.
  const profileQuery = useQuery({
    queryKey: authProfileQueryKey(user?.id ?? null),
    queryFn: () => fetchAuthProfile(user!.id),
    enabled: !!user?.id,
    // The profile rarely changes during a session; 5 min is fine.
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      const u = session?.user ?? null;
      syncCachedAuthUser(u);
      setUser(u);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      syncCachedAuthUser(u);
      setUser(u);
      setAuthReady(true);
      if (event === "SIGNED_OUT") {
        // Drop all cached data on sign-out so the next user starts fresh.
        queryClient.clear();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const profile = user ? (profileQuery.data ?? null) : null;
  // "Ready" = no user (nothing to load) OR the query has resolved either way.
  const profileReady = !user || profileQuery.isSuccess || profileQuery.isError;

  const value = useMemo(
    () => ({ user, authReady, profile, profileReady }),
    [user, authReady, profile, profileReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
