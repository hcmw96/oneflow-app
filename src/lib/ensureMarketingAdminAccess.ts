import { redirect } from "@tanstack/react-router";
import { canAccessMarketingAdmin } from "@/lib/adminMarketingAccess";
import { getUser, supabase } from "@/lib/supabase";

/** Route `beforeLoad` guard for marketing admin pages. */
export async function ensureMarketingAdminAccess() {
  const user = await getUser();
  if (!user) {
    throw redirect({ to: "/auth" });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role, secondary_roles")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("ensureMarketingAdminAccess", error);
    throw redirect({ to: "/admin" });
  }

  if (
    !canAccessMarketingAdmin({
      role: (data?.role as string | null) ?? null,
      secondary_roles: (data?.secondary_roles as string[] | null) ?? null,
    })
  ) {
    throw redirect({ to: "/admin/check-in" });
  }
}
