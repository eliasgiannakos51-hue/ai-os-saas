#!/usr/bin/env node
/*
 * CAN sample-data.test.mjs SEE THE SAMPLE TURN INTO REAL DATA?
 *
 * Eight mutations, eight dimensions. The first is the one this gate
 * exists for: `import_id` is `on delete set null`, so deleting the
 * user_imports record before the rows leaves thirty-six sample rows
 * behind with import_id = NULL — the exact shape of rows the user typed
 * by hand. The sample becomes real, permanently, and nothing downstream
 * can tell. It is a two-line reordering and it is silent.
 *
 *   1. the removal order is reversed
 *   2. the row delete stops being scoped to the import
 *   3. the dataset stops being pure, so a signed-out demo cannot use it
 *   4. the dataset carries a user_id
 *   5. the loader gains a credit charge
 *   6. the banner moves from the layout to nowhere
 *   7. the migration's rewritten CHECK drops an existing source
 *   8. the export stops carrying import_id
 *
 * Run: node scripts/tests/sample-data.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/sample-data.test.mjs";
const DATASET = "src/lib/sample-data/dataset.ts";
const APPLY = "src/lib/sample-data/apply.ts";
const LAYOUT = "src/app/dashboard/layout.tsx";
const MIGRATION = "supabase/migrations/20260913000000_sample_data_source.sql";
const EXPORT = "src/app/api/account/export/route.ts";
const TARGETS = [GATE, DATASET, APPLY, LAYOUT, MIGRATION, EXPORT];

const MUTANTS = [
  {
    // THE ONE. Move the import-record delete above the row loop.
    name: "the import record is deleted before the rows it owns",
    file: APPLY,
    from: "  // Rows first.\n  for (const t of materialiseSampleData(Date.now())) {",
    to:
      '  await supabase.from("user_imports").delete().eq("id", existing.id).eq("user_id", userId);\n' +
      "  for (const t of materialiseSampleData(Date.now())) {",
    expect: "the rows go FIRST",
  },
  {
    name: "the row delete stops being scoped to the import",
    file: APPLY,
    from: '      .eq("user_id", userId)\n      .eq("import_id", existing.id);',
    to: '      .eq("user_id", userId);',
    expect: "scoped to the user AND the import",
  },
  {
    name: "the dataset reaches for a database, so no signed-out demo can use it",
    file: DATASET,
    from: "/** A row with its date expressed as",
    to: 'import { createClient } from "@/lib/supabase/server";\n\n/** A row with its date expressed as',
    expect: "imports nothing at all",
  },
  {
    name: "the dataset starts carrying a user_id of its own",
    file: DATASET,
    from: '  { dayOffset: 86, description: "Τιμολόγιο — Ανακαίνιση site, Καφεκοπτείο Παπαδόπουλος", type: "income", amount: 1450.0 },',
    to: '  { dayOffset: 86, description: "Τιμολόγιο — Ανακαίνιση site, Καφεκοπτείο Παπαδόπουλος", type: "income", amount: 1450.0, user_id: "00000000-0000-0000-0000-000000000000" },',
    expect: "no row carries a user_id",
  },
  {
    name: "loading the sample starts charging for it",
    file: APPLY,
    from: 'import { logApiError } from "@/lib/log-error";',
    to: 'import { logApiError } from "@/lib/log-error";\nimport { deductCredits } from "@/lib/billing/credits";',
    expect: "neither does the loader",
  },
  {
    name: "the banner stops rendering from the layout",
    file: LAYOUT,
    from: "{sampleImport && <SampleDataBanner />}",
    to: "{false && sampleImport}",
    expect: "renders from the dashboard layout",
  },
  {
    // The CHECK is dropped and re-added in full, so a forgotten value
    // silently breaks every CSV import that was working yesterday.
    name: "the rewritten CHECK forgets an existing source",
    file: MIGRATION,
    from: "check (source in ('csv', 'paste', 'quick_add', 'gmail', 'google_drive', 'sample'));",
    to: "check (source in ('csv', 'paste', 'quick_add', 'gmail', 'sample'));",
    expect: "'google_drive' still is",
  },
  {
    name: "the export stops selecting every column",
    file: EXPORT,
    from: '.select("*")',
    to: '.select("id, user_id, created_at")',
    expect: "selects every column",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
      body: out,
    };
  }
}

console.log("sample-data mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget =
      result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
    if (!onTarget) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of sample-data.test.mjs is load-bearing.");
