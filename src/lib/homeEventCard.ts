import { supabase } from "@/lib/supabase";

export const HOME_EVENT_CARD_SETTINGS_KEY = "home_event_card";

export type HomeEventCardConfig = {
  enabled: boolean;
  image_url: string;
  /** Display date, e.g. 2026-07-15 or "Saturday 15 July". */
  event_date: string;
  /** Display price, e.g. R450 or Free. */
  price_label: string;
  title: string;
  body_text: string;
  link_url: string;
  link_label: string;
};

export const DEFAULT_HOME_EVENT_CARD: HomeEventCardConfig = {
  enabled: false,
  image_url: "",
  event_date: "",
  price_label: "",
  title: "",
  body_text: "",
  link_url: "/schedule",
  link_label: "Learn more",
};

let cachedConfig: HomeEventCardConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_MS = 60_000;

export function parseHomeEventCardConfig(raw: string | null | undefined): HomeEventCardConfig {
  if (!raw?.trim()) return { ...DEFAULT_HOME_EVENT_CARD };
  try {
    const parsed = JSON.parse(raw) as Partial<HomeEventCardConfig>;
    return {
      enabled: parsed.enabled === true,
      image_url: String(parsed.image_url ?? "").trim(),
      event_date: String(parsed.event_date ?? "").trim(),
      price_label: String(parsed.price_label ?? "").trim(),
      title: String(parsed.title ?? "").trim(),
      body_text: String(parsed.body_text ?? "").trim(),
      link_url: String(parsed.link_url ?? DEFAULT_HOME_EVENT_CARD.link_url).trim(),
      link_label: String(parsed.link_label ?? DEFAULT_HOME_EVENT_CARD.link_label).trim(),
    };
  } catch {
    return { ...DEFAULT_HOME_EVENT_CARD };
  }
}

export async function fetchHomeEventCardConfig(options?: {
  bypassCache?: boolean;
}): Promise<HomeEventCardConfig> {
  const now = Date.now();
  if (!options?.bypassCache && cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  const { data, error } = await supabase
    .from("studio_settings")
    .select("value")
    .eq("key", HOME_EVENT_CARD_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error("home_event_card settings load", error);
    return { ...DEFAULT_HOME_EVENT_CARD };
  }

  const config = parseHomeEventCardConfig(data?.value as string | null | undefined);
  cachedConfig = config;
  cacheExpiresAt = now + CACHE_MS;
  return config;
}

export async function saveHomeEventCardConfig(config: HomeEventCardConfig): Promise<void> {
  const { error } = await supabase.from("studio_settings").upsert(
    {
      key: HOME_EVENT_CARD_SETTINGS_KEY,
      value: JSON.stringify(config),
    },
    { onConflict: "key" },
  );
  if (error) throw error;
  cachedConfig = config;
  cacheExpiresAt = Date.now() + CACHE_MS;
}

export function homeEventCardVisible(config: HomeEventCardConfig): boolean {
  return config.enabled && Boolean(config.title.trim());
}

export function homeEventCardImageUrl(config: HomeEventCardConfig): string | null {
  const url = config.image_url.trim();
  return url || null;
}
