import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      if (!user) {
        setProfile(null);
        setProfileReady(true);
        return;
      }
      setProfileReady(false);
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_complete, role, secondary_roles, timezone")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error(error);
        setProfile(null);
        setProfileReady(true);
        return;
      }
      setProfile((data as AuthProfile | null) ?? null);
      setProfileReady(true);
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
        setProfile(null);
        setProfileReady(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

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
