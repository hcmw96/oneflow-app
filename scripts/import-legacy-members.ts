/**
 * Bulk-import Mindbody members into public.legacy_members (staging only — no auth users).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-legacy-members.ts
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-legacy-members.ts --commit
 *
 * Reads members.csv from the project root (see README in script output).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "https://ubseyvrnravzwiqfxacz.supabase.co";
const BATCH_SIZE = 100;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = resolve(PROJECT_ROOT, "members.csv");
const REPORT_PATH = resolve(PROJECT_ROOT, "legacy-import-report.csv");

function loadEnvFiles(): void {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(PROJECT_ROOT, name);
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      // optional file
    }
  }
}

function serviceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    undefined
  );
}

type CsvRow = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

type RowStatus =
  | "to-insert"
  | "skip-duplicate"
  | "skip-already-registered"
  | "skip-no-email";

type ReportRow = CsvRow & { status: RowStatus; note?: string };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type CanonicalField = "email" | "first_name" | "last_name" | "phone";

/** Lowercase, collapse spaces/hyphens to underscores, strip edge underscores. */
function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Header variants → canonical field. After normalizeHeaderKey(), any alias match wins.
 * First matching column in the CSV wins if multiple columns map to the same field.
 */
const FIELD_ALIASES: Record<CanonicalField, readonly string[]> = {
  email: ["email", "e_mail", "email_address", "emailaddress"],
  first_name: [
    "first_name",
    "firstname",
    "first",
    "given_name",
    "givenname",
    "fname",
  ],
  last_name: [
    "last_name",
    "lastname",
    "last",
    "surname",
    "family_name",
    "familyname",
    "lname",
  ],
  phone: [
    "phone",
    "mobile",
    "mobile_phone",
    "mobilephone",
    "cell",
    "cell_phone",
    "telephone",
    "tel",
    "phone_number",
    "phonenumber",
  ],
};

function mapHeaderColumns(
  rawHeaders: string[],
): { columns: Record<CanonicalField, number>; normalized: string[] } {
  const normalized = rawHeaders.map(normalizeHeaderKey);
  const columns: Record<CanonicalField, number> = {
    email: -1,
    first_name: -1,
    last_name: -1,
    phone: -1,
  };

  for (const field of Object.keys(FIELD_ALIASES) as CanonicalField[]) {
    const aliases = FIELD_ALIASES[field];
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i]!)) {
        columns[field] = i;
        break;
      }
    }
  }

  return { columns, normalized };
}

function describeHeaderMapping(
  rawHeaders: string[],
  columns: Record<CanonicalField, number>,
): string {
  const parts: string[] = [];
  for (const field of Object.keys(columns) as CanonicalField[]) {
    const idx = columns[field];
    if (idx === -1) {
      parts.push(`${field}=<missing>`);
    } else {
      parts.push(`${field}="${rawHeaders[idx]}" (col ${idx + 1})`);
    }
  }
  return parts.join(", ");
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const rawHeaders = parseCsvLine(nonEmpty[0]!);
  const { columns } = mapHeaderColumns(rawHeaders);

  if (columns.email === -1) {
    throw new Error(
      `members.csv must include an email column (e.g. email, Email). Found headers: ${rawHeaders.join(", ")}`,
    );
  }

  console.log(`Header mapping: ${describeHeaderMapping(rawHeaders, columns)}`);

  const rows: CsvRow[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = parseCsvLine(nonEmpty[i]!);
    const get = (idx: number) => {
      if (idx === -1) return null;
      const v = (cells[idx] ?? "").trim();
      return v || null;
    };
    rows.push({
      email: get(columns.email) ?? "",
      first_name: get(columns.first_name),
      last_name: get(columns.last_name),
      phone: get(columns.phone),
    });
  }
  return rows;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function writeReport(rows: ReportRow[]): void {
  const header = "email,first_name,last_name,phone,status,note";
  const body = rows.map((r) =>
    [
      csvEscape(r.email),
      csvEscape(r.first_name ?? ""),
      csvEscape(r.last_name ?? ""),
      csvEscape(r.phone ?? ""),
      csvEscape(r.status),
      csvEscape(r.note ?? ""),
    ].join(","),
  );
  writeFileSync(REPORT_PATH, [header, ...body].join("\n") + "\n", "utf8");
}

async function fetchAllAuthEmails(
  admin: ReturnType<typeof createClient>,
): Promise<Set<string>> {
  const emails = new Set<string>();
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);

    const users = data?.users ?? [];
    for (const u of users) {
      const em = u.email ? normEmail(u.email) : "";
      if (em) emails.add(em);
    }

    if (users.length < perPage) break;
    page += 1;
    if (page > 500) {
      console.warn("Stopped auth user pagination at 500 pages — check total user count.");
      break;
    }
  }

  return emails;
}

async function fetchAllLegacyEmails(
  admin: ReturnType<typeof createClient>,
): Promise<Set<string>> {
  const emails = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("legacy_members")
      .select("email")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`legacy_members select failed: ${error.message}`);

    const rows = data ?? [];
    for (const row of rows) {
      const em = normEmail(String((row as { email: string }).email ?? ""));
      if (em) emails.add(em);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return emails;
}

async function insertBatches(
  admin: ReturnType<typeof createClient>,
  rows: CsvRow[],
): Promise<{ inserted: number; failed: number }> {
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      email: normEmail(r.email),
      first_name: r.first_name,
      last_name: r.last_name,
      phone: r.phone,
    }));

    const { error, count } = await admin.from("legacy_members").insert(batch, { count: "exact" });

    if (error) {
      // Race or edge-case duplicate: try one-by-one so re-runs stay safe.
      if (error.code === "23505") {
        for (const row of batch) {
          const { error: oneErr } = await admin.from("legacy_members").insert(row);
          if (oneErr) {
            if (oneErr.code === "23505") continue;
            console.error("Insert failed:", row.email, oneErr.message);
            failed += 1;
          } else {
            inserted += 1;
          }
        }
      } else {
        console.error(`Batch insert failed (rows ${i + 1}–${i + batch.length}):`, error.message);
        failed += batch.length;
      }
    } else {
      inserted += count ?? batch.length;
    }

    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} row(s) processed`);
  }

  return { inserted, failed };
}

async function main(): Promise<void> {
  loadEnvFiles();
  const commit = process.argv.includes("--commit");
  const serviceKey = serviceRoleKey();

  if (!serviceKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in the environment.");
    console.error("Add it to .env.local in the project root, then re-run.");
    process.exit(1);
  }

  let csvText: string;
  try {
    csvText = readFileSync(CSV_PATH, "utf8");
  } catch {
    console.error(`Could not read ${CSV_PATH}`);
    console.error("Place members.csv in the project root and try again.");
    process.exit(1);
  }

  const rawRows = parseCsv(csvText);
  console.log(`Read ${rawRows.length} data row(s) from members.csv`);
  console.log(commit ? "Mode: COMMIT (will write to legacy_members)" : "Mode: DRY-RUN");

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Loading auth.users emails…");
  const authEmails = await fetchAllAuthEmails(admin);
  console.log(`  ${authEmails.size} registered email(s)`);

  console.log("Loading legacy_members emails…");
  const legacyEmails = await fetchAllLegacyEmails(admin);
  console.log(`  ${legacyEmails.size} existing legacy row(s)`);

  const report: ReportRow[] = [];
  const seenInCsv = new Set<string>();
  const toInsert: CsvRow[] = [];

  const counts: Record<RowStatus, number> = {
    "to-insert": 0,
    "skip-duplicate": 0,
    "skip-already-registered": 0,
    "skip-no-email": 0,
  };

  for (const row of rawRows) {
    const email = normEmail(row.email);
    if (!email) {
      counts["skip-no-email"] += 1;
      report.push({ ...row, email: "", status: "skip-no-email" });
      continue;
    }

    const normalized: CsvRow = { ...row, email };

    if (authEmails.has(email)) {
      counts["skip-already-registered"] += 1;
      report.push({ ...normalized, status: "skip-already-registered" });
      continue;
    }

    if (legacyEmails.has(email) || seenInCsv.has(email)) {
      counts["skip-duplicate"] += 1;
      report.push({
        ...normalized,
        status: "skip-duplicate",
        note: legacyEmails.has(email) ? "already in legacy_members" : "duplicate in CSV",
      });
      continue;
    }

    seenInCsv.add(email);
    counts["to-insert"] += 1;
    report.push({ ...normalized, status: "to-insert" });
    toInsert.push(normalized);
  }

  writeReport(report);
  console.log("\nSummary:");
  console.log(`  to-insert:              ${counts["to-insert"]}`);
  console.log(`  skip-duplicate:         ${counts["skip-duplicate"]}`);
  console.log(`  skip-already-registered: ${counts["skip-already-registered"]}`);
  console.log(`  skip-no-email:          ${counts["skip-no-email"]}`);
  console.log(`\nReport written to ${REPORT_PATH}`);

  if (!commit) {
    console.log("\nDry-run complete. Re-run with --commit to insert.");
    return;
  }

  if (toInsert.length === 0) {
    console.log("\nNothing to insert.");
    return;
  }

  console.log(`\nInserting ${toInsert.length} row(s) in batches of ${BATCH_SIZE}…`);
  const { inserted, failed } = await insertBatches(admin, toInsert);
  console.log(`\nDone. Inserted: ${inserted}, failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
