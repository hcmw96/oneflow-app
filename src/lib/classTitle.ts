/**
 * Class titles are DERIVED from category + type at render time, never copied into
 * `public.classes`. Renaming "Power" in Master therefore retitles every scheduled Power
 * class with zero writes — the client's headline requirement.
 *
 * Precedence:
 *   1. `title_override` — one-offs such as "Full Moon Sauna".
 *   2. "Category: Type" — matches the Mindbody booking page she works from
 *      (`Yoga: Power`, `Sculpt: Kettle Bell`, `Sauna Journey: Deep Flow`).
 *   3. `classes.name` — historical rows whose enum value ("yoga", "sculpt") names only a
 *      category and so cannot be resolved to Flow State vs Vinyasa, plus ad-hoc events.
 *      Falling back to the stored name keeps those reading exactly as they do today
 *      rather than collapsing a week of classes into a row of identical "Yoga"s.
 */
import {
  CLASS_TYPE_SLUG_LABEL,
  classCategoryLabel,
  classCategorySlugFor,
  classTypeSlugById,
  resolveClassTypeSlug,
} from "@/lib/allowedClassTypes";

export type TitledClass = {
  name?: string | null;
  title_override?: string | null;
  class_type?: string | null;
  class_type_id?: string | null;
};

/** Catalog slug for a class row: the type FK when resolvable, else the legacy enum. */
export function classTypeSlugFor(cls: TitledClass): string | null {
  return classTypeSlugById(cls.class_type_id) ?? resolveClassTypeSlug(cls.class_type);
}

export function classTitle(cls: TitledClass): string {
  const override = cls.title_override?.trim();
  if (override) return override;

  const slug = classTypeSlugFor(cls);
  const stored = cls.name?.trim() ?? "";

  if (slug) {
    const category = classCategorySlugFor(slug);
    // `category === slug` means the row resolved only to a category — no real type to
    // name after the colon.
    if (category && category !== slug) {
      return `${classCategoryLabel(category)}: ${CLASS_TYPE_SLUG_LABEL[slug]}`;
    }
    if (!stored) return CLASS_TYPE_SLUG_LABEL[slug] ?? "";
  }

  return stored;
}
