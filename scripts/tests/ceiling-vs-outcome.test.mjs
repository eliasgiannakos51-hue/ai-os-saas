// A CEILING IS A LIMIT, NOT A PREDICTION — held at zero, with every rung
// of the detector pinned by a fixture.
//
// scripts/scan-ceiling-vs-outcome.mjs reports FOUR buckets for every
// comparison in the tree that names a ceiling-shaped constant, and the
// fourth — a conclusion about behaviour drawn from two values nobody ran
// — is the shape scan-estimate-realism.mjs had before it was deleted on
// 2026-09-23. It flagged seven billing profiles and zero were real,
// because every profile in the table is far under its own ceiling; a
// threshold on that ratio is a line under the data rather than through
// it. docs/shapes.md carries the account under "A metric that measures
// the wrong quantity".
//
// THE SCAN NOW REPORTS ZERO, AND THAT IS THE PROBLEM THIS FILE SOLVES.
// An empty result is indistinguishable from a classifier that returns an
// empty array — the exact failure CLAUDE.md records for the first LITERAL
// detector in scan-gate-independence, which counted `.length > 0` and so
// matched 264 of 275 gates while NONE could never happen. So the count is
// held at its baseline AND each of the four rungs is pinned with a
// fixture, the fourth being a reconstruction of the assertion the deleted
// scan actually carried.
//
// Run: node scripts/tests/ceiling-vs-outcome.test.mjs
import { execFileSync } from "node:child_process";
import { classify } from "../scan-ceiling-vs-outcome.mjs";
import {
  DECLARED_VS_DECLARED,
  ENFORCEMENT,
  MEASURED,
  DECLARATION,
} from "./fixtures/ceiling-rungs.mjs";

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

const report = JSON.parse(
  execFileSync("node", ["scripts/scan-ceiling-vs-outcome.mjs", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
);

console.log("== 1. the scan looked at something ==");
// THE CENSUS IS THE PROOF OF LIFE. A walk that reads nothing reports zero
// findings and zero of everything else, and only the second half of that
// is visible in a green log.
check(
  `ceilings are enforced in the product (${report.enforcement.length})`,
  report.enforcement.length >= 150,
  String(report.enforcement.length)
);
check(
  `gates check measured values against them (${report.measured.length})`,
  report.measured.length >= 80,
  String(report.measured.length)
);
check(
  `and some assertions are about a declared value itself (${report.declarationOnly.length})`,
  report.declarationOnly.length >= 5,
  String(report.declarationOnly.length)
);

console.log("\n== 2. nothing in the tree concludes about behaviour from two declarations ==");
check(
  `DECLARED vs DECLARED is zero (${report.findings.length})`,
  report.findings.length === 0,
  report.findings.map((f) => `${f.file}:${f.line}  ${f.text}`).join("\n        ")
);

console.log("\n== 3. each rung, pinned by a fixture ==");
// THE FOUR FIXTURES LIVE IN scripts/tests/fixtures, which the scan does
// not walk — see that file's header for why keeping them here made the
// scan report itself.
const d = classify("scripts/tests/zz.fixture.test.mjs", DECLARED_VS_DECLARED);
check(
  "the deleted scan's own assertion IS caught, rebuilt as a fixture",
  d.findings.length === 1,
  JSON.stringify(d.findings)
);
check(
  "...and it is not filed as measured",
  d.measured.length === 0,
  JSON.stringify(d.measured)
);

// A REAL, NON-GATE PATH. classify() reads the path only to decide
// whether the file is a gate, and gate-import-paths.test.mjs requires
// every src/… path written into a gate to exist — a fixture path that
// resolves to nothing is the same defect one level down.
// meeting-limits.ts is where this repository's own `if (bytes >
// MAX_MEETING_BYTES) reject` actually lives.
const e = classify("src/lib/meetings/meeting-limits.ts", ENFORCEMENT);
check(
  "a limit being ENFORCED is not a finding",
  e.findings.length === 0 && e.enforcement.length >= 1,
  JSON.stringify(e)
);

const m = classify("scripts/tests/zz.fixture.test.mjs", MEASURED);
check(
  "a ceiling checked against something the gate RAN is not a finding",
  m.findings.length === 0 && m.measured.length >= 1,
  JSON.stringify(m)
);

const dec = classify("scripts/tests/zz.fixture.test.mjs", DECLARATION);
check(
  "an assertion about the declared value itself is not a finding",
  dec.findings.length === 0 && dec.declarationOnly.length >= 2,
  JSON.stringify(dec)
);

console.log("\n== 4. the fixtures are told apart, not merely all accepted ==");
// A CLASSIFIER THAT PUT EVERYTHING IN ONE BUCKET would pass three of the
// four checks above. This is the one it could not.
const buckets = [
  ["declared", d.findings.length],
  ["enforcement", e.enforcement.length],
  ["measured", m.measured.length],
  ["declarationOnly", dec.declarationOnly.length],
];
check(
  "four fixtures land in four different buckets",
  buckets.every(([, n]) => n >= 1),
  JSON.stringify(buckets)
);
check(
  "the enforcement fixture is in NO gate bucket",
  e.measured.length === 0 && e.declarationOnly.length === 0 && e.findings.length === 0,
  JSON.stringify(e)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
