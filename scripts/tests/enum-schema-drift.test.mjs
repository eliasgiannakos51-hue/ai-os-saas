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
console.log("\n== 1. no migration NARROWS a constraint an earlier one widened ==");
// ---------------------------------------------------------------------
// THIS CHECK USED TO ASSERT SOMETHING STRONGER AND, SINCE THE
// CONSOLIDATION, WRONG: that no two files may define a constraint
// differently at all.
//
// That was exactly right for the twenty loose .sql files this file was
// written against. They sat unnumbered in the repository root, each one
// dropping the constraint before re-adding it, and nothing decided which
// ran last — so a file defining a constraint narrower than its neighbour
// was a live coin-flip, which is the shape the `flagged` bug took.
//
// supabase/migrations is not that. It is an ORDERED sequence, applied in
// filename order, and widening a constraint in a later migration is the
// normal way a schema grows: 20260803's baseline allows email and slack,
// and 20260814_agent_delivery_channels adds discord, telegram and in_app.
// Reporting that pair as drift is reporting the feature.
//
// So the invariant is restated as the thing that is still a bug: a later
// migration may ADD values, and may not REMOVE one, because a row already
// written with the removed value cannot be updated afterwards without a
// migration nobody wrote.
//
// archive/ is excluded entirely. Those files are superseded by
// construction — archive/README.md says so and db-inventory.test.mjs
// asserts none of them is at the root any more — so comparing them with
// the live schema compares history with the present.
const MIGRATIONS = "supabase/migrations/";
const narrowed = [];
const trail = [];
for (const [identity, byFile] of perFile) {
  const steps = [...byFile.entries()]
    .filter(([file]) => file.startsWith(MIGRATIONS))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (steps.length < 2) continue;
  trail.push(`${identity}: ${steps.map(([f, v]) => `${f.slice(MIGRATIONS.length)} -> ${v.length}`).join(", ")}`);
  for (let i = 1; i < steps.length; i++) {
    const [prevFile, prev] = steps[i - 1];
    const [file, values] = steps[i];
    const lost = prev.filter((v) => !values.includes(v));
    if (lost.length > 0) {
      narrowed.push({ constraint: identity, file, after: prevFile, removed: lost });
    }
  }
}
for (const line of trail) console.log(`  ....  ${line}`);
check("no migration removes a value an earlier one allowed", narrowed, []);

// The gate has to be able to go red on the real shape. A later migration
// that re-declares the delivery constraint WITHOUT discord silently makes
// every agent already delivering there un-updatable.
{
  const steps = [["a_baseline", ["email", "slack"]], ["b_later", ["email", "slack", "discord"]], ["c_last", ["email", "slack"]]];
  const lost = [];
  for (let i = 1; i < steps.length; i++) {
    lost.push(...steps[i - 1][1].filter((v) => !steps[i][1].includes(v)));
  }
  check("the gate would catch a later migration dropping a value", lost, ["discord"]);
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

  // `Channel` joined `Status` and `DeliveryMethod` here because
  // `DeliveryChannel` — the union that decides where an agent may send its
  // output — matched neither, and the array beside it is typed
  // (`: DeliveryChannel[] = [...]`) rather than `as const`, so it matched
  // neither pattern either. A DB-backed union spelled with a word this
  // file had not thought of is invisible to it, which is the same failure
  // class as the drift it was written to catch: the check passes because
  // it looked at nothing.
  for (const m of code.matchAll(/export\s+type\s+(\w*(?:Status|DeliveryMethod|Channel))\s*=\s*([^;]+);/g)) {
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
    if (values.length >= 2) unions.push({ name: m[1], file: path.relative(ROOT, file), values });
  }
  for (const m of code.matchAll(/const\s+(\w*(?:STATUSES|METHODS|CHANNELS))(?::[^=]+)?\s*=\s*\[([^\]]+)\]\s*(?:as\s+const)?;/g)) {
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
    if (values.length >= 2) unions.push({ name: m[1], file: path.relative(ROOT, file), values });
  }
}
// ALIASES. `export type AgentDeliveryMethod = DeliveryChannel;` and
// `export const AGENT_DELIVERY_METHODS: AgentDeliveryMethod[] =
// DELIVERY_CHANNELS;` are both real, exported, DB-backed names that the two
// regexes above cannot see, because neither declaration contains a single
// string literal — the values live one hop away.
//
// That is not a cosmetic gap. The alias is what the rest of the app imports:
// execute-agent.ts, deliver.ts and agent-config.ts all speak in
// `AgentDeliveryMethod`, never in `DeliveryChannel`. Repointing the alias at
// a different union is a one-line change that would move every one of those
// call sites onto a different value set, and an unresolved alias means this
// file would not notice.
//
// Resolved to a fixed point, because `AGENT_DELIVERY_METHODS` resolves
// through `DELIVERY_CHANNELS`, which is itself resolved in the same pass —
// a single pass would find one of the two and depend on file order for the
// other.
const aliasDecls = [];
for (const file of tsFiles) {
  const source = readFileSync(file, "utf8");
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
  // type X = Y;   (single bare identifier, no literals, no unions)
  for (const m of code.matchAll(/export\s+type\s+(\w*(?:Status|DeliveryMethod|Channel))\s*=\s*(\w+)\s*;/g)) {
    aliasDecls.push({ name: m[1], target: m[2], file: path.relative(ROOT, file) });
  }
  // const X: T[] = Y;   (bare identifier on the right)
  for (const m of code.matchAll(
    /const\s+(\w*(?:STATUSES|METHODS|CHANNELS))\s*(?::[^=]+)?=\s*(\w+)\s*;/g
  )) {
    aliasDecls.push({ name: m[1], target: m[2], file: path.relative(ROOT, file) });
  }
}

let resolvedAny = true;
const aliasResolved = [];
while (resolvedAny) {
  resolvedAny = false;
  const byName = new Map(unions.map((u) => [u.name, u]));
  for (const alias of aliasDecls) {
    if (byName.has(alias.name)) continue; // already resolved, or declared directly
    const target = byName.get(alias.target);
    if (!target) continue;
    unions.push({ name: alias.name, file: alias.file, values: target.values });
    aliasResolved.push(`${alias.name} -> ${alias.target}`);
    resolvedAny = true;
  }
}
if (aliasResolved.length > 0) {
  console.log(`  ....  resolved ${aliasResolved.length} aliases: ${aliasResolved.join(", ")}`);
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
  DeliveryChannel: "user_agents_delivery_method_check",
  DELIVERY_CHANNELS: "user_agents_delivery_method_check",
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
  // AGAINST THE EFFECTIVE CONSTRAINT — the LAST migration to define it —
  // and nothing else.
  //
  // This used to loop over every file, archive included, and pass if each
  // one accepted the union. That was the weaker claim wearing more PASS
  // lines: it reported "all 5 values accepted by archive/…" about a file
  // nothing runs, while saying nothing about what the database will
  // actually be after `supabase db push`. A superseded file agreeing is
  // not evidence; the final one is the only definition Postgres will hold.
  const migrationSteps = [...byFile.entries()]
    .filter(([file]) => file.startsWith(MIGRATIONS))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (migrationSteps.length === 0) {
    check(`${union.name} -> ${constraintName}: defined by a migration, not only by archive/`, false, true);
    continue;
  }
  const [effectiveFile, effective] = migrationSteps[migrationSteps.length - 1];
  const missing = union.values.filter((v) => !effective.includes(v));
  check(
    `${union.name}: all ${union.values.length} values accepted by the effective constraint (${effectiveFile})`,
    missing,
    []
  );
  // And the reverse: a constraint value the code can never produce is dead
  // schema, or a rename someone forgot to finish.
  const orphaned = effective.filter((v) => !union.values.includes(v));
  check(`${union.name}: no value in SQL that the code cannot write`, orphaned, []);
}

// A union nobody mapped is a union nobody checked. Listing them is not a
// failure — most status types in this app are UI-only and back no column —
// but the count is printed so a genuinely new DB-backed status is visible.
console.log(`  ....  ${unmapped.length} status unions are not DB-backed and were not checked:`);
for (const u of unmapped) console.log(`          ${u}`);

// THE COMPLETENESS ASSERTION THE COMMENT ABOVE MAPPING PROMISED.
//
// It said "The completeness assertion below is what stops this list going
// stale" — and there was none. Only the console.log above, which nobody
// reads in CI. So MAPPING could name a constraint that no longer exists,
// or miss every union in the file, and this file would still print ALL
// PASS. A comment describing a check that was never written is worse than
// no comment: it is the reason nobody went looking.
//
// Two halves, and both are needed:
{
  // 1. THE UNION SCANNER FOUND SOMETHING. Both patterns it uses are
  //    regexes over source; a rename of `export type ...Status` breaks
  //    them and every check in section 2 then loops over an empty array.
  //    Measured today: the scanner finds unions in double figures.
  check(`the union scanner found status unions (${unions.length})`, unions.length >= 8, true);

  // 2. EVERY MAPPING ENTRY POINTS AT A CONSTRAINT THAT EXISTS. A stale
  //    key here is silent: `MAPPING[union.name]` simply returns a name
  //    the SQL does not contain, and the union falls into the "constraint
  //    exists in SQL" failure — but a mapping entry whose UNION no longer
  //    exists fails nothing at all, because nothing ever looks it up.
  const mappedNames = new Set(unions.map((u) => u.name));
  const deadMappings = Object.keys(MAPPING).filter((name) => !mappedNames.has(name));
  check("no MAPPING entry names a union that no longer exists", deadMappings, []);

  // 3. AND EVERY MAPPED CONSTRAINT IS A REAL ONE.
  const knownConstraints = new Set(perFile.keys());
  const deadConstraints = [...new Set(Object.values(MAPPING))].filter((c) => !knownConstraints.has(c));
  check("no MAPPING entry names a constraint no migration defines", deadConstraints, []);
}

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
  check(`the langs scan found ${langs.length}`, langs.length >= 10,
    true);
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
