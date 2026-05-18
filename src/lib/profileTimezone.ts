import { supabase } from "@/lib/supabase";
import { detectUserTimezone, isValidIanaTimeZone } from "@/lib/timezone";

/** Persist browser timezone when it changes (best-effort). */
export async function syncProfileTimezone(profileId: string, timezone: string): Promise<void> {
  if (!isValidIanaTimeZone(timezone)) return;
  const { error } = await supabase.from("profiles").update({ timezone }).eq("id", profileId);
  if (error) console.error("syncProfileTimezone", error);
}

export function resolveDisplayTimezone(profileTimezone: string | null | undefined): string {
  if (profileTimezone && isValidIanaTimeZone(profileTimezone)) return profileTimezone;
  return detectUserTimezone();
}
