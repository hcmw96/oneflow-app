import { type AdminRoleProfile, profileRoleSet } from "@/lib/adminMarketingAccess";

/** PostgREST filter: primary role customer OR customer in secondary_roles. */
export const BOOKABLE_MEMBER_OR_FILTER = "role.eq.customer,secondary_roles.cs.{customer}";

/** Whether a profile can book classes and receive member-facing comms as a customer. */
export function isBookableMember(profile: AdminRoleProfile): boolean {
  return profileRoleSet(profile).has("customer");
}
