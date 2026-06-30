import { cn } from "@/lib/utils";
import octivLogo from "@/assets/octiv-logo.png";

/** Octiv check-in page — open on the front-desk tablet (studio account). */
export const OCTIV_CHECK_IN_URL = "https://app.octivfitness.com/check-in";

const OCTIV_VITALITY_QR_ROLES = new Set(["director", "management", "front_desk"]);

type ProfileLike = {
  role: string | null;
  secondary_roles?: string[] | null;
};

/** Front-desk tablet roles only — never shown on member-facing routes. */
export function canShowOctivVitalityQr(profile: ProfileLike | null | undefined): boolean {
  if (!profile) return false;
  const roles = new Set<string>();
  const primary = (profile.role ?? "").trim().toLowerCase();
  if (primary) roles.add(primary);
  for (const raw of profile.secondary_roles ?? []) {
    const s = String(raw).trim().toLowerCase();
    if (s) roles.add(s);
  }
  for (const allowed of OCTIV_VITALITY_QR_ROLES) {
    if (roles.has(allowed)) return true;
  }
  return false;
}

/**
 * Opens Octiv check-in in a new tab for Discovery Vitality QR scanning.
 *
 * Requires the tablet to be logged into Octiv as the studio account in that browser.
 */
export function OctivVitalityCheckInButton() {
  return (
    <button
      type="button"
      onClick={() => window.open(OCTIV_CHECK_IN_URL, "_blank", "noopener,noreferrer")}
      className={cn(
        "mt-4 flex w-full max-w-[min(100%,22rem)] flex-col items-center justify-center gap-2.5",
        "rounded-xl border-0 px-4 py-3.5 text-center shadow-sm transition-colors",
        "bg-[#a3b693] text-white hover:bg-[#8fa67d]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3b693]/60 focus-visible:ring-offset-2",
      )}
    >
      <img
        src={octivLogo}
        alt=""
        aria-hidden
        className="h-6 w-auto max-w-[10rem] shrink-0 object-contain"
      />
      <span className="text-sm font-semibold leading-snug">Earn Discovery Vitality points</span>
    </button>
  );
}
