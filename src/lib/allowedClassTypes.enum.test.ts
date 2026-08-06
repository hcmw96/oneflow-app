/**
 * Guard: frontend ALLOWED_CLASS_TYPE_SLUGS must not drift from Postgres class_type.
 *
 * - Always asserts theme/label coverage + equality with DOCUMENTED_DB_CLASS_TYPE_ENUM.
 * - When Supabase CLI is linked, also compares against the live enum (skip-safe on failure).
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_CLASS_TYPE_SLUGS,
  CLASS_TYPE_THEME_BY_SLUG,
  CLASS_TYPE_SLUG_LABEL,
} from "./allowedClassTypes";

/**
 * Last-known Postgres `class_type` labels.
 * Update this AND `ALLOWED_CLASS_TYPE_SLUGS` when running ALTER TYPE … ADD VALUE.
 */
const DOCUMENTED_DB_CLASS_TYPE_ENUM = [
  "yoga",
  "sculpt",
  "wellzone",
  "sauna_journey",
  "power",
  "event",
  "beginner",
  "beginner_sculpt",
  "pilates",
] as const;

function sorted(xs: readonly string[]): string[] {
  return [...xs].sort();
}

function fetchLiveEnumLabels(): string[] | null {
  try {
    const script = `
import re, subprocess, json
import pg8000
out = subprocess.check_output(
    ["supabase", "db", "dump", "--linked", "--data-only", "--dry-run", "-f", "/tmp/of-enum-check.sql"],
    stderr=subprocess.STDOUT, text=True)
env = {m.group(1): m.group(2) for m in re.finditer(r'export (PG\\w+)="([^"]*)"', out)}
conn = pg8000.connect(
    host=env["PGHOST"], port=int(env["PGPORT"]), user=env["PGUSER"],
    password=env["PGPASSWORD"], database=env["PGDATABASE"], ssl_context=True)
cur = conn.cursor()
cur.execute("SET ROLE postgres")
cur.execute("""
  SELECT e.enumlabel FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'class_type' ORDER BY e.enumsortorder
""")
print(json.dumps([r[0] for r in cur.fetchall()]))
conn.close()
`;
    const raw = execFileSync("python3", ["-c", script], {
      encoding: "utf8",
      maxBuffer: 2_000_000,
      timeout: 30_000,
    });
    const line = raw.trim().split("\n").filter(Boolean).at(-1);
    if (!line) return null;
    const parsed = JSON.parse(line) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

describe("class_type canonical sync", () => {
  it("every slug has a label and theme entry", () => {
    for (const slug of ALLOWED_CLASS_TYPE_SLUGS) {
      expect(CLASS_TYPE_SLUG_LABEL[slug]).toBeTruthy();
      expect(CLASS_TYPE_THEME_BY_SLUG[slug]).toBeTruthy();
      expect(CLASS_TYPE_THEME_BY_SLUG[slug].accent).toMatch(/^#/);
    }
  });

  it("frontend slugs match documented Postgres enum (set equality)", () => {
    expect(sorted(ALLOWED_CLASS_TYPE_SLUGS)).toEqual(sorted(DOCUMENTED_DB_CLASS_TYPE_ENUM));
  });

  it("matches live Postgres enum when Supabase CLI is linked", () => {
    const live = fetchLiveEnumLabels();
    if (!live) {
      console.warn(
        "[class_type enum] live DB check skipped (Supabase CLI / pg8000 unavailable)",
      );
      return;
    }
    expect(sorted(ALLOWED_CLASS_TYPE_SLUGS)).toEqual(sorted(live));
    expect(sorted(DOCUMENTED_DB_CLASS_TYPE_ENUM)).toEqual(sorted(live));
  });
});
