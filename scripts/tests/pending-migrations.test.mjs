// WHAT THE PRE-DEPLOY TOOL EXPECTS TO FIND — asked without a database.
//
// scripts/db/pending-migrations.mjs is what CLAUDE.md names as the answer
// to "what else have I not run?", and its whole value is the EXPECTED set:
// the objects it derives from the migration text and then asks the
// database about. An object missing from that set cannot be reported
// missing from the database. Ever. Silently.
//
// THE DEFECT THIS FILE EXISTS FOR, measured 2026-09-08. Every idempotent
// policy in supabase/migrations is written
//
//     drop policy if exists "x" on t;
//     create policy "x" on t ...;
//
// because a migration here must be safe to paste twice. The rule that
// voids an object a migration creates and then drops — written for one
// real probe table, zz_anon_default_probe — asked only "does this file
// also drop it", with no notion of ORDER. So all 204 policies written
// that way cancelled themselves: 218 CREATE POLICY statements in the
// directory, FOURTEEN expected. Whole features at once — the trading
// journal, the notification tables, data analysis, bank and crypto, and
// every scoped policy on storage.objects.
//
// WHY IT LIVES IN A .test.mjs AND NOT IN THE dbtest. The derivation is
// pure text; only the comparison needs a server. Kept in
// pending-migrations.dbtest.mjs it ran when somebody had a Postgres, and
// the whole point is that this is the tool you reach for BEFORE a deploy,
// from a laptop, with nothing provisioned.
//
// Run: node scripts/tests/pending-migrations.test.mjs
import { expectedObjects, objectsOf, dropsOf } from "../db/pending-migrations.mjs";
import { readdirSync, readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const MIG_DIR = "supabase/migrations";
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();

console.log("== 1. the migrations were read at all ==");
const all = expectedObjects();
check(`every migration file is accounted for (${all.length})`, all.length === files.length && files.length >= 60, `${all.length} vs ${files.length}`);
const total = all.reduce((n, m) => n + m.objects.length, 0);
check(`they derive hundreds of objects (${total}, floor 600)`, total >= 600, String(total));

console.log("\n== 2. a drop-then-create is a create ==");
{
  // THE TWO SHAPES, SIDE BY SIDE. Same two statements, opposite order,
  // opposite answer — which is the whole content of the fix, and what a
  // count alone cannot express: 14 is a number too, and the count floor
  // that guarded this file was 400 and green throughout.
  // THE LEADING STATEMENT IS NOT DECORATION. Without it the drop sits at
  // character 0, and a parser that recorded every position as 0 would
  // compare 0 > 0, answer false, and pass this check while having lost
  // the ordering entirely — which is what the mutation that sets a
  // create's position to zero does. Measured: with the fixture starting
  // at the drop, that mutant came back WRONG.
  const idempotent =
    `alter table public.t enable row level security;\n` +
    `drop policy if exists "p" on public.t;\ncreate policy "p" on public.t for select using (true);`;
  const probe =
    `alter table public.t enable row level security;\n` +
    `create table if not exists public.zz_probe(id int);\ndrop table if exists public.zz_probe;`;
  const survives = (sql, kind, name) => {
    const o = objectsOf(sql).find((x) => x.kind === kind && x.name === name);
    if (!o) return false;
    return !dropsOf(sql).some((d) => d.kind === kind && d.name === name && d.extra === o.extra && d.at > o.at);
  };
  check("drop-then-create: the object exists afterwards, so it stays expected", survives(idempotent, "policy", "p"));
  check("create-then-drop: the probe does not, so it is voided", !survives(probe, "table", "zz_probe"));
  // AND THE POSITIONS ARE REAL. A parser that returned 0 for every `at`
  // would make the comparison above true for both shapes at once.
  const objs = objectsOf(idempotent);
  const drops = dropsOf(idempotent);
  check(
    "the create is recorded AFTER the drop, by character offset",
    objs[0].at > drops[0].at,
    `create at ${objs[0].at}, drop at ${drops[0].at}`
  );
}

console.log("\n== 3. every CREATE POLICY in the directory is expected ==");
{
  // THE DENOMINATOR IS COUNTED FROM THE SQL, not carried in prose. The
  // two spellings both count: this repo writes 148 policy names quoted
  // and 70 bare, and a pattern that stopped matching one of them would
  // halve the set without moving a single check.
  let statements = 0;
  let unquoted = 0;
  for (const f of files) {
    const sql = readFileSync(`${MIG_DIR}/${f}`, "utf8").replace(/^\s*--.*$/gm, "");
    for (const m of sql.matchAll(/create\s+policy\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_%$]*))\s+on\s/gi)) {
      const name = m[1] ?? m[2];
      if (/%\d*\$/.test(name)) continue; // built by format() in a DO block
      statements++;
      if (!m[1]) unquoted++;
    }
  }
  check(`both spellings were found (${statements} statements, ${unquoted} written without quotes)`, statements >= 200 && unquoted >= 50);
  const policies = all.flatMap((m) => m.objects.filter((o) => o.kind === "policy"));
  check(
    `the expected set carries them (${policies.length} of ${statements})`,
    policies.length >= statements - 25,
    `${policies.length} expected against ${statements} written — a drop-then-create policy is a policy that exists`
  );
}

console.log("\n== 4. the ten policies on storage.objects, by name ==");
{
  // THE ONE CORNER WHERE THIS PROJECT'S FIXTURE AND ITS PRODUCTION HAVE
  // ACTUALLY DISAGREED, and the one both schema tools were blind to.
  // Named one by one: a count of ten is satisfied by ten of the wrong
  // thing, and the reason they were invisible here was not a count at
  // all — it was the drop-then-create rule above.
  const STORAGE_POLICIES = [
    "select_own_user_files_objects",
    "insert_own_user_files_objects",
    "update_own_user_files_objects",
    "delete_own_user_files_objects",
    "select_own_website_references",
    "insert_own_website_references",
    "delete_own_website_references",
    "select_own_create_attachments",
    "insert_own_create_attachments",
    "delete_own_create_attachments",
  ];
  const expected = new Set(
    all.flatMap((m) => m.objects.filter((o) => o.kind === "policy" && o.extra === "storage.objects").map((o) => o.name))
  );
  const unseen = STORAGE_POLICIES.filter((n) => !expected.has(n));
  check(
    `all ${STORAGE_POLICIES.length} are expected, in the storage schema (${expected.size} found)`,
    unseen.length === 0,
    unseen.join(", ")
  );
  // AND THE SCHEMA IS PART OF THE KEY. Checking a storage policy against
  // pg_policies with schemaname = 'public' reports it missing on every
  // run for ever — which CLAUDE.md calls worse than no probe.
  const publicNamed = all.flatMap((m) =>
    m.objects.filter((o) => o.kind === "policy" && STORAGE_POLICIES.includes(o.name) && o.extra !== "storage.objects")
  );
  check("...and none of them is filed under public", publicNamed.length === 0, JSON.stringify(publicNamed.slice(0, 3)));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
