#!/usr/bin/env node
/*
 * DOES EVERY TOOL HERE SEE BOTH SPELLINGS OF THE SQL IT READS?
 *
 * SQL lets you write the same statement several ways. The quotes around
 * an identifier are optional. Keywords fold case. One ALTER TABLE can
 * carry many clauses. A schema prefix may be there or not. Every one of
 * those is a place where a regular expression can match the form its
 * author happened to be looking at and silently miss the other — and a
 * schema tool that misses a statement does not report an error. It
 * reports nothing, and nothing is what a healthy schema looks like.
 *
 * THIS HAS HAPPENED THREE TIMES IN THIS REPOSITORY, all found on
 * 2026-09-06 and all the same shape:
 *
 *   scripts/db-inventory.mjs required the quotes around a policy name, so
 *   70 of 206 policies — a third of every RLS policy the migrations
 *   define — were never in expected_policies, and MISSING POLICY could
 *   not fire for any of them.
 *
 *   scripts/db/pending-migrations.mjs had the same bug, in the tool
 *   CLAUDE.md names as the one to run before a deploy. Its DROP side was
 *   worse: 204 of 351 `drop policy` statements write the name bare, so
 *   the MAJORITY form was invisible in the list that VOIDS an earlier
 *   expectation — a policy a later migration deliberately removed stayed
 *   expected, which is a PENDING that is not pending.
 *
 *   Three tools took the first `add column` of a multi-clause ALTER and
 *   lost the rest: nine columns, among them
 *   user_integrations.consent_scopes. That is the failure in CLAUDE.md's
 *   opening story — a migration reported applied while a column it adds
 *   is missing — reachable by a tool that checks one column in three.
 *
 * SO THE QUESTION IS ASKED HERE, ON EVERY BUILD, IN TWO HALVES:
 *
 *   1. Which spellings does this repository actually use? A tool that
 *      sees one form is a defect only where both forms exist, and that
 *      is measured, not assumed.
 *   2. For every general SQL-reading pattern in scripts/ and src/: run it
 *      over the REAL corpus and compare with a permissive reference for
 *      the same family. Fewer matches than statements means blind.
 *
 * Run: node scripts/tests/sql-spellings.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
};

const SQL_FILES = [
  ...readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join("supabase/migrations", f)),
  "scripts/db/bootstrap-supabase.sql",
];
const corpus = SQL_FILES.map((f) =>
  readFileSync(path.join(ROOT, f), "utf8").replace(/--[^\n]*/g, "")
).join("\n\n");
const n = (re) => [...corpus.matchAll(re)].length;

// ---------------------------------------------------------------------
console.log("== 1. which spellings does this repository actually use ==");
//
// Each row is a dimension where SQL allows two forms. The point of
// printing the ones written only one way is that they are the LATENT
// traps: a pattern that assumes today's single form is not wrong yet,
// and becomes wrong the day somebody writes the other one.
const DIMENSIONS = [
  ["policy name quoted", /create\s+policy\s+"/gi, /create\s+policy\s+[a-z0-9_]/gi],
  ["drop policy name quoted", /drop\s+policy\s+(?:if\s+exists\s+)?"/gi, /drop\s+policy\s+(?:if\s+exists\s+)?[a-z0-9_]/gi],
  ["ALTER TABLE upper-case", /ALTER\s+TABLE/g, /alter\s+table/g],
  ["CREATE FUNCTION upper-case", /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/g, /create\s+(?:or\s+replace\s+)?function/g],
  ["SECURITY DEFINER upper-case", /SECURITY\s+DEFINER/g, /security\s+definer/g],
  ["newline before ON in a policy", /create\s+policy\s+\S+\s*\n\s*on\s/gi, /create\s+policy\s+\S+[ \t]+on\s/gi],
  ["dollar-tag on a function body", /as\s+\$[a-z][a-z0-9_]*\$/gi, /as\s+\$\$/gi],
];
const both = [];
for (const [name, a, b] of DIMENSIONS) {
  const [x, y] = [n(a), n(b)];
  if (x > 0 && y > 0) both.push(name);
  console.log(`        ${name.padEnd(32)} ${String(x).padStart(4)} / ${String(y).padStart(4)}   ${x > 0 && y > 0 ? "BOTH FORMS" : "one form"}`);
}
check(
  `the corpus was read and has statements to classify (${SQL_FILES.length} files, ${corpus.length} chars)`,
  SQL_FILES.length >= 40 && corpus.length > 100_000
);
check(
  `at least one dimension really is written both ways (${both.length}: ${both.join(", ")})`,
  both.length >= 3,
  "if this collapses to zero the whole file is measuring nothing"
);

// A multi-clause ALTER is its own dimension, counted as statements rather
// than as two spellings of a token.
const multi = [...corpus.matchAll(/alter\s+table[\s\S]*?;/gi)].filter(
  (m) => [...m[0].matchAll(/add\s+column/gi)].length > 1
);
const clausesInMulti = multi.reduce((s, m) => s + [...m[0].matchAll(/add\s+column/gi)].length, 0);
console.log(
  `        ${"multi-clause ALTER TABLE".padEnd(32)} ${String(multi.length).padStart(4)} statement(s) carrying ${clausesInMulti} add-column clauses`
);
check(
  `multi-clause ALTER TABLE statements exist to be missed (${multi.length})`,
  multi.length >= 1,
  "the three tools that lost nine columns were fixed against these; with none left the fix is untested"
);

// ---------------------------------------------------------------------
console.log("\n== 2. every general SQL pattern, run over the real corpus ==");
//
// A FAMILY IS COMPARED AGAINST A PERMISSIVE REFERENCE — case-insensitive,
// quote-tolerant, schema-tolerant, newline-tolerant — because the
// reference is what "all of them" means. If a tool's pattern finds fewer
// objects than the reference, the difference is the blind spot.
// A FAMILY IS COMPARED AGAINST A PERMISSIVE REFERENCE — case-insensitive,
// quote-tolerant, newline-tolerant — because the reference is what "all
// of them" means. If a tool's pattern finds fewer objects than the
// reference, the difference is the blind spot.
//
// THE REFERENCE IS public-SCHEMA ONLY, and that is a decision with a
// reason rather than a convenience: both schema tools filter their object
// lists to the public tables src/ queries, so auth.uid, storage.objects
// and their kin are outside them BY DESIGN. Counting those here would
// have marked eleven correct tools blind — which is how a check that
// finds everything ends up trusted for nothing. Section 3 counts the
// excluded set instead, so the limit is stated where it is real.
//
// AND OBJECTS BUILT INSIDE A DYNAMIC `execute '…'` STRING ARE NOT LITERAL
// DDL. public.zz_anon_default_probe is created and dropped inside a DO
// block in 20260909000000 to test whether anon can select; no static
// reader can be expected to see it, and none should be marked blind for
// not seeing it.
const literalDdl = corpus.replace(/execute\s+'(?:[^']|'')*'/gi, " ");
const FAM = {
  policy: {
    kw: /create[\s\S]{0,20}polic/i,
    ref: /create\s+policy\s+(?:"([^"]+)"|([a-z0-9_%$]+))\s+on\s+(?!storage\.|auth\.)/gi,
    key: (m) => (m[1] ?? m[2]).toLowerCase(),
  },
  function: {
    kw: /create[\s\S]{0,40}function/i,
    ref: /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi,
    key: (m) => m[1].toLowerCase(),
  },
  table: {
    kw: /create[\s\S]{0,40}table/i,
    ref: /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi,
    key: (m) => m[1].toLowerCase(),
  },
  column: {
    kw: /add[\s\S]{0,20}column/i,
    ref: /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi,
    key: (m) => m[1].toLowerCase(),
  },
  // THE DROP SIDE IS A FAMILY OF ITS OWN, and it is the one where this
  // repo's minority form is the QUOTED one: 204 `drop policy` statements
  // write the name bare against 147 that quote it. A reader of the create
  // side that happened to be right would still have been wrong here, and
  // dropsOf() in pending-migrations.mjs was — which matters more than the
  // create side, because this list is what VOIDS an expectation. Missing a
  // drop leaves a removed policy expected for ever.
  dropPolicy: {
    kw: /drop[\s\S]{0,20}polic/i,
    ref: /drop\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+(?!storage\.|auth\.)/gi,
    key: (m) => (m[1] ?? m[2]).toLowerCase(),
  },
};
for (const f of Object.values(FAM)) f.keys = new Set([...literalDdl.matchAll(f.ref)].map(f.key));

// SQL words are not object names. Anything else of three characters or
// more is this pattern naming a SPECIFIC object, and a specific pattern
// is not blind — it is specific.
const KEYWORDS = new Set(
  `create or replace function table policy index unique concurrently if not exists add column drop grant revoke
   on to public storage auth security definer invoker returns language plpgsql sql stable volatile immutable
   begin end declare select insert update delete using with check references primary key foreign default null
   true false integer text uuid timestamptz boolean bigint numeric jsonb array constraint enable row level alter
   cascade authenticated anon service_role identity generated always as trigger before after each statement for
   values from where and or set schema type view only materialized comment is exists`
    .split(/\s+/)
    .filter(Boolean)
);
const namesSomethingSpecific = (body) =>
  [...body.matchAll(/[a-z][a-z0-9_]{2,}/gi)].some((m) => !KEYWORDS.has(m[0].toLowerCase()));

// FOUR STRUCTURAL EXEMPTIONS, each one a shape that is deliberately
// partial, and each expressed as a rule rather than a list of line
// numbers — a list of line numbers goes stale on the next edit and then
// exempts whatever moved into that line.
const EXEMPT = [
  {
    why: "a negative assertion: it looks for the NON-idempotent form and expects to find none",
    test: (body) => /\(\?!\s*if[\\s+ ]+not/i.test(body) || /\(\?!if not exists\)/i.test(body),
  },
  {
    why: "a mutation payload: a literal string searched for in another file's SOURCE, not applied to SQL",
    test: (_body, file) => file.endsWith(".mutation.mjs"),
  },
  {
    why: "a format() template matcher: it targets the %1$s placeholder the module loop builds at run time",
    // `%1\$s` IN THE SOURCE, because a regex literal escapes the dollar.
    // Testing for the unescaped "%1$" matched nothing, the exemption
    // counted zero, and the template matcher was reported blind against
    // 188 policies it was never looking for.
    test: (body) => /%1\\?\$/.test(body),
  },
  {
    why: "names a specific object rather than a family",
    test: (body) => namesSomethingSpecific(body),
  },
];

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const f = path.join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.(mjs|ts)$/.test(f)) files.push(f);
  }
};
walk(path.join(ROOT, "scripts"));
walk(path.join(ROOT, "src"));

const RE_LITERAL = /\/(?![*/])((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+)\/([gimsuy]*)/g;
const readsSql = (s) => /readFileSync\([^)]*\.sql|migrations|bootstrap-supabase|\.sql["'`]/.test(s);
// THIS FILE'S OWN REFERENCE PATTERNS ARE NOT SUBJECTS. Probing them
// against the corpus compares each reference with itself and with the
// other three, which is noise, and on the first run it produced eleven
// of them.
const SELF = path.relative(ROOT, new URL(import.meta.url).pathname);

const blind = [];
const elsewhere = [];
let probed = 0;
const exemptCounts = Object.fromEntries(EXEMPT.map((e) => [e.why, 0]));
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!readsSql(src)) continue;
  const rel = path.relative(ROOT, f);
  if (rel === SELF) continue;
  for (const m of src.matchAll(RE_LITERAL)) {
    const body = m[1];
    const flags = m[2];
    if (body.length < 10) continue;
    const famName = Object.keys(FAM).find((k) => FAM[k].kw.test(body));
    if (!famName) continue;
    const ex = EXEMPT.find((e) => e.test(body, rel));
    if (ex) {
      exemptCounts[ex.why]++;
      continue;
    }
    let re;
    try {
      re = new RegExp(body, flags.includes("g") ? flags : flags + "g");
    } catch {
      continue;
    }
    const where = `${rel}:${src.slice(0, m.index).split("\n").length}`;
    const fam = FAM[famName];
    // ANY CAPTURE GROUP, OR THE WHOLE MATCH. Where a pattern puts the
    // object's name is its own business — group 1 here, group 2 there —
    // and a comparison that assumed group 1 marked correct tools blind.
    let seen;
    try {
      seen = new Set();
      for (const x of literalDdl.matchAll(re)) {
        for (const g of x) if (typeof g === "string") seen.add(g.replace(/"/g, "").toLowerCase());
      }
    } catch {
      continue;
    }
    const missed = [...fam.keys].filter((k) => !seen.has(k));
    // A PATTERN THAT FINDS NONE OF ITS FAMILY HERE IS READING SOMETHING
    // ELSE — the generated repair SQL, or one migration opened on its
    // own — and probing it against this corpus says nothing about it.
    //
    // AND THIS IS THE HONEST LIMIT OF THIS SECTION, stated rather than
    // buried: a pattern that is TOTALLY blind is indistinguishable from
    // one that reads other text. Both find zero. So they are counted and
    // named below instead of being silently passed.
    if (missed.length === fam.keys.size) {
      elsewhere.push(`${where} [${famName}]`);
      continue;
    }
    probed++;
    if (missed.length > 0) {
      blind.push({ where, fam: famName, sees: fam.keys.size - missed.length, of: fam.keys.size, missed });
    }
  }
}

console.log(`        ${probed} general pattern(s) probed against the corpus`);
for (const [why, count] of Object.entries(exemptCounts)) console.log(`        ${String(count).padStart(3)} exempt — ${why}`);
console.log(`        ${elsewhere.length} read some other text (match none of their family here): ${elsewhere.join(", ") || "none"}`);
// AND A FLOOR ON THE WALK ITSELF, which is what `blind` and `flatAlter`
// are ultimately derived from. gate-vacuity.test.mjs traces an emptiness
// assertion back to its scan and wants a positive floor somewhere in that
// chain: without one, a walk that returned nothing makes "0 blind" and
// "0 flat" both true and both worthless.
check(
  `the walk found source to read (${files.length} files) and patterns were probed (${probed}), and every exemption still applies to something`,
  files.length >= 50 && probed >= 5 && Object.values(exemptCounts).every((c) => c > 0),
  "an exemption matching nothing is a rule that has gone stale, and a stale exemption hides the next one"
);
// THE FLOOR IS IN THE SAME EXPRESSION, not in the check above it —
// gate-vacuity.test.mjs is right to insist: `blind.length === 0` is also
// true when nothing was scanned, and a green check over an empty set is
// the failure this whole file is about.
check(
  `no general SQL pattern sees fewer objects than the corpus holds (${probed} probed, ${blind.length} blind)`,
  probed >= 5 && blind.length === 0,
  blind
    .map((b) => `${b.where} [${b.fam}] sees ${b.sees}/${b.of}, misses ${b.missed.slice(0, 5).join(", ")}`)
    .join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 2b. the extractor CALLED, not read ==");
//
// SECTION 2 TESTS PATTERNS IN ISOLATION, AND THAT IS NOT ENOUGH — its own
// mutations proved it. The multi-clause ALTER bug does not live in a
// pattern; it lives in the COMPOSITION of two. Read on its own, the inner
// `add column …` regex matches all 108 columns in the corpus and looks
// perfect. It is the outer statement regex around it that decides how
// much text the inner one ever gets to see, and three tools cut that text
// at the first comma.
//
// So this section stops reading source and calls the extractor. What it
// returns is the only thing that was ever the question.
const { objectsOf, dropsOf } = await import("../db/pending-migrations.mjs");
const derived = { column: new Set(), policy: new Set(), table: new Set(), function: new Set() };
const derivedDrops = new Set();
for (const f of SQL_FILES) {
  const sql = readFileSync(path.join(ROOT, f), "utf8");
  for (const o of objectsOf(sql)) if (derived[o.kind]) derived[o.kind].add(o.name.toLowerCase());
  for (const d of dropsOf(sql)) if (d.kind === "policy") derivedDrops.add(d.name.toLowerCase());
}
// A NAME WITH A FORMAT PLACEHOLDER IS SKIPPED BY objectsOf ON PURPOSE —
// it is built by a DO block at run time and cannot be checked by name —
// so it is taken out of the reference here rather than counted as a miss.
const realPolicies = [...FAM.policy.keys].filter((k) => !k.includes("%"));
for (const [label, want, got] of [
  ["columns", [...FAM.column.keys], derived.column],
  ["policies", realPolicies, derived.policy],
  ["tables", [...FAM.table.keys], derived.table],
  ["functions", [...FAM.function.keys], derived.function],
  ["policy DROPs", [...FAM.dropPolicy.keys], derivedDrops],
]) {
  const missing = want.filter((k) => !got.has(k));
  check(
    `objectsOf/dropsOf derive every ${label} in the corpus (${want.length - missing.length}/${want.length})`,
    want.length > 0 && missing.length === 0,
    missing.slice(0, 8).join(", ") + (missing.length > 8 ? ` … and ${missing.length - 8} more` : "")
  );
}

console.log("\n== 2c. no tool may read one ALTER clause and stop ==");
//
// The two tools that do NOT export their extractor cannot be called, so
// the shape is checked instead — and the shape is decidable. A single
// pattern that reaches from `alter table` all the way to a captured
// column name can only ever see the FIRST clause of
// `alter table t add column a …, add column b …;`. There is no way to
// write that shape correctly, which is what makes forbidding it fair.
const flatAlter = [];
const alterPatterns = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!readsSql(src)) continue;
  const rel = path.relative(ROOT, f);
  if (rel === SELF || rel.endsWith(".mutation.mjs")) continue;
  for (const m of src.matchAll(RE_LITERAL)) {
    const b = m[1];
    if (!/alter[\s\S]*table/i.test(b)) continue;
    const where = `${rel}:${src.slice(0, m.index).split("\n").length}`;
    alterPatterns.push(where);
    if (/add[\s\S]{0,30}column/i.test(b) && /\([^)]*\)[\s\S]*add[\s\S]{0,30}column/i.test(b)) {
      flatAlter.push(where);
    }
  }
}
// THE SAME FLOOR, FOR THE SAME REASON: zero flat patterns is the right
// answer only if there were ALTER TABLE patterns to look at.
check(
  `no pattern reaches from ALTER TABLE to a column name in one go (${alterPatterns.length} ALTER patterns, ${flatAlter.length} flat)`,
  alterPatterns.length >= 3 && flatAlter.length === 0,
  flatAlter.join(", ") + " — split it: match the statement, then every add-column clause inside it"
);

// ---------------------------------------------------------------------
console.log("\n== 3. what these tools deliberately do NOT cover ==");
//
// STATED, NOT SILENT. Both schema tools filter to the objects src/ uses,
// which are in `public`. Everything in auth. and storage. is therefore
// outside them — and storage.objects is the exact corner where the local
// stub and production were found to disagree on 2026-09-05. Counting the
// excluded set here is not a fix. It is the difference between a limit
// somebody chose and a hole nobody knows about.
const nonPublic = {
  "policies on storage.objects": n(/create\s+policy\s+(?:"[^"]+"|[a-z0-9_]+)\s+on\s+storage\./gi),
  "functions in auth./storage.": n(/create\s+(?:or\s+replace\s+)?function\s+(?:auth|storage)\./gi),
  "tables in auth./storage.": n(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:auth|storage)\./gi),
};
for (const [k, v] of Object.entries(nonPublic)) console.log(`        ${k.padEnd(32)} ${String(v).padStart(4)}`);
check(
  `the non-public objects are known and counted (${Object.values(nonPublic).reduce((a, b) => a + b, 0)})`,
  Object.values(nonPublic).every((v) => v > 0),
  "these are outside db-inventory.mjs and pending-migrations.mjs by design; if the count goes to zero this section is measuring nothing"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
