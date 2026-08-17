/**
 * Guards for the two-level class taxonomy.
 *
 * The seeded literals in `allowedClassTypes.ts` ARE today's production behaviour, and
 * hydration replaces them at runtime. Both states have to be correct: the seeds carry a
 * cold start and any failed fetch, the hydrated state carries everything after that.
 *
 * Each test re-imports the module so hydration in one does not leak into the next —
 * `hydrateClassTypeCatalog` mutates module-level records by design.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_CLASS_TYPE_SLUGS, CLASS_CATEGORY_SLUGS } from "./allowedClassTypes";

type Mod = typeof import("./allowedClassTypes");

async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import("./allowedClassTypes");
}

/** Shape of the seed in 20260817120000_class_categories_and_types.sql. */
const CATEGORY_ROWS = [
  { id: "cat-yoga", slug: "yoga", label: "Yoga", accent: "#7a9a68" },
  { id: "cat-sculpt", slug: "sculpt", label: "Sculpt", accent: "#d97706" },
  { id: "cat-pilates", slug: "pilates", label: "Pilates", accent: "#7c3aed" },
  { id: "cat-wellzone", slug: "wellzone", label: "Wellzone", accent: "#0284c7" },
  { id: "cat-event", slug: "event", label: "Events", accent: "#9333ea" },
].map((c) => ({
  id: c.id,
  slug: c.slug,
  label: c.label,
  categorySlug: c.slug,
  accent: c.accent,
  isFreeIntro: false,
}));

const TYPE_ROWS = [
  { id: "t-flow", slug: "flow_state", label: "Flow State", categorySlug: "yoga", accent: null, isFreeIntro: false },
  { id: "t-power", slug: "power", label: "Power", categorySlug: "yoga", accent: "#44403c", isFreeIntro: false },
  { id: "t-beg", slug: "beginner", label: "Beginners", categorySlug: "yoga", accent: "#8fa67d", isFreeIntro: true },
  { id: "t-kb", slug: "kettle_bell", label: "Kettle Bell", categorySlug: "sculpt", accent: null, isFreeIntro: false },
  { id: "t-begsc", slug: "beginner_sculpt", label: "Beginner Sculpt", categorySlug: "sculpt", accent: "#e8a54b", isFreeIntro: true },
  { id: "t-sauna", slug: "sauna_journey", label: "Guided Sauna Journey", categorySlug: "wellzone", accent: "#ea580c", isFreeIntro: false },
  { id: "t-unguided", slug: "wellzone", label: "Unguided", categorySlug: "wellzone", accent: "#0284c7", isFreeIntro: false },
];

const CATALOG = [...CATEGORY_ROWS, ...TYPE_ROWS];

describe("category / enum invariants", () => {
  it("every category slug is a class_type enum value", () => {
    // A newly created type inherits `legacy_class_type` from its category, and that column
    // is the Postgres enum. A category slug outside the enum would make every type under
    // it unschedulable.
    for (const slug of CLASS_CATEGORY_SLUGS) {
      expect(ALLOWED_CLASS_TYPE_SLUGS as readonly string[]).toContain(slug);
    }
  });
});

describe("seeded behaviour before hydration", () => {
  let mod: Mod;
  beforeEach(async () => {
    mod = await freshModule();
  });

  it("free intro classes are beginner and beginner_sculpt", () => {
    expect(mod.isFreeBeginnerClass("beginner")).toBe(true);
    expect(mod.isFreeBeginnerClass("beginner_sculpt")).toBe(true);
    expect(mod.isFreeBeginnerClass("yoga")).toBe(false);
    expect(mod.isFreeBeginnerClass("power")).toBe(false);
  });

  it("wellzone branch covers wellzone and sauna_journey", () => {
    expect(mod.isWellzoneSaunaClassType("wellzone")).toBe(true);
    expect(mod.isWellzoneSaunaClassType("sauna_journey")).toBe(true);
    expect(mod.bookingConfirmationTemplateForClassType("wellzone")).toBe(
      "booking_confirmation_sauna",
    );
    expect(mod.bookingConfirmationTemplateForClassType("yoga")).toBe(
      "booking_confirmation_class",
    );
  });

  it("credit arrays stay enum-valued", () => {
    // These are written into `class_type[]` columns, so a client-created slug in here
    // would fail the insert outright.
    const enumSlugs = new Set<string>(ALLOWED_CLASS_TYPE_SLUGS);
    for (const slug of [
      ...mod.ALL_ALLOWED_CLASS_TYPES,
      ...mod.SEEKER_YOGA_CLASS_TYPES,
      ...mod.WELLZONE_CLASS_TYPES,
      ...mod.FREE_BEGINNER_CLASS_TYPES,
      ...mod.GUIDE_DISCIPLINE_SLUGS,
    ]) {
      expect(enumSlugs).toContain(slug);
    }
  });
});

describe("after hydration", () => {
  let mod: Mod;
  beforeEach(async () => {
    mod = await freshModule();
    mod.hydrateClassTypeCatalog(CATALOG);
  });

  it("renaming a type changes its label", () => {
    expect(mod.CLASS_TYPE_SLUG_LABEL.beginner).toBe("Beginners");
    mod.hydrateClassTypeCatalog([
      { ...TYPE_ROWS[2], label: "Free Beginners" },
    ]);
    expect(mod.CLASS_TYPE_SLUG_LABEL.beginner).toBe("Free Beginners");
  });

  it("keeps free-intro behaviour and follows the flag both ways", () => {
    expect(mod.isFreeBeginnerClass("beginner")).toBe(true);
    expect(mod.isFreeBeginnerClass("beginner_sculpt")).toBe(true);
    expect(mod.isFreeBeginnerClass("flow_state")).toBe(false);

    mod.hydrateClassTypeCatalog([{ ...TYPE_ROWS[2], isFreeIntro: false }]);
    expect(mod.isFreeBeginnerClass("beginner")).toBe(false);
  });

  it("a slug missing from the fetch keeps its seeded behaviour", async () => {
    // The dangerous direction is losing free-intro status, which starts charging people.
    const partial = await freshModule();
    partial.hydrateClassTypeCatalog(CATEGORY_ROWS);
    expect(partial.isFreeBeginnerClass("beginner")).toBe(true);
    expect(partial.isFreeBeginnerClass("beginner_sculpt")).toBe(true);
  });

  it("every type under Wellzone takes the sauna email branch", () => {
    expect(mod.isWellzoneSaunaClassType("sauna_journey")).toBe(true);
    expect(mod.isWellzoneSaunaClassType("wellzone")).toBe(true);
    expect(mod.isWellzoneSaunaClassType("power")).toBe(false);
  });

  it("a client-created type inherits its category colour, not fallback grey", () => {
    // A new type with no colour of its own must not render grey next to coloured
    // siblings — the client would read that as broken.
    const theme = mod.classTypeTheme("flow_state");
    expect(theme.accent).toBe("#7a9a68");
    expect(theme.tintBg).not.toBe("");
  });

  it("keeps the hand-tuned Tailwind wash for enum slugs", () => {
    const theme = mod.classTypeTheme("sculpt");
    expect(theme.tint).toBe("bg-amber-50");
  });

  it("resolves a type row id back to its slug", () => {
    expect(mod.classTypeSlugById("t-power")).toBe("power");
    expect(mod.classTypeSlugById("nope")).toBeNull();
    expect(mod.classTypeSlugById(null)).toBeNull();
  });

  it("maps types to categories", () => {
    expect(mod.classCategorySlugFor("flow_state")).toBe("yoga");
    expect(mod.classCategorySlugFor("kettle_bell")).toBe("sculpt");
    expect(mod.classCategorySlugFor("yoga")).toBe("yoga");
  });
});

describe("derived titles", () => {
  beforeEach(async () => {
    const mod = await freshModule();
    mod.hydrateClassTypeCatalog(CATALOG);
  });

  it("derives Category: Type, prefers an override, and falls back to the stored name", async () => {
    vi.resetModules();
    const canonical = await import("./allowedClassTypes");
    canonical.hydrateClassTypeCatalog(CATALOG);
    const { classTitle } = await import("./classTitle");

    expect(classTitle({ name: "Power Yoga", class_type: "power", class_type_id: "t-power" })).toBe(
      "Yoga: Power",
    );
    expect(classTitle({ name: "x", class_type: "yoga", class_type_id: "t-flow" })).toBe(
      "Yoga: Flow State",
    );
    expect(
      classTitle({ name: "x", class_type: "event", title_override: "Full Moon Sauna" }),
    ).toBe("Full Moon Sauna");
    // Historical row: the enum names only a category, so the stored name still shows
    // rather than collapsing a week of classes into identical "Yoga"s.
    expect(classTitle({ name: "Sunrise Vinyasa", class_type: "yoga", class_type_id: null })).toBe(
      "Sunrise Vinyasa",
    );
    expect(classTitle({ name: "", class_type: "yoga", class_type_id: null })).toBe("Yoga");
  });
});
