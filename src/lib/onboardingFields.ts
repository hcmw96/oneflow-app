export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const REFERRAL_SOURCE_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google_search", label: "Google search" },
  { value: "friend_word_of_mouth", label: "Friend / word of mouth" },
  { value: "walked_past", label: "Walked past" },
  { value: "event_popup", label: "Event / pop-up" },
  { value: "other", label: "Other" },
] as const;

/** @deprecated Use REFERRAL_SOURCE_OPTIONS */
export const SIGNUP_SOURCE_OPTIONS = REFERRAL_SOURCE_OPTIONS;

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

export function resolveReferralSourceValue(source: string, otherText: string): string {
  if (source !== "other") {
    const opt = REFERRAL_SOURCE_OPTIONS.find((o) => o.value === source);
    return opt?.value ?? source;
  }
  const custom = otherText.trim();
  return custom ? `other:${custom}` : "";
}

/** @deprecated Use resolveReferralSourceValue */
export function resolveSignupSourceValue(source: string, otherText: string): string {
  return resolveReferralSourceValue(source, otherText);
}
