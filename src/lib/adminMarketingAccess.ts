/** Profile fields used for admin marketing access checks. */
export type AdminRoleProfile = {
  role: string | null;
  secondary_roles?: string[] | null;
};

export const MARKETING_ADMIN_ROUTES = [
  "/admin/email",
  "/admin/whatsapp",
  "/admin/client-comms",
  "/admin/promotions",
] as const;

const STANDARD_ADMIN_PRIMARY_ROLES = new Set([
  "director",
  "management",
  "guide",
  "front_desk",
  "boh",
]);

/** Primary + secondary roles, lowercased, deduped. */
export function profileRoleSet(profile: AdminRoleProfile): Set<string> {
  const out = new Set<string>();
  const primary = (profile.role ?? "").trim().toLowerCase();
  if (primary) out.add(primary);
  for (const raw of profile.secondary_roles ?? []) {
    const s = String(raw).trim().toLowerCase();
    if (s) out.add(s);
  }
  return out;
}

/** Email / promotions / client comms / WhatsApp admin. */
export function canAccessMarketingAdmin(profile: AdminRoleProfile): boolean {
  const roles = profileRoleSet(profile);
  return (
    roles.has("director") ||
    roles.has("management") ||
    roles.has("marketing")
  );
}

export function isMarketingAdminPath(pathname: string): boolean {
  return MARKETING_ADMIN_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Any admin area access (staff + marketing primary or secondary). */
export function canEnterAdminArea(profile: AdminRoleProfile): boolean {
  const primary = (profile.role ?? "").trim().toLowerCase();
  if (STANDARD_ADMIN_PRIMARY_ROLES.has(primary)) return true;
  if (primary === "marketing") return true;
  return profileRoleSet(profile).has("marketing");
}

/** Marketing access without director/management primary role. */
export function isMarketingScopedStaff(profile: AdminRoleProfile): boolean {
  if (!canAccessMarketingAdmin(profile)) return false;
  const primary = (profile.role ?? "").trim().toLowerCase();
  return primary !== "director" && primary !== "management";
}

/** Default landing route for marketing-scoped staff. */
export function defaultMarketingAdminPath(): string {
  return "/admin/email";
}

/** Admin sidebar link to the member app (director or customer secondary role). */
export function canViewCustomerApp(profile: AdminRoleProfile): boolean {
  const roles = profileRoleSet(profile);
  return roles.has("director") || roles.has("customer");
}
