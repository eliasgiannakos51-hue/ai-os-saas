// WHAT DOES EACH GATE HAVE TO DISAGREE WITH?
//
// The owner's question, 2026-09-19, after the sidebar shipped a heading
// over nothing while every sidebar gate was green: "a gate that reads
// the same file as the code confirms that the file equals itself. How
// many others do that?"
//
// scan-gate-independence.mjs answers it as a LADDER rather than a
// verdict, because the verdict version scored 0 of 8. Each suite is
// reported at the strongest thing it holds the code up against:
// NETWORK, DOM, DB, DISK, EXECUTION, CROSS-KIND, LITERAL, NONE.
//
// This gate holds the two ends of that ladder:
//
//   1. THE CLASSIFIER CANNOT BECOME AN EVERYTHING-MATCHER. Its first
//      LITERAL detector counted `.length > 0`, which every gate's own
//      pass/fail footer satisfies — 264 of 275 matched, and a detector
//      that says yes to everything sorts nothing. Fixtures pin each
//      rung, and one fixture must come back NONE.
//
//   2. THE BOTTOM RUNG IS A NAMED LIST. Four build gates reach NONE.
//      All four were settled by MUTATION on 2026-09-19 and all four
//      HELD — each has a real reference the scan cannot name, written
//      out below. A fifth gate arriving at NONE fails the build.
//
// And the sibling shape: a check that quantifies over a KIND while its
// evidence is one file of that kind.
//
// Run: node scripts/tests/gate-independence.test.mjs
import { classify, kindWideClaims, scanAll, RUNGS } from "../scan-gate-independence.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

// ---------------------------------------------------------------------
console.log("== 1. the classifier still sorts, rather than saying yes to everything ==");
// Each fixture is the smallest gate that reaches exactly one rung. The
// LAST one is the point of the section: if any detector goes
// unconditional, this is what goes red.
const FIXTURES = [
  ["NETWORK", 'const r = await fetch("https://example.invalid/x");'],
  ["DOM", 'import { chromium } from "playwright";\nconst b = await chromium.launch();'],
  ["DB", 'const url = process.env.DATABASE_URL;'],
  ["DISK", 'const files = readdirSync("src");'],
  ["EXECUTION", 'const m = await loadTs("src/lib/website-variation.ts");\nm.pickVariation("x");'],
  ["EXECUTION", 'const m = await loadTs("src/lib/website-variation.ts");\nconst { pickVariation } = m;\npickVariation("x");'],
  ["CROSS-KIND", 'const a = readFileSync("src/lib/website-variation.ts", "utf8");\nconst b = readFileSync("messages/el.json", "utf8");'],
  ["LITERAL", 'const a = readFileSync("src/lib/website-variation.ts", "utf8");\nconst EXPECTED = ["one", "two", "three"];'],
  // THE FOOTER IS PART OF THE FIXTURE ON PURPOSE. Every gate in this
  // directory ends with `if (failures.length > 0)`, and the first
  // LITERAL detector counted that as an expectation — 264 of 275
  // matched. A NONE fixture without a footer would not have caught it.
  ["NONE", 'const a = readFileSync("src/lib/website-variation.ts", "utf8");\ncheck("x", /y/.test(a));\nif (failures.length > 0) process.exit(1);'],
];
for (const [expected, source] of FIXTURES) {
  const got = classify(source);
  ok(`a gate whose only reference is ${expected} is read as ${expected}`,
    got.rung === expected,
    `read as ${got.rung} (${JSON.stringify(got.why)})`);
}
ok("...and the rungs are ordered strongest first",
  RUNGS[0] === "NETWORK" && RUNGS[RUNGS.length - 1] === "NONE");

// ---------------------------------------------------------------------
console.log("\n== 2. the bottom rung is a named list, and every name carries a mutation ==");
// Each entry: settled 2026-09-19 by breaking the thing it protects and
// requiring it to go red. What the scan cannot name is written out,
// because the owner's rule is that a limitation stated beats a check
// that looks like one.
const NONE_IS_FINE = {
  "address-register.test.mjs":
    "a CORPUS. The rule ('no Greek string addresses the reader in the polite plural') " +
    "ranges over 546 real strings in messages/*.json, so a new offending string reddens " +
    "it. Settled by adding one: RED.",
  "design-density.test.mjs":
    "a CENSUS with ratchets. 918 files walked; 581 border utilities, ceiling 581; blurred " +
    "accent shadows forbidden at 0. Settled twice — one added border (582) and one added " +
    "shadow (1): RED both times. (It walks src with a private recursive function, which is " +
    "why the scan does not see DISK.)",
  "language-reachable.test.mjs":
    "a RELATION between six files. Rendered exactly once in the top nav, outside any " +
    "`hidden` wrapper, and NOT rendered in the sidebar or the account menu — no single " +
    "file can satisfy that alone. Settled three ways (removed, hidden behind a breakpoint, " +
    "showCode dropped): RED each time.",
  "write-guards.test.mjs":
    "a SHAPE over the write paths it finds. Every update must re-assert what it read. " +
    "Settled twice — dropping the .or() guard, and moving the comparison back into " +
    "TypeScript, which is the incident it was written for: RED both times.",
};
const rows = scanAll();
const noneBuild = rows.filter((r) => r.suite === "build" && r.rung === "NONE").map((r) => r.file);
for (const file of noneBuild) {
  ok(`${file} is a known one`, Object.hasOwn(NONE_IS_FINE, file),
    "a build gate with nothing the scan can name. Settle it by MUTATION — break what it\n" +
    "        claims to protect and require it to go red. If it holds, write what its real\n" +
    "        reference is and add it here. If it does not, it is not a check.");
}
for (const file of Object.keys(NONE_IS_FINE)) {
  ok(`still at NONE: ${file}`, noneBuild.includes(file),
    "this gate gained a reference the scan can name — delete the entry.");
}

// ---------------------------------------------------------------------
console.log("\n== 3. and the build still reaches the sources it reached ==");
// Floors, not exact counts: these only ever want to go up. And they are
// LOW, which is the finding, not a tidy result. Of the build's gates,
// four reach the network, seven the DOM and three the database. The
// four independent sources the owner named live almost entirely in the
// prodtests, dbtests and itests — 93 suites that do NOT run in the
// build, and mostly cannot run here at all for want of a DATABASE_URL,
// an Anthropic balance and a published site. See docs/v5-closing-report.md,
// "the 28% that is still open".
const build = rows.filter((r) => r.suite === "build");
const reach = (s) => build.filter((r) => r.why[s]).length;
for (const [source, floor] of [["NETWORK", 4], ["DOM", 7], ["DB", 3], ["DISK", 130]]) {
  ok(`${source}: ${reach(source)} build gates reach it (floor ${floor})`, reach(source) >= floor);
}
ok("...and the scan still classifies every suite",
  rows.length > 500 && rows.every((r) => RUNGS.includes(r.rung)),
  `${rows.length} suites`);

// ---------------------------------------------------------------------
console.log("\n== 4. a rule about a kind, evidenced by one file of that kind ==");
// SHAPE 35. user-photos' "every table that carries HTML is read" named
// four tables; a fifth with an html_content column left it green, and a
// table the cleanup does not read makes every photograph reachable only
// from it an orphan. It derives them from the migrations now.
const KNOWN_CLAIMS = {
  "annual-billing.test.mjs":
    "'each card' ranges over the PLANS.map inside pricing/page.tsx, not over pages. " +
    "The token it checks sits inside that map.",
  "transition-buttons.test.mjs":
    "'no button' is a statement about one route's behaviour on a hedged answer, not " +
    "about a population of buttons.",
};
const claims = kindWideClaims();
for (const c of claims) {
  ok(`${c.file}: "${c.name}"`, Object.hasOwn(KNOWN_CLAIMS, c.file),
    `quantifies over a kind and reads ${c.target}, 1 of ${c.siblings}. Either the quantifier\n` +
    "        ranges inside that one file — say so here — or the evidence must be derived from\n" +
    "        the population the claim is about.");
}
for (const file of Object.keys(KNOWN_CLAIMS)) {
  ok(`still reported: ${file}`, claims.some((c) => c.file === file),
    "no longer matches — the check was fixed or reworded. Delete the entry.");
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
