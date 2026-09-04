// IS WHAT THE CODE SAYS ABOUT ITSELF TRUE?
//
// This repository's comments carry the reasoning. They name the file that
// does the other half, the gate that would have caught it, the route that
// reads the column. That is what makes them worth reading, and it is
// exactly why a wrong one costs more here than elsewhere: a reader who
// follows a path to nothing stops trusting the ones that lead somewhere.
//
// EVERY INSTRUMENT DEFECT THIS PROJECT HAS FOUND WAS THIS SHAPE:
//
//   · app/offline/page.tsx said the locale it needed "lives behind a
//     request this page exists precisely because it failed". It does not —
//     the page is fetched once, over the network, at worker install — and
//     offline-state.test.mjs REQUIRED the excuse, so fixing the page meant
//     turning a gate red.
//   · i18n-coverage's header said "86 of these still ship". 160 did.
//   · trading/conduct.ts listed three layers of defence in the present
//     tense. Only the third was running: nothing calls the other two.
//   · README said the weekly digest and the credit reset were unscheduled.
//     Both were in vercel.json, on a schedule, the whole time.
//
// THE RULE: a statement about this repository is either machine-checkable
// or it does not exist. This file is the machine-checkable half.
//
// ---------------------------------------------------------------------
// WHAT IS CHECKED, AND WHAT IS DELIBERATELY NOT
// ---------------------------------------------------------------------
//
// PATHS — held at ZERO. `node scripts/scan-self-claims.mjs` reads every
// comment in src/, scripts/ and supabase/, plus the markdown, and resolves
// every path it names. Around 2,370 claims; the 19 that remain are all in
// the table below with a reason and a staleness check of its own. The
// counts here are the shape of the answer, not the assertion — the
// assertions read the scan live.
//
// The first run found 55, of which 23 were wrong and are now fixed: two
// README lines still pointing at an src/lib/admin.ts a rename removed,
// SIX `Run:` headers naming a DIFFERENT suite than the file they head
// (one of them heading twelve lines of another suite's description,
// copied whole), a migration crediting a module that does not exist, a
// page naming a latency gate that was never written, and
// lib/ui/roving-index.ts naming a gate this same session forgot to create
// under that name.
//
// SYMBOLS — measured, and NOT gated. The same scan reads constants and
// calls named in comments: ~1,470 claims, 24 unresolved, of which exactly
// ONE was genuinely wrong (badge-credits.ts said BADGE_PLANS where
// badge.ts declares BADGED_PLANS). Precision about 4%. The rest are
// Chromium error codes, env keys the code BUILDS rather than writes
// (`CREDIT_MARGIN_${feature.toUpperCase()}`), prose describing a shape
// ("ALL_CAPS", "SCREAMING_SNAKE"), and names a comment is explicitly
// saying are gone. A check with that ratio would be a check whose
// baseline gets set to the size of the problem, which is the same as
// deleting it — so the number is reported by the scanner and this file
// does not assert it.
//
// NUMERIC CLAIMS — not attempted. "covers every X", "the 22 aria-labels",
// "681 prose strings": there is no general way to check one, and a
// scanner that guessed would produce a list nobody reads. Where such a
// claim matters, the number is DERIVED at the point it is printed —
// i18n-coverage's BASELINE_TOTAL is a reduce over the table rather than a
// second number that can disagree with the first.
//
// Run: node scripts/tests/self-claims.test.mjs
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ABSENT_ON_PURPOSE } from "./lib/absent-on-purpose.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const report = JSON.parse(
  execFileSync("node", ["scripts/scan-self-claims.mjs", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
);

console.log("== 1. every path a comment names is a path that is there ==");
check(
  `the scan read the tree (${report.scanned.code} source, ${report.scanned.markdown} markdown)`,
  report.scanned.code >= 1000 && report.scanned.markdown >= 3,
  JSON.stringify(report.scanned)
);
check(
  `...and found claims to resolve (${report.claims.paths} paths)`,
  report.claims.paths >= 1500,
  String(report.claims.paths)
);

const unexplained = report.findings.paths.filter(
  (f) => !(ABSENT_ON_PURPOSE[f.file]?.paths ?? []).includes(f.claim)
);
check(
  "no comment names a file that is not there",
  unexplained.length === 0,
  unexplained.map((f) => `${f.file}:${f.line}  ${f.claim}\n          ${f.text}`).join("\n        ")
);

console.log("\n== 1b. and no exception in the table has gone stale ==");
// AN ALLOWLIST THAT CANNOT GO STALE. Both directions: an entry whose file
// now exists is an exception that should be deleted, and an entry the scan
// no longer reports is a comment that was rewritten without cleaning up
// after it.
const revived = [];
const orphaned = [];
for (const [file, entry] of Object.entries(ABSENT_ON_PURPOSE)) {
  check(`${file}: the exception says why`, typeof entry.reason === "string" && entry.reason.length > 40);
  for (const claim of entry.paths) {
    if (existsSync(claim) || existsSync(`src/${claim}`)) revived.push(`${file} -> ${claim}`);
    if (!report.findings.paths.some((f) => f.file === file && f.claim === claim)) {
      orphaned.push(`${file} -> ${claim}`);
    }
  }
}
check("no allowed path has come back into the tree", revived.length === 0, revived.join(", "));
check("...and no entry describes a claim the scan no longer sees", orphaned.length === 0, orphaned.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 2. a Run: line names the file it is in ==");
// FOUR OF THESE WERE WRONG, all from a header copied off a sibling:
// message-slices.mutation.mjs said to run marketing-messages.mutation.mjs,
// sidebar-tooltips.prodtest.mjs named a -production.test.mjs that does not
// exist, and both website .itest.mjs suites pointed at their .test.mjs
// twin. Somebody following any of them runs a different suite and believes
// they have run this one.
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(mjs|js)$/.test(p)) out.push(p);
  }
  return out;
}
const scripts = walk("scripts");
// A FLOOR ON THE WALK, not only on the Run: lines it finds. gate-vacuity
// failed the first version of this section: "no header is wrong" is
// trivially true of a walk that found no files, and the Run: count below
// is derived from the same walk rather than independent of it.
check(`the scripts tree was walked (${scripts.length} files)`, scripts.length >= 200, String(scripts.length));
const wrongRun = [];
let runLines = 0;
for (const file of scripts) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/Run:\s*(?:node\s+)?(scripts\/[A-Za-z0-9_./-]+\.m?js)/g)) {
    runLines++;
    if (m[1] !== file) wrongRun.push(`${file} says to run ${m[1]}`);
  }
}
check(`Run: headers were found (${runLines})`, runLines >= 100, String(runLines));
check("every Run: header names its own file", wrongRun.length === 0, wrongRun.join("\n        "));

// ---------------------------------------------------------------------
console.log("\n== 3. the symbol scan is reported, not asserted ==");
// Stated here so the number is visible in the build output and so nobody
// mistakes its absence from the assertions above for its absence from the
// scan. See this file's header for why 4% precision is not a gate.
console.log(
  `        ${report.claims.symbols} symbol claims, ${report.wrong.symbols} unresolved ` +
    `(mostly external error codes, constructed env keys and shape names — one was real)`
);
check(
  "the symbol scan still runs, so the number stays honest",
  report.claims.symbols >= 1000 && typeof report.wrong.symbols === "number",
  JSON.stringify(report.claims)
);
check(
  "...and it has not silently grown into a category nobody reads",
  report.wrong.symbols <= 40,
  `${report.wrong.symbols} unresolved — if this is climbing, either the corpus is missing a ` +
    `source of real names or comments are naming things that are gone`
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
