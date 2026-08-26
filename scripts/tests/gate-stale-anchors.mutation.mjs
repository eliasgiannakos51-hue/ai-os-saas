#!/usr/bin/env node
/*
 * CAN gate-stale-anchors.test.mjs ACTUALLY TELL A STALE ANCHOR FROM A LIVE ONE?
 *
 * It was written after a real one — submit-form-ip-limit.itest.mjs compared
 * against `.from("website_form_submissions").insert`, the formatter wrapped
 * that chain onto two lines in the route, and the gate went red naming a
 * defect the route did not have. Three defects were then found in the
 * analysis ITSELF while it was being run, and every one of them looked
 * healthy from the outside:
 *
 *   - a regex whose group numbers shifted when the alias branch was absent,
 *     so `\3` referred to nothing, matched the empty string, and the whole
 *     analysis checked ZERO anchors while printing PASS;
 *   - a `const src` rebound inside a loop that this file could not resolve,
 *     left falling through to an EARLIER binding, so three route anchors
 *     were checked against a library file and reported as gone;
 *   - a block-comment regex that treated `/*` inside a string literal as a
 *     comment opening, blanking a needle into spaces.
 *
 * So the analysis is checked against FIXTURES rather than against opinion.
 * Three pairs, one per property it claims to have:
 *
 *   STALE   a gate comparing positions against a needle that is gone.
 *           It must be reported.
 *   LIVE    the same gate with the needle that is really there.
 *           It must NOT be reported.
 *   SHADOW  a gate whose source variable is rebound to something this
 *           analysis cannot resolve, then compared. It must NOT be
 *           reported: an unknown value is not a stale one.
 *
 * A mutation is CAUGHT when any observation moves. A mutation that moves
 * nothing is a clause doing nothing.
 *
 * The fixtures are named with a LEADING DOT on purpose: `readdirSync` in the
 * gate returns them, while the shell glob in `npm run test:unit`
 * (scripts/tests/*.test.mjs) does not, so they cannot be run as gates
 * themselves while they exist.
 *
 * Run: node scripts/tests/gate-stale-anchors.mutation.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/gate-stale-anchors.test.mjs";
const STALE = "scripts/tests/.anchor-fixture-stale.test.mjs";
const LIVE = "scripts/tests/.anchor-fixture-live.test.mjs";
const SHADOW = "scripts/tests/.anchor-fixture-shadow.test.mjs";
// A file whose CONTENTS carry both comment markers, so the needles that
// exercise the string-aware stripper are really present in what is read.
// Written here rather than pointed at a real stylesheet so that the fixture
// cannot go stale against somebody else's edit.
const MARKERS = "scripts/tests/.anchor-fixture-markers.css";
const MARKERS_BODY = "/* start marker */\n.a { color: red }\n/* end marker */\n";

// Every fixture reads package.json, which is stable, small, and certain to
// contain "scripts" and certain not to contain the absent needle.
const HEADER = `// A fixture written by gate-stale-anchors.mutation.mjs. Deleted when it finishes.
import { readFileSync } from "node:fs";
function check(name, cond) {
  if (!cond) { console.log("  FAIL  " + name); process.exitCode = 1; }
  else console.log("  PASS  " + name);
}
`;

const ABSENT = "zz-absent-from-package-json-zz";

// BOTH MARKER NEEDLES REALLY EXIST in the file they are searched in, so at
// baseline neither is a finding. A stripper that treats the `/*` inside the
// first literal as a comment opening blanks everything up to the `*/` inside
// the second, turning both needles into text that is nowhere in the CSS —
// and the fixture is reported. That is the only way that mutation shows.
const MARKER_LINES = `const css = readFileSync("${MARKERS}", "utf8");
const startAt = css.indexOf("/* start marker");
const endAt = css.indexOf("end marker */");
check("the markers are in order", startAt < endAt);`;

const STALE_BODY = `${HEADER}
const pkg = readFileSync("package.json", "utf8");
// The needle on the left is gone, so this is -1 < (a real position): TRUE,
// forever, whatever package.json says.
check("scripts comes after the missing key", pkg.indexOf("${ABSENT}") < pkg.indexOf("scripts"));
${MARKER_LINES}
`;

// LIVE is everything the analysis must NOT report — which is more than
// "anchors that still match". Each line below is a shape one clause of the
// analysis exists to let through, and each carries a needle that is ABSENT
// from package.json, so if that clause stops working the line is reported
// and the mutation shows.
const LIVE_BODY = `${HEADER}
const pkg = readFileSync("package.json", "utf8");
check("scripts comes after the name", pkg.indexOf("\\"name\\"") < pkg.indexOf("scripts"));
// AN EXISTENCE TEST on a needle that is deliberately absent. \`> -1\` is the
// sound way to use indexOf and must never be treated as an ordering
// comparison — if it is, this line is judged and reported.
check("the absent key really is absent", !(pkg.indexOf("${ABSENT}") > -1));
// A FRAGMENT SHORTER THAN THREE CHARACTERS, which is too short to mean
// anything: it is not judged, and this line proves the length floor is what
// stops it rather than luck.
check("a two-character fragment is not an anchor", pkg.indexOf("~~") < pkg.indexOf("scripts"));
${MARKER_LINES}
`;

// The name `pkg` is rebound to a path this analysis cannot resolve. Every
// use below that point is about an unknown file, so nothing here may be
// reported — not even the needle that is absent from package.json.
const SHADOW_BODY = `${HEADER}
const FILES = ["package.json"];
const pkg = readFileSync("package.json", "utf8");
check("the outer binding is real", pkg.length > 0);
for (const f of FILES) {
  const pkg = readFileSync(f, "utf8");
  check("scripts comes after the missing key", pkg.indexOf("${ABSENT}") < pkg.indexOf("scripts"));
}
`;

const FIXTURES = [
  [STALE, STALE_BODY],
  [LIVE, LIVE_BODY],
  [SHADOW, SHADOW_BODY],
  [MARKERS, MARKERS_BODY],
];

const BINDING_FLOOR = "variables tied to a real file";
const ANCHOR_FLOOR = "anchors inside ordering comparisons";

function probe() {
  let out = "";
  try {
    out = execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  const named = (f) => out.split(f.replace("scripts/tests/", "")).length - 1;
  return {
    staleReported: named(STALE),
    liveReported: named(LIVE),
    shadowReported: named(SHADOW),
    bindingFloorGreen: !out.includes(`FAIL  ${BINDING_FLOOR}`),
    anchorFloorGreen: !out.includes(`FAIL  ${ANCHOR_FLOOR}`),
  };
}

const KEYS = ["staleReported", "liveReported", "shadowReported", "bindingFloorGreen", "anchorFloorGreen"];
const render = (o) => KEYS.map((k) => `${k}=${o[k]}`).join("  ");

const MUTANTS = [
  {
    name: "an existence test counts as an ordering comparison, so `indexOf(x) > -1` is judged",
    from: "    const ordering = window.replace(/[<>]=?\\s*-?\\s*[01]\\b/g, \"\");",
    to: "    const ordering = window;",
  },
  {
    name: "the needle is never compared against the file, so nothing is ever stale",
    from: "  if (!binding.contents.includes(needle)) {",
    to: "  if (false) {",
  },
  {
    name: "an unresolvable rebinding no longer shadows, so the earlier file is used",
    from: "      bindings.push({ name: m[1], line: lineOfIndex(m.index), unknown: true });\n      continue;",
    to: "      continue;",
  },
  {
    name: "an unknown binding is judged anyway",
    from: "      if (!binding || binding.unknown) continue;",
    to: "      if (!binding) continue;",
  },
  {
    name: "the nearest binding above is not preferred, so the first one always wins",
    from: "    for (const b of bindings) if (b.name === name && b.line <= at && (!best || b.line > best.line)) best = b;",
    to: "    for (const b of bindings) if (b.name === name && !best) best = b;",
  },
  {
    name: "comments are blanked with a regex that does not know what a string is",
    from: "const stripJs = (s) => {",
    to: "const stripJs = (s) => s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, (m) => m.replace(/[^\\n]/g, \" \")) || ((s) => {",
  },
  {
    name: "readFileSync bindings are not resolved at all",
    from: "    const repoPath = resolvePath(m[2]);",
    to: "    const repoPath = null;",
  },
  {
    name: "a needle of any length is judged, so one-character fragments are reported",
    from: "      if (needle === null || needle.length < 3) continue;",
    to: "      if (needle === null) continue;",
  },
  {
    name: "the findings are collected but never asserted on",
    from: "    stale.push(`${file}:${line}  ${JSON.stringify(needle)}\\n            not in ${binding.repoPath}`);",
    to: "    void needle;",
  },
];

console.log("gate-stale-anchors mutations\n");

const original = readFileSync(GATE, "utf8");
for (const [name, body] of FIXTURES) writeFileSync(name, body);

let caught = 0;
const missed = [];
try {
  const base = probe();
  console.log(`baseline: ${render(base)}`);
  const wanted = {
    staleReported: (n) => n >= 1,
    liveReported: (n) => n === 0,
    shadowReported: (n) => n === 0,
    bindingFloorGreen: (v) => v === true,
    anchorFloorGreen: (v) => v === true,
  };
  const wrong = KEYS.filter((k) => !wanted[k](base[k]));
  if (wrong.length > 0) {
    console.log(`\nBASELINE IS WRONG (${wrong.join(", ")}) — no mutation result below would mean anything.`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: "the mutation target no longer exists in the gate" });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = original.replace(m.from, m.to);
    if (mutated === original) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(GATE, mutated);
    let after;
    try {
      after = probe();
    } finally {
      writeFileSync(GATE, original);
    }
    const moved = KEYS.filter((k) => after[k] !== base[k]);
    if (moved.length > 0) {
      caught++;
      console.log(`  CAUGHT  ${m.name}\n          -> ${moved.map((k) => `${k}: ${base[k]} -> ${after[k]}`).join(", ")}`);
    } else {
      missed.push({ ...m, why: "no observation moved — the clause does nothing" });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  writeFileSync(GATE, original);
  for (const [name] of FIXTURES) if (existsSync(name)) unlinkSync(name);
}

let restored = true;
try {
  execFileSync(process.execPath, [GATE], { stdio: "pipe" });
} catch {
  restored = false;
}
console.log(
  restored
    ? "\nbaseline: the gate is green on the unmutated tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !restored) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the analysis is load-bearing.");
