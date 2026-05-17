import {
  allowedClassTypeCheckboxOptions,
  CLASS_TYPE_SLUG_LABEL,
  humanizeClassTypeSlug,
  isAllowedClassTypeSlug,
  type AllowedClassTypeSlug,
} from "@/lib/allowedClassTypes";
import { supabase } from "@/lib/supabase";

export const CUSTOM_CLASS_TYPES_SETTING_KEY = "custom_class_types";

/** Radix Select sentinel — not stored on classes. */
export const ADD_CLASS_TYPE_SELECT_VALUE = "__add_class_type__";

export type CustomClassType = {
  slug: string;
  label: string;
};

export type ClassTypeSelectOption = {
  value: string;
  label: string;
};

export function slugifyClassTypeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function classTypeLabel(slug: string, custom: readonly CustomClassType[] = []): string {
  const key = slugifyClassTypeName(slug);
  if (isAllowedClassTypeSlug(key)) return CLASS_TYPE_SLUG_LABEL[key];
  const hit = custom.find((c) => c.slug === key);
  if (hit?.label) return hit.label;
  return humanizeClassTypeSlug(key);
}

function parseCustomClassTypesJson(raw: string | null | undefined): CustomClassType[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CustomClassType[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const slug = slugifyClassTypeName(String((item as { slug?: string }).slug ?? ""));
      const label = String((item as { label?: string }).label ?? "").trim();
      if (!slug || !label) continue;
      if (out.some((x) => x.slug === slug)) continue;
      out.push({ slug, label });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchCustomClassTypes(): Promise<CustomClassType[]> {
  const { data, error } = await supabase
    .from("studio_settings")
    .select("value")
    .eq("key", CUSTOM_CLASS_TYPES_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error("fetchCustomClassTypes", error);
    return [];
  }
  return parseCustomClassTypesJson((data as { value?: string | null } | null)?.value);
}

export async function saveCustomClassTypes(types: CustomClassType[]): Promise<{ error: Error | null }> {
  const builtins = new Set(allowedClassTypeCheckboxOptions().map((o) => o.value));
  const deduped: CustomClassType[] = [];
  for (const t of types) {
    const slug = slugifyClassTypeName(t.slug);
    const label = t.label.trim();
    if (!slug || !label || builtins.has(slug as AllowedClassTypeSlug)) continue;
    if (deduped.some((x) => x.slug === slug)) continue;
    deduped.push({ slug, label });
  }

  const { error } = await supabase.from("studio_settings").upsert(
    {
      key: CUSTOM_CLASS_TYPES_SETTING_KEY,
      value: JSON.stringify(deduped),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  return { error: error as Error | null };
}

/** Built-in types, then studio custom types, then any orphan slug already on a class. */
export function buildClassTypeSelectOptions(
  custom: readonly CustomClassType[],
  includeSlug?: string | null,
): ClassTypeSelectOption[] {
  const builtins = allowedClassTypeCheckboxOptions();
  const seen = new Set<string>(builtins.map((b) => b.value));
  const opts: ClassTypeSelectOption[] = [...builtins];

  for (const c of custom) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    opts.push({ value: c.slug, label: c.label });
  }

  const extra = includeSlug ? slugifyClassTypeName(includeSlug) : "";
  if (extra && !seen.has(extra)) {
    opts.push({ value: extra, label: classTypeLabel(extra, custom) });
  }

  return opts;
}
