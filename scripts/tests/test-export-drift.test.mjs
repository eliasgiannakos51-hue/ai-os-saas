// A suite that calls something its subject no longer exports.
//
// THIS IS THE BUG THAT BROKE PRODUCTION, and it is worth stating plainly
// because I caused it and then failed to notice it.
//
// src/lib/function-limits.ts briefly exported routeMaxDuration(). It had to
// go: Next requires `export const maxDuration` to be a plain numeric
// literal and silently ignores every computed form, so a helper that
// returns the number was worse than useless. Two suites used it. I updated
// one. scripts/tests/research-reliability.test.mjs line 66 still read
//
//     fl.routeMaxDuration(800)
//
// and nothing in the repository connected those two files. `npm run build`
// runs the suites, the suite threw
//
//     TypeError: fl.routeMaxDuration is not a function
//
// and the deploy of commit eed8259 failed.
//
// WHY I DID NOT CATCH IT. I verified with `npm run build | grep FAILURES`.
// A red assertion prints FAILURES. A CRASH prints a stack trace and no such
// line, so the grep came back clean and I reported a green build. The gate
// was never at fault — `node "$f" || exit 1` propagates the exit code
// correctly, which is precisely why Vercel failed and I did not. Every
// suite is now verified by EXIT CODE, and this file makes the bug itself
// impossible to ship rather than merely likely to be noticed.
//
// It is pure text analysis: no port, no network, no database, no
// credentials, no git. It runs identically in a clean clone with an empty
// environment, which is the whole point.
//
// Run: node scripts/tests/test-export-drift.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import {
  extractRuntimeExports,
  extractLoadTsBindings,
  accessedMembers,
  findExportDrift,
  blankStrings,
  stripComments,
} from "../lib/test-export-drift.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------
console.log("== 1. the scanner reads TypeScript exports correctly ==");
// A scanner has to be proven before it proves anything. If this section is
// wrong, section 4's "zero drift" means nothing at all.
const SAMPLE = `
import "server-only";
export function alpha() {}
export async function beta() {}
export const GAMMA = 1;
export let delta = 2;
export class Epsilon {}
export enum Zeta { A }
export const enum Eta { B }
export type Theta = string;
export interface Iota { x: number }
const hidden = 3;
function alsoHidden() {}
export { hidden, alsoHidden as renamed };
export type { Theta as Kappa };
`;
const sample = extractRuntimeExports(SAMPLE);
check("a function is a runtime export", sample.runtime.has("alpha"));
check("an async function too", sample.runtime.has("beta"));
check("a const", sample.runtime.has("GAMMA"));
check("a let", sample.runtime.has("delta"));
check("a class", sample.runtime.has("Epsilon"));
check("an enum", sample.runtime.has("Zeta"));
// `export const enum Eta` must register as the enum Eta, not as a const
// literally named "enum".
check("a const enum, under its real name", sample.runtime.has("Eta"));
check("and not as a const called 'enum'", !sample.runtime.has("enum"));
check("a re-export by name", sample.runtime.has("hidden"));
check("a re-export under its ALIAS, which is the name callers use", sample.runtime.has("renamed"));
check("not under its original name", !sample.runtime.has("alsoHidden"));

// The distinction that matters: a type is gone by the time the file runs.
check("a type alias is NOT a runtime export", !sample.runtime.has("Theta"));
check("it is recorded as type-only", sample.typeOnly.has("Theta"));
check("an interface is NOT a runtime export", !sample.runtime.has("Iota"));
check("a type-only re-export is not runtime either", !sample.runtime.has("Kappa"));
check("nothing unexported leaks in", !sample.runtime.has("hidden2") && sample.runtime.size === 9);

check(
  "a module that re-exports with `export *` is declared opaque, not guessed at",
  extractRuntimeExports('export * from "./other";').opaque
);
check("an ordinary module is not opaque", !sample.opaque);

console.log("\n== 2. the scanner finds what a suite loads ==");
const BINDINGS = `
const fl = await loadTs("src/lib/function-limits.ts");
const { PLANS, getPlan } = await loadTs("src/lib/billing/plans.ts");
const { broadenImageQuery } = await loadTs(
  "src/lib/images.ts"
);
`;
const bindings = extractLoadTsBindings(BINDINGS);
check("a namespace binding is found", bindings.some((b) => b.kind === "namespace" && b.binding === "fl"));
check(
  "a destructuring is found, with every name",
  bindings.some((b) => b.kind === "destructured" && b.names.includes("PLANS") && b.names.includes("getPlan"))
);
// Two real call sites in this repository wrap the path onto the next line.
check(
  "a call whose path is on the NEXT line is still found",
  bindings.some((b) => b.modulePath === "src/lib/images.ts")
);

console.log("\n== 3. the two false positives the first run produced ==");
// Both were my regex, not the code. Recording them as assertions is the
// only thing that stops them coming back.
//
// (a) The module path was being scanned as if it were code, so
//     loadTs("src/lib/agents/agent-limits.ts") read as an access to
//     `limits.ts` — a member named "ts". Ten hits.
check(
  "the module path inside the string is not read as a member access",
  !accessedMembers('const limits = await loadTs("src/lib/agents/agent-limits.ts");', "limits").has("ts")
);
check(
  "nor inside a template literal",
  !accessedMembers("const limits = 1; const s = `x/agent-limits.mjs`;", "limits").has("mjs")
);
// (b) `result.draft.config.language` is a field of the suite's own result
//     object. `\bconfig\.` matched it because a dot is a word boundary.
//     Twenty-five hits.
check(
  "a binding name appearing DEEPER in a property chain is not an access to the binding",
  !accessedMembers("check(x, result.draft.config.language, 'el');", "config").has("language")
);
check(
  "but a real access still is",
  accessedMembers("const out = config.sanitiseAgentText(attempt);", "config").has("sanitiseAgentText")
);
check(
  "and an identifier that merely ENDS with the binding name is not it",
  !accessedMembers("const v = pricingConfig.rate;", "config").has("rate")
);

console.log("\n== 4. the scanner catches the exact failure that broke the deploy ==");
// Verbatim from commit eed8259: the call on line 66, and the module as it
// stood after routeMaxDuration was removed. Reproduced inline rather than
// read out of git, because a suite that shells out to git is a suite that
// depends on its environment — the thing this whole file exists to stop.
const BROKEN_TEST = `
const fl = await loadTs("src/lib/function-limits.ts");
check("it declares through routeMaxDuration", /export const maxDuration = routeMaxDuration\\(/.test(runSrc));
check("so a 60s platform declares 60", fl.routeMaxDuration(800) <= fl.MAX_FUNCTION_DURATION_SECONDS);
`;
const MODULE_AFTER_REMOVAL = `
export const MAX_FUNCTION_DURATION_SECONDS = resolveMaxFunctionDuration();
export function resolveMaxFunctionDuration(env = process.env) { return 800; }
export function functionBudgetMs() { return 1; }
`;
const historical = findExportDrift(["t.mjs"], (p) =>
  p === "t.mjs" ? BROKEN_TEST : MODULE_AFTER_REMOVAL
);
check("it is caught", historical.length === 1, JSON.stringify(historical));
check("by name", historical[0]?.symbol === "routeMaxDuration");
check("naming the module it was removed from", historical[0]?.modulePath === "src/lib/function-limits.ts");
check(
  "and saying what happens at runtime",
  /TypeError/.test(historical[0]?.reason ?? ""),
  historical[0]?.reason
);
// The sibling access on the same line must NOT be flagged — a scanner that
// cries wolf about MAX_FUNCTION_DURATION_SECONDS teaches people to ignore it.
check(
  "while the symbol that DOES exist on the same line is left alone",
  !historical.some((d) => d.symbol === "MAX_FUNCTION_DURATION_SECONDS")
);

console.log("\n== 4b. a type imported as a value is caught too ==");
// Subtler and just as fatal: `export type` compiles to nothing, so reading
// it gives undefined with no error at the import site.
const typeDrift = findExportDrift(["t.mjs"], (p) =>
  p === "t.mjs"
    ? 'const m = await loadTs("src/lib/x.ts");\nconst r = m.MarginLogRow;'
    : "export type MarginLogRow = { a: number };\nexport const REAL = 1;"
);
check("a type-only export accessed as a value is flagged", typeDrift.length === 1);
check("and the message says it is a type", /TYPE only/.test(typeDrift[0]?.reason ?? ""));

console.log("\n== 4c. a suite pointing at a module that no longer exists ==");
const gone = findExportDrift(["t.mjs"], (p) => {
  if (p === "t.mjs") return 'const m = await loadTs("src/lib/deleted.ts");';
  throw new Error("ENOENT");
});
check("a deleted module is reported", gone.length === 1);
check("and not as a missing symbol", gone[0]?.symbol === null);

console.log("\n== 5. and it is silent on a suite that is correct ==");
const clean = findExportDrift(["t.mjs"], (p) =>
  p === "t.mjs"
    ? 'const m = await loadTs("src/lib/x.ts");\ncheck("x", m.doThing(1) === 2);\nconst { A } = await loadTs("src/lib/x.ts");'
    : "export function doThing(n) { return n + 1; }\nexport const A = 1;"
);
check("no drift is invented", clean.length === 0, JSON.stringify(clean));

console.log("\n== 6. NO suite in this repository has drifted ==");
// The live assertion. Every *.test.mjs, every module each one loads, every
// symbol each one reads.
//
// This file is the one exception, and the reason is structural rather than
// convenient: the fixtures above are source code written as strings, and
// they deliberately contain loadTs("src/lib/x.ts") for modules that do not
// exist. Scanned like any other suite, this file reports five hits — all of
// them fixtures doing their job. Blanking strings before extraction is not
// an option either, because the module path a real call site declares IS a
// string. So the file names itself, exactly as billing-coverage.test.mjs
// does for the same reason, and the exemption is asserted to be one file
// wide.
const SELF = "test-export-drift.test.mjs";
const allSuites = readdirSync("scripts/tests")
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => `scripts/tests/${f}`)
  .sort();
const suites = allSuites.filter((f) => !f.endsWith(SELF));
check(`the scan covers the whole suite directory (${allSuites.length} files)`, allSuites.length >= 40);
check(`exactly one file is exempt, and it is this one`, allSuites.length - suites.length === 1);

const loaded = new Set();
for (const s of suites) {
  for (const b of extractLoadTsBindings(readFileSync(s, "utf8"))) loaded.add(b.modulePath);
}
check(`and reaches the modules they load (${loaded.size} modules)`, loaded.size >= 40);

const drift = findExportDrift(suites, (p) => readFileSync(p, "utf8"));
check(
  `no suite reads a symbol its subject does not export (${drift.length} found)`,
  drift.length === 0,
  drift.map((d) => `${d.testFile} -> ${d.modulePath}::${d.symbol} — ${d.reason}`).join("\n        ")
);

// NOT A SECTION HERE, AND WHY — because I wrote one and it was wrong.
//
// blankStrings() pairs backticks left to right, so a suite containing an
// UNBALANCED backtick outside a string makes every pairing after it wrong
// and template-literal contents get scanned as code. That is real: writing
// `/idempotencyKey: \`sub_update:/` in annual-billing.test.mjs — an
// unbalanced backtick inside a REGEX literal, which is perfectly legal
// JavaScript — made this gate report that file as reading `pricing.$` from
// model-pricing.ts. The finding was false and the tokeniser was the cause.
//
// The obvious check is "count backticks outside quoted strings; an odd
// count means the pairing is unreliable". I wrote it. It flagged four more
// suites, and I could not tell whether any of them was real, because
// counting backticks "outside quoted strings" needs the very tokeniser
// that is missing: a // inside a regex looks like a comment, a quote
// inside a comment looks like a string, and the crude order-of-operations
// gave a different number depending on which I stripped first.
//
// So it is not here. Shipping a detector I cannot trust, in the gate whose
// whole subject is false positives from regex tokenising, would be the
// same mistake one level up. What IS here is this note and the fixed call
// site. Doing it properly means parsing rather than matching.

console.log("\n== 7. the gate still reports a CRASH as a failure ==");
// The other half of the incident. A suite that throws must fail the build,
// not be skipped over — that is what made the difference between Vercel
// failing and my grep passing.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
check(
  "test:unit stops at the first non-zero exit",
  /\|\|\s*exit 1/.test(pkg.scripts["test:unit"] ?? ""),
  pkg.scripts["test:unit"]
);
check("and the build runs it before next build", /npm run test:unit\s*&&\s*next build/.test(pkg.scripts.build ?? ""));
// Every suite must actually SET a non-zero exit code when it fails,
// otherwise `|| exit 1` never fires.
const noExit = suites.filter((s) => !/process\.exit\(/.test(readFileSync(s, "utf8")));
check(
  `every suite exits non-zero on failure (${suites.length - noExit.length}/${suites.length})`,
  noExit.length === 0,
  noExit.join(", ")
);

console.log("\n== 8. this check itself needs nothing from the environment ==");
// The patterns live in STRINGS, not in regex literals, and the source is
// run through blankStrings before scanning. That is what lets this section
// examine its own file honestly: the pattern text and the fixture that
// contains `process.env` are both string contents, so both are blanked,
// while code that genuinely called execSync() would not be.
//
// The first run failed here, and the failures were real: "spawns no
// process" matched its own pattern text, and "reads no environment
// variable" matched process.env inside the fixture module on line 4 of
// section 4. Neither is a process being spawned or an env var being read.
const FORBIDDEN = [
  ["opens no network connection", "\\bfetch\\s*\\(|https?://"],
  ["binds no port", "createServer\\s*\\("],
  ["spawns no process", "child_process|execSync|execFileSync|spawnSync|\\bspawn\\s*\\("],
  ["reads no environment variable", "process\\.env"],
  ["touches no database", "\\bpg\\b|postgres://|createAdminClient"],
];
const self = readFileSync("scripts/tests/test-export-drift.test.mjs", "utf8");
const lib = readFileSync("scripts/lib/test-export-drift.mjs", "utf8");
for (const [label, body] of [["the suite", self], ["the scanner", lib]]) {
  const code = blankStrings(stripComments(body));
  for (const [what, pattern] of FORBIDDEN) {
    check(`${label} ${what}`, !new RegExp(pattern).test(code));
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
