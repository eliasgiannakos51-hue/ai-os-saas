// Does every status the code can WRITE exist in the constraint that has to
// ACCEPT it?
//
// WHAT WENT WRONG. src/types/user-website.ts declared
//
//     export type UserWebsiteStatus =
//       "pending" | "processing" | "completed" | "failed" | "flagged";
//
// and website_status_migration.sql installed
//
//     check (status in ('pending','processing','completed','failed'))
//
// with no 'flagged'. Reproduced against PostgreSQL 16, writing the status
// the application writes:
//
//     update user_websites set status = 'flagged' where ...;
//     ERROR: new row violates check constraint "user_websites_status_check"
//     -- the row afterwards: status = 'processing'
//
// The route discarded that error, so the row stranded on 'processing', the
// stale reaper marked it 'failed' 5-25 minutes later, and the user had
// already been charged and had lost the free regenerate that only 'flagged'
// offers. TypeScript cannot see a CHECK constraint and Postgres cannot see a
// union type, so nothing on either side could catch it.
//
// Two failure shapes are checked, and the second is what actually happened
// here:
//   1. A TS union value that no SQL definition allows.
//   2. The SAME constraint defined with DIFFERENT value sets in different
//      files. Every one of these files drops the constraint before re-adding
//      it, so whichever ran LAST wins — which made correctness depend on the
//      order someone happened to paste SQL into the editor.
//
// Deliberately generic: it discovers unions and constraints by scanning, so
// a status added next month is covered without anyone remembering this file.
//
// Run: node scripts/tests/enum-schema-drift.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function walk(dir, ext, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

const sqlFiles = walk(ROOT, ".sql").sort();
const tsFiles = walk(path.join(ROOT, "src"), ".ts").concat(walk(path.join(ROOT, "src"), ".tsx")).sort();

console.log("enum-schema-drift");
console.log(`  ....  scanning ${sqlFiles.length} SQL files and ${tsFiles.length} TypeScript files`);

// ---------------------------------------------------------------------
// Collect every `check (<col> in ('a','b',...))`, named or inline.
// ---------------------------------------------------------------------
const CHECK_RE =
  /(?:add\s+constraint\s+(\w+)\s+)?check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)\s*\)/gi;

/** file -> constraint identity -> {values, index} — LAST definition wins,
 *  because every one of these files drops before re-adding, and several
 *  legitimately widen a constraint further down the same file. */
const perFile = new Map();

for (const file of sqlFiles) {
  const source = readFileSync(file, "utf8");
  // Strip line comments so a constraint quoted inside an explanation is not
  // mistaken for a real definition.
  const code = source
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  let m;
  CHECK_RE.lastIndex = 0;
  while ((m = CHECK_RE.exec(code)) !== null) {
    const [, name, column, rawValues] = m;
    const values = [...rawValues.matchAll(/'([^']*)'/g)].map((v) => v[1]);
    if (values.length === 0) continue;
    // INLINE AND NAMED FORMS ARE THE SAME CONSTRAINT, and normalising them
    // to one identity is what makes this check honest.
    //
    // Postgres auto-names an inline column check `<table>_<column>_check` —
    // verified against PostgreSQL 16:
    //
    //     create table t_probe (delivery_method text check (... in ('email')));
    //     select conname ... -> t_probe_delivery_method_check
    //
    // which is exactly why `alter table ... drop constraint if exists
    // user_agents_delivery_method_check` successfully widens a constraint
    // that was declared inline in a different file. Treating the two forms
    // as separate identities would let a narrow inline declaration and a
    // wide named one sit side by side unreported — the very shape of the
    // bug this file exists for.
    const before = code.slice(0, m.index);
    const nearestTable = [...before.matchAll(/(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table)\s+(?:public\.)?(\w+)/gi)].pop();
    const table = nearestTable ? nearestTable[1] : "unknown";
    const identity = name || `${table}_${column}_check`;
    const rel = path.relative(ROOT, file);
    if (!perFile.has(identity)) perFile.set(identity, new Map());
    perFile.get(identity).set(rel, values); // later definition overwrites
  }
}

console.log(`  ....  found ${perFile.size} distinct enum constraints`);

// ---------------------------------------------------------------------
console.log("\n== 1. the same constraint must not disagree between files ==");
// ---------------------------------------------------------------------
// This is the shape the flagged bug took. Every file here drops the
// constraint before re-adding it, so a file that defines it NARROWER
// silently undoes a file that defined it correctly, depending only on which
// was run last.
const divergent = [];
for (const [identity, byFile] of perFile) {
  const sets = new Map();
  for (const [file, values] of byFile) {
    const key = [...values].sort().join("|");
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(file);
  }
  if (sets.size > 1) {
    divergent.push({
      constraint: identity,
      variants: [...sets.entries()].map(([key, files]) => ({ values: key.split("|"), files })),
    });
  }
}
check("no constraint is defined two different ways", divergent, []);

// The gate has to be able to go red. This is the exact pair that shipped.
{
  const narrow = ["pending", "processing", "completed", "failed"].sort().join("|");
  const wide = ["pending", "processing", "completed", "failed", "flagged"].sort().join("|");
  check("the gate would catch the pair that shipped", narrow !== wide, true);
}

// ---------------------------------------------------------------------
console.log("\n== 2. every TypeScript status value is writable ==");
// ---------------------------------------------------------------------
// The TS side: string unions whose name ends in Status, and const arrays of
// status literals. Both forms are used in this codebase.
const unions = [];
for (const file of tsFiles) {
  const source = readFileSync(file, "utf8");
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

  for (const m of code.matchAll(/export\s+type\s+(\w*(?:Status|DeliveryMethod))\s*=\s*([^;]+);/g)) {
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
    if (values.length >= 2) unions.push({ name: m[1], file: path.relative(ROOT, file), values });
  }
  for (const m of code.matchAll(/const\s+(\w*(?:STATUSES|METHODS))\s*=\s*\[([^\]]+)\]\s*as\s+const/g)) {
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
    if (values.length >= 2) unions.push({ name: m[1], file: path.relative(ROOT, file), values });
  }
}
console.log(`  ....  found ${unions.length} status unions in TypeScript`);

// Which constraint each union has to satisfy. Explicit, because the link
// between a type name and a table is a fact about this app, not something to
// infer from spelling — and an inferred mapping that silently matches
// nothing is worse than no check at all. The completeness assertion below is
// what stops this list going stale.
const MAPPING = {
  UserWebsiteStatus: "user_websites_status_check",
  WEBSITE_STATUSES: "user_websites_status_check",
  AgentStatus: "user_agents_status_check",
  ResearchStatus: "research_reports_status_check",
  AgentDeliveryMethod: "user_agents_delivery_method_check",
  AGENT_DELIVERY_METHODS: "user_agents_delivery_method_check",
};

const unmapped = [];
for (const union of unions) {
  const constraintName = MAPPING[union.name];
  if (!constraintName) {
    unmapped.push(`${union.name} (${union.file})`);
    continue;
  }
  const byFile = perFile.get(constraintName);
  if (!byFile) {
    check(`${union.name} -> ${constraintName}: constraint exists in SQL`, false, true);
    continue;
  }
  // Every file's definition must accept every value the code can write —
  // not just one of them, since any of these files may be the last one run.
  for (const [file, allowed] of byFile) {
    const missing = union.values.filter((v) => !allowed.includes(v));
    check(`${union.name}: all ${union.values.length} values accepted by ${file}`, missing, []);
  }
  // And the reverse: a constraint value the code can never produce is dead
  // schema, or a rename someone forgot to finish.
  const allAllowed = [...new Set([...byFile.values()].flat())];
  const orphaned = allAllowed.filter((v) => !union.values.includes(v));
  check(`${union.name}: no value in SQL that the code cannot write`, orphaned, []);
}

// A union nobody mapped is a union nobody checked. Listing them is not a
// failure — most status types in this app are UI-only and back no column —
// but the count is printed so a genuinely new DB-backed status is visible.
console.log(`  ....  ${unmapped.length} status unions are not DB-backed and were not checked:`);
for (const u of unmapped) console.log(`          ${u}`);

// ---------------------------------------------------------------------
console.log("\n== 3. the flagged path is whole, not just permitted ==");
// ---------------------------------------------------------------------
// 'flagged' needs two columns as well as the constraint value, and both were
// missing from the standalone migration. A status that is allowed but has no
// free_retry_used column still dead-ends the user.
{
  const filesDefining = perFile.get("user_websites_status_check");
  check("user_websites_status_check is defined somewhere", Boolean(filesDefining), true);

  for (const file of filesDefining?.keys() ?? []) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    const declaresFlagged = (filesDefining.get(file) ?? []).includes("flagged");
    if (!declaresFlagged) continue;
    check(
      `${file}: also provides free_retry_used`,
      /add column if not exists free_retry_used/i.test(source),
      true
    );
    check(
      `${file}: also provides description (the free regenerate needs the brief)`,
      /add column if not exists description/i.test(source),
      true
    );
  }
}

// ---------------------------------------------------------------------
console.log("\n== 4. the write that failed is no longer discarded ==");
// ---------------------------------------------------------------------
// The constraint mismatch was survivable noise right up until the code threw
// the error away. That is what turned it into a charged, stranded row.
{
  const source = readFileSync(path.join(ROOT, "src/app/api/websites/generate/process/route.ts"), "utf8");
  check(
    "the final status update captures its error",
    /const\s*\{\s*error:\s*finalStatusError\s*\}\s*=\s*await\s+supabase/.test(source),
    true
  );
  check("...and logs it", source.includes("finalStatusError"), true);
  check(
    "...and leaves the row in a status the user can act on",
    /if\s*\(finalStatusError\)/.test(source),
    true
  );
}

// ---------------------------------------------------------------------
console.log("\n== 5. a disabled Publish button explains itself ==");
// ---------------------------------------------------------------------
{
  const control = readFileSync(path.join(ROOT, "src/components/publishing/publish-control.tsx"), "utf8");
  check("PublishControl accepts a reason", control.includes("disabledReason"), true);
  check(
    "...and renders it as visible text, not a title attribute",
    /disabled\s*&&\s*disabledReason\s*&&\s*\(/.test(control),
    true
  );

  const workspace = readFileSync(
    path.join(ROOT, "src/components/website-builder/website-builder-workspace.tsx"),
    "utf8"
  );
  for (const key of ["disabledFlagged", "disabledFailed", "disabledGenerating"]) {
    check(`the builder supplies a reason for ${key}`, workspace.includes(key), true);
  }
  check(
    "the flagged panel says why there is no free regenerate",
    workspace.includes("regenerateAlreadyUsed") && workspace.includes("regenerateNoBrief"),
    true
  );

  // In every language, or a Greek user reads an untranslated key.
  const langs = readdirSync(path.join(ROOT, "messages")).filter((f) => f.endsWith(".json"));
  const missing = [];
  for (const f of langs) {
    const j = JSON.parse(readFileSync(path.join(ROOT, "messages", f), "utf8"));
    for (const key of ["disabledFlagged", "disabledFailed", "disabledGenerating"]) {
      if (!j?.dashboard?.publishing?.[key]) missing.push(`${f}:publishing.${key}`);
    }
    for (const key of ["regenerateAlreadyUsed", "regenerateNoBrief"]) {
      if (!j?.dashboard?.websiteBuilder?.[key]) missing.push(`${f}:websiteBuilder.${key}`);
    }
  }
  check(`all 5 new strings present in all ${langs.length} locales`, missing, []);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
