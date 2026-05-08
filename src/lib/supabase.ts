import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let cachedUser: User | null = null;
let getUserPromise: Promise<User | null> | null = null;

/** Keep getUser()'s cache aligned with wherever we resolve session first (avoid /admin gate vs React auth mismatch). */
export function syncCachedAuthUser(user: User | null) {
  cachedUser = user;
}

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUser = session?.user ?? null;
});

/**
 * Cached auth lookup: avoids a round-trip on every caller once the session is known.
 */
export async function getUser(): Promise<User | null> {
  if (cachedUser) return cachedUser;
  if (!getUserPromise) {
    getUserPromise = supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        cachedUser = user;
        return user;
      })
      .finally(() => {
        getUserPromise = null;
      });
  }
  return getUserPromise;
}
