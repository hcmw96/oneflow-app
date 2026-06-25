export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const SIGNUP_SOURCE_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "friend_family", label: "Friend or family" },
  { value: "google", label: "Google / online search" },
  { value: "walk_in", label: "Saw the studio / walk-in" },
  { value: "class_invite", label: "Class invite" },
  { value: "other", label: "Other" },
] as const;

export function ageFromDateOfBirth(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (age < 0 || age > 120) return null;
  return age;
}

export function resolveSignupSourceValue(source: string, otherText: string): string {
  if (source !== "other") {
    const opt = SIGNUP_SOURCE_OPTIONS.find((o) => o.value === source);
    return opt?.label ?? source;
  }
  const custom = otherText.trim();
  return custom ? `Other: ${custom}` : "";
}
