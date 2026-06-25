import defaultChallengeBg from "@/assets/challenge-bg.jpg";
import { supabase } from "@/lib/supabase";

export const MOVEMENT_CHALLENGE_SETTINGS_KEY = "movement_challenge";

export type HomeSpotlightCardMode = "hidden" | "challenge" | "event" | "offer";

export type MovementChallengeConfig = {
  /** What the home spotlight card promotes. */
  home_card_mode: HomeSpotlightCardMode;
  enabled: boolean;
  badge_label: string;
  title: string;
  subtitle: string;
  stamp_help_text: string;
  booking_banner_text: string;
  start_date: string;
  end_date: string;
  image_url: string;
  /** Event / special-offer copy when home_card_mode is event or offer. */
  promo_badge_label: string;
  promo_title: string;
  promo_subtitle: string;
  promo_image_url: string;
  promo_link: string;
  promo_link_label: string;
};

export const DEFAULT_MOVEMENT_CHALLENGE: MovementChallengeConfig = {
  home_card_mode: "challenge",
  enabled: true,
  badge_label: "May Challenge",
  title: "31 Days of Movement",
  subtitle: "May 2026 · Check in at the studio to collect your daily stamp.",
  stamp_help_text:
    "Stamps appear when you're checked in at the desk during the challenge period. One stamp per calendar day (up to 2 per day).",
  booking_banner_text: "Counts toward 31 Days of Movement",
  start_date: "2026-05-01",
  end_date: "2026-05-31",
  image_url: "",
  promo_badge_label: "Special offer",
  promo_title: "Studio event",
  promo_subtitle: "Limited spots — book early",
  promo_image_url: "",
  promo_link: "/schedule",
  promo_link_label: "Tap to view →",
};

let cachedConfig: MovementChallengeConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_MS = 60_000;

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

export function movementChallengeTotalDays(config: MovementChallengeConfig): number {
  const start = parseYmd(config.start_date);
  const end = parseYmd(config.end_date);
  if (!start || !end) return 31;
  const startUtc = Date.UTC(start.y, start.m - 1, start.d);
  const endUtc = Date.UTC(end.y, end.m - 1, end.d);
  if (endUtc < startUtc) return 1;
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1;
}

export function isClassDateInChallenge(
  classDate: string,
  config: MovementChallengeConfig,
): boolean {
  const d = classDate.trim();
  if (!d) return false;
  return d >= config.start_date && d <= config.end_date;
}

export function dayIndexInChallenge(
  classDate: string,
  config: MovementChallengeConfig,
): number | null {
  const start = parseYmd(config.start_date);
  const current = parseYmd(classDate);
  if (!start || !current || !isClassDateInChallenge(classDate, config)) return null;
  const startUtc = Date.UTC(start.y, start.m - 1, start.d);
  const curUtc = Date.UTC(current.y, current.m - 1, current.d);
  const idx = Math.floor((curUtc - startUtc) / 86_400_000) + 1;
  const total = movementChallengeTotalDays(config);
  return idx >= 1 && idx <= total ? idx : null;
}

export function challengeDateForDayIndex(
  config: MovementChallengeConfig,
  dayIndex: number,
): Date | null {
  const start = parseYmd(config.start_date);
  if (!start || dayIndex < 1) return null;
  return new Date(start.y, start.m - 1, start.d + (dayIndex - 1));
}

export function isTodayInChallenge(config: MovementChallengeConfig, now = new Date()): boolean {
  const ymd = now.toISOString().split("T")[0] ?? "";
  return isClassDateInChallenge(ymd, config);
}

export function todayDayIndexInChallenge(
  config: MovementChallengeConfig,
  now = new Date(),
): number {
  const ymd = now.toISOString().split("T")[0] ?? "";
  return dayIndexInChallenge(ymd, config) ?? 0;
}

export function challengeHeroImageUrl(config: MovementChallengeConfig): string {
  const url = config.image_url.trim();
  return url || defaultChallengeBg;
}

export function promoHeroImageUrl(config: MovementChallengeConfig): string {
  const url = (config.promo_image_url || config.image_url).trim();
  return url || defaultChallengeBg;
}

export function homeSpotlightImageUrl(config: MovementChallengeConfig): string {
  return config.home_card_mode === "challenge"
    ? challengeHeroImageUrl(config)
    : promoHeroImageUrl(config);
}

export function isInternalAppLink(href: string): boolean {
  const link = href.trim();
  return link.startsWith("/") && !link.startsWith("//");
}

export function homeSpotlightHref(config: MovementChallengeConfig): string {
  if (config.home_card_mode === "challenge") return "/challenge";
  const link = config.promo_link.trim();
  return link || "/schedule";
}

export function homeSpotlightFootnote(
  config: MovementChallengeConfig,
  challengeStamped: number,
  challengeTotalDays: number,
): string {
  if (config.home_card_mode === "challenge") {
    return `${challengeStamped}/${challengeTotalDays} days · Tap to view →`;
  }
  const subtitle = config.promo_subtitle.trim();
  const cta = config.promo_link_label.trim() || "Tap to view →";
  return subtitle ? `${subtitle} · ${cta}` : cta;
}

export function homeSpotlightShowsChallengeProgress(config: MovementChallengeConfig): boolean {
  return config.home_card_mode === "challenge";
}

function parseHomeCardMode(
  raw: string | undefined,
  enabled: boolean | undefined,
): HomeSpotlightCardMode {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "hidden" || mode === "challenge" || mode === "event" || mode === "offer") {
    return mode;
  }
  return enabled === false ? "hidden" : "challenge";
}

export function parseMovementChallengeConfig(raw: string | null | undefined): MovementChallengeConfig {
  if (!raw?.trim()) return { ...DEFAULT_MOVEMENT_CHALLENGE };
  try {
    const parsed = JSON.parse(raw) as Partial<MovementChallengeConfig> & {
      enabled?: boolean;
    };
    const enabled = parsed.enabled !== false;
    return {
      home_card_mode: parseHomeCardMode(parsed.home_card_mode, parsed.enabled),
      enabled,
      badge_label: String(parsed.badge_label ?? DEFAULT_MOVEMENT_CHALLENGE.badge_label).trim(),
      title: String(parsed.title ?? DEFAULT_MOVEMENT_CHALLENGE.title).trim(),
      subtitle: String(parsed.subtitle ?? DEFAULT_MOVEMENT_CHALLENGE.subtitle).trim(),
      stamp_help_text: String(
        parsed.stamp_help_text ?? DEFAULT_MOVEMENT_CHALLENGE.stamp_help_text,
      ).trim(),
      booking_banner_text: String(
        parsed.booking_banner_text ?? DEFAULT_MOVEMENT_CHALLENGE.booking_banner_text,
      ).trim(),
      start_date: String(parsed.start_date ?? DEFAULT_MOVEMENT_CHALLENGE.start_date).trim(),
      end_date: String(parsed.end_date ?? DEFAULT_MOVEMENT_CHALLENGE.end_date).trim(),
      image_url: String(parsed.image_url ?? "").trim(),
      promo_badge_label: String(
        parsed.promo_badge_label ?? DEFAULT_MOVEMENT_CHALLENGE.promo_badge_label,
      ).trim(),
      promo_title: String(parsed.promo_title ?? DEFAULT_MOVEMENT_CHALLENGE.promo_title).trim(),
      promo_subtitle: String(
        parsed.promo_subtitle ?? DEFAULT_MOVEMENT_CHALLENGE.promo_subtitle,
      ).trim(),
      promo_image_url: String(parsed.promo_image_url ?? "").trim(),
      promo_link: String(parsed.promo_link ?? DEFAULT_MOVEMENT_CHALLENGE.promo_link).trim(),
      promo_link_label: String(
        parsed.promo_link_label ?? DEFAULT_MOVEMENT_CHALLENGE.promo_link_label,
      ).trim(),
    };
  } catch {
    return { ...DEFAULT_MOVEMENT_CHALLENGE };
  }
}

export function serializeMovementChallengeConfig(config: MovementChallengeConfig): string {
  return JSON.stringify(config);
}

export function invalidateMovementChallengeCache(): void {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

export async function fetchMovementChallengeConfig(options?: {
  bypassCache?: boolean;
}): Promise<MovementChallengeConfig> {
  const now = Date.now();
  if (!options?.bypassCache && cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  const { data, error } = await supabase
    .from("studio_settings")
    .select("value")
    .eq("key", MOVEMENT_CHALLENGE_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error("movement_challenge settings load", error);
    return { ...DEFAULT_MOVEMENT_CHALLENGE };
  }

  const config = parseMovementChallengeConfig(
    (data as { value?: string | null } | null)?.value,
  );
  cachedConfig = config;
  cacheExpiresAt = now + CACHE_MS;
  return config;
}

export async function saveMovementChallengeConfig(
  config: MovementChallengeConfig,
  updatedBy: string | null,
): Promise<void> {
  const { error } = await supabase.from("studio_settings").upsert(
    {
      key: MOVEMENT_CHALLENGE_SETTINGS_KEY,
      value: serializeMovementChallengeConfig(config),
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw error;
  cachedConfig = config;
  cacheExpiresAt = Date.now() + CACHE_MS;
}
