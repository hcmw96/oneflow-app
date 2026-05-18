/** Members with these primary roles do not earn Flow Points (matches DB trigger). */
const NO_EARN_ROLES = new Set(["guide", "director"]);

export function profileEarnsFlowPoints(role: string | null | undefined): boolean {
  const r = (role ?? "").trim().toLowerCase();
  return !NO_EARN_ROLES.has(r);
}

export function manualCheckInToastMessage(role?: string | null): string {
  return profileEarnsFlowPoints(role) ? "Checked in · +10 Flow Points" : "Checked in";
}

export function welcomeCheckInToastMessage(memberName: string, role?: string | null): string {
  return profileEarnsFlowPoints(role)
    ? `Welcome ${memberName}! · +10 Flow Points`
    : `Welcome ${memberName}!`;
}

export function walkInCheckInToastMessage(displayName: string, role?: string | null): string {
  return profileEarnsFlowPoints(role)
    ? `${displayName} checked in · +10 Flow Points`
    : `${displayName} checked in`;
}
