#!/usr/bin/env node
/*
 * CAN gate-vacuity.test.mjs ACTUALLY TELL A LYING GATE FROM A SOUND ONE?
 *
 * It is the instrument that guards the other 202, and eight bugs have been
 * found in it by hand — one of which (a floor detector that accepted any
 * mention of `.length`, including the emptiness assertion itself) made it
 * report ZERO findings across every gate while looking completely healthy.
 * A detector that finds nothing is indistinguishable from a repository with
 * nothing wrong, which is the same failure it exists to catch, one level up.
 *
 * So it is checked against FIXTURES rather than against opinion. Two pairs,
 * one per shape the gate detects:
 *
 *   VACUITY  dirty — a scanned collection asserted empty with no floor.
 *            clean — the same file with a floor added.
 *   TAUTOLOGY dirty — checks whose literal arguments make them unable to
 *            fail. clean — the same claims written so they can go red,
 *            beside the two sound literal forms (a deliberate FAIL raised
 *            in a branch) that must NOT be reported.
 *
 * Each pair differs in exactly one property, so any change in verdict
 * between the two is attributable to that property and to nothing else.
 *
 * A mutation is CAUGHT when any observation moves: a dirty fixture stops
 * being reported (the clause was load-bearing), a clean one starts being
 * reported (the clause was what prevented a false positive), or the floor
 * on how much the analysis parsed goes red (the analysis stopped looking).
 * A mutation that moves nothing is a clause doing nothing.
 *
 * The fixtures are named with a LEADING DOT on purpose: `readdirSync` in
 * gate-vacuity returns them, while the shell glob in `npm run test:unit`
 * (scripts/tests/*.test.mjs) does not, so they cannot be run as gates
 * themselves or counted by any other scanner while they exist.
 *
 * Run: node scripts/tests/gate-vacuity.mutation.mjs
 */
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/gate-vacuity.test.mjs";
const V_DIRTY = "scripts/tests/.vacuity-fixture-dirty.test.mjs";
const V_CLEAN = "scripts/tests/.vacuity-fixture-clean.test.mjs";
const T_DIRTY = "scripts/tests/.tautology-fixture-dirty.test.mjs";
const T_CLEAN = "scripts/tests/.tautology-fixture-clean.test.mjs";
// A gate that carries a NUL byte by accident — a read guard written with the
// literal rather than the escape. It makes the file binary to grep and to
// git, and it makes gate-vacuity's own read guard skip it, which is how the
// instrument came to be excluded from its own analysis twice in one day.
const NUL_FIXTURE = "scripts/tests/.nul-fixture-accidental.test.mjs";

const HEADER = `// A fixture written by gate-vacuity.mutation.mjs. Deleted when it finishes.
import { readdirSync } from "node:fs";
function check(name, cond, detail) {
  if (!cond) { console.log("  FAIL  " + name + " " + (detail ?? "")); process.exitCode = 1; }
  else console.log("  PASS  " + name);
}
`;

// Both vacuity fixtures walk the filesystem, filter it, and assert the
// filtered list empty. The ONLY difference is the floor.
const VACUITY_BODY = (withFloor) => `${HEADER}
const scannedFiles = readdirSync("scripts/tests").filter((f) => f.endsWith(".mjs"));
${withFloor ? 'check("the scan found files (" + scannedFiles.length + ")", scannedFiles.length >= 100, "");' : ""}
const offenders = scannedFiles.filter((f) => f.includes("zz-no-such-substring-zz"));
check("nothing offends", offenders.length === 0, offenders.join(", "));

// A LITERAL ARRAY, filtered and asserted empty. This must NEVER be flagged:
// LOCALES is written in this file, so no rename or refactor can empty it.
// Without this the "a literal counts as a scan" mutation has nothing to
// falsely report and passes unnoticed.
const LOCALES = ["en", "el", "es"];
const badLocales = LOCALES.filter((l) => l.length !== 2);
check("every locale code is two letters", badLocales.length === 0, badLocales.join(", "));

// AND A COMMENTED-OUT ASSERTION, which is prose and must not be read as
// code. Without it the "comments are scanned as code" mutation changes
// nothing observable.
//   const ghosts = readdirSync("scripts/tests").filter((f) => f.endsWith(".zz"));
//   check("no ghosts", ghosts.length === 0);
`;

// The tautology pair. DIRTY holds one of every shape that cannot go red;
// CLEAN holds the same claims written as real conditions, PLUS the two
// literal forms that are sound and must stay unreported.
const TAUTOLOGY_BODY = (dirty) => `${HEADER}
const scannedFiles = readdirSync("scripts/tests").filter((f) => f.endsWith(".mjs"));
check("the scan found files (" + scannedFiles.length + ")", scannedFiles.length >= 100, "");
let applyError = null;
try {
  scannedFiles.length;
} catch (err) {
  applyError = err;
}
${
  dirty
    ? `// EVERY SHAPE THAT CANNOT GO RED. One line per shape, so losing any
// ONE of them shows as a drop in the count rather than being hidden by
// the others still being reported.
check("migration applies twice cleanly", true, true);
check("the browser context is gone", true);
check("the counter is a positive integer", 1, 1);
check("exactly one overload survives", 1);
// AND ONE WHOSE LABEL CARRIES AN UNBALANCED PAREN. Parsed with string
// tracking this is an ordinary tautology; parsed without it the paren
// raises the nesting depth, the call never closes, and the line is
// skipped in silence.
check("the retry budget is spent (see the note above", true, true);`
    : `// THE SAME CLAIMS, WRITTEN SO THEY CAN GO RED.
check("migration applies twice cleanly", applyError === null, true);
check("the browser context is gone", scannedFiles.length > 0);
check("the counter is a positive integer", scannedFiles.length, scannedFiles.length);
check("exactly one overload survives", scannedFiles.length === scannedFiles.length);
check("the retry budget is spent (see the note above", scannedFiles.length > 0, true);`
}

// AND THE SOUND LITERAL FORMS, in BOTH fixtures, because neither is a
// tautology: reaching either line IS the failure it reports, so each
// always goes red when it runs. The two-argument one is here because a
// detector that flags any two-argument literal reports it, and that is
// the difference between "cannot pass" and "cannot fail".
if (scannedFiles.length === 0) {
  check("the scan is not empty", false);
  check("the scan is not empty (with an expected value)", false, true);
}
// A COMMA INSIDE THE LABEL, which is punctuation and not an argument
// boundary. Matched rather than parsed, the trailing \`1)\` reads as a
// two-argument call whose condition is the literal 1.
check(\`ratio = round(100 * \${scannedFiles.length} / \${scannedFiles.length}, 1)\`, scannedFiles.length > 0, true);
`;

const FIXTURES = [
  [V_DIRTY, VACUITY_BODY(false)],
  [V_CLEAN, VACUITY_BODY(true)],
  [T_DIRTY, TAUTOLOGY_BODY(true)],
  [T_CLEAN, TAUTOLOGY_BODY(false)],
  [NUL_FIXTURE, `${HEADER}\nconst raw = "x\u0000y";\ncheck("the guard is written with the byte", raw.length === 3, "");\n`],
];

const FLOOR_LINE = "the tautology analysis parsed check calls";
const NUL_LINE = "no gate carries a NUL byte by accident";
const BINARY_BY_DESIGN_LINE = "still carries the one that is on purpose";
const TAUTOLOGY_HEADING = "== no assertion is a tautology ==";

/**
 * Every observation the fixtures and the gate's own floors make available.
 *
 * COUNTS, NOT BOOLEANS. "is this fixture mentioned at all" was too coarse to
 * see three real holes: the dirty fixture holds one line per shape, so a
 * clause that stops recognising ONE of them leaves the file still mentioned
 * by the others and the damage reads as no damage. And PER SECTION, because
 * both halves print `${file}: ...` and a tautology regression would
 * otherwise be indistinguishable from a vacuity one.
 */
function probe() {
  let out = "";
  try {
    out = execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  const split = out.indexOf(TAUTOLOGY_HEADING);
  const vacuitySection = split === -1 ? out : out.slice(0, split);
  const tautologySection = split === -1 ? "" : out.slice(split);
  const count = (section, f) => section.split(f.replace("scripts/tests/", "")).length - 1;
  return {
    vacuityDirty: count(vacuitySection, V_DIRTY),
    vacuityClean: count(vacuitySection, V_CLEAN),
    tautologyDirty: count(tautologySection, T_DIRTY),
    tautologyClean: count(tautologySection, T_CLEAN),
    // The gate's own floor: did the analysis parse enough to have an opinion?
    parsedFloorGreen: !out.includes(`FAIL  ${FLOOR_LINE}`),
    // The accidental-NUL fixture must be reported by name.
    nulReported: count(out, NUL_FIXTURE),
    // MATCHED LINE BY LINE, not as one substring: the gate prints the file
    // name between "FAIL" and this phrase, so `FAIL  ${phrase}` never
    // appeared and this observation could not move whatever was mutated.
    exemptionGreen: !out.split("\n").some((l) => l.includes("FAIL") && l.includes(BINARY_BY_DESIGN_LINE)),
  };
}

const KEYS = [
  "vacuityDirty",
  "vacuityClean",
  "tautologyDirty",
  "tautologyClean",
  "parsedFloorGreen",
  "nulReported",
  "exemptionGreen",
];
const render = (o) => KEYS.map((k) => `${k}=${o[k]}`).join("  ");

const MUTANTS = [
  // ---- the vacuity half -------------------------------------------
  {
    name: "the floor detector accepts any mention of .length, not a positive comparison",
    from: 'new RegExp("\\\\b" + v + "\\\\.length\\\\s*(>=|>)\\\\s*\\\\d").test(code) ||',
    to: 'new RegExp("\\\\b" + v + "\\\\.length\\\\b").test(code) ||',
  },
  {
    name: "the filter chain is no longer traced, so a floor on the source is invisible",
    from: 'a.rhs.match(/^\\s*([a-zA-Z_$][\\w$]*)\\s*\\.\\s*(?:filter|flatMap|map|slice|concat)\\(/) ||',
    to: "null ||",
  },
  {
    name: "a literal array counts as a scan, so filtering a constant is reported",
    from: 'return /(readdirSync|matchAll|\\bwalk\\(|everyFile\\(|globSync|readFileSync\\([^)]*\\)\\s*\\.split)/.test(a.rhs);',
    to: "return true;",
  },
  {
    name: "the scan detector matches nothing, so every collection looks like a literal",
    from: 'return /(readdirSync|matchAll|\\bwalk\\(|everyFile\\(|globSync|readFileSync\\([^)]*\\)\\s*\\.split)/.test(a.rhs);',
    to: "return false;",
  },
  {
    name: "length === 0 stops being recognised as an emptiness assertion",
    from: 'if (new RegExp("\\\\b" + v + "\\\\.length\\\\s*===\\\\s*0").test(code)) shapes.push("length === 0");',
    to: 'if (false) shapes.push("length === 0");',
  },
  {
    name: "comments are scanned as code, so a documented example counts as an assertion",
    from: '    .filter((l) => !/^\\s*(\\/\\/|\\*)/.test(l))',
    to: "    .filter(() => true)",
  },
  {
    name: "the allowlist excuses every file, not the one that owns the entry",
    from: "  const allowed = ALLOWED.get(file) ?? [];",
    to: "  const allowed = [...ALLOWED.values()].flat();",
  },
  {
    name: "the vacuity findings are collected but never asserted on",
    from: "  findings.push(`${file}: ${v}${root === v ? \"\" : ` (from ${root})`} — ${shapes.join(\", \")}`);",
    to: "  void v;",
  },

  // ---- the tautology half -----------------------------------------
  {
    name: "1 and 0 stop counting as literals, so a numeric tautology is missed",
    from: "  const LITERAL = /^(?:true|false|1|0)$/;",
    to: "  const LITERAL = /^(?:true|false)$/;",
  },
  {
    name: "any two literals count, so a deliberate FAIL in a branch is reported",
    from: "          ? actual === expected",
    to: "          ? true",
  },
  {
    name: "the two-argument form is flagged whatever the literal, so check(name, false) is reported",
    from: '          : args.length === 2 && (actual === "true" || actual === "1");',
    to: "          : args.length === 2;",
  },
  {
    name: "the three-argument form is never judged, so check(name, true, true) survives",
    from: "        args.length >= 3 && LITERAL.test(expected)",
    to: "        false &&",
  },
  {
    name: "arguments are split without tracking strings, so a comma in the label splits the call",
    from: '      if (c === "\'" || c === \'"\' || c === "`") {\n        quote = c;\n        continue;\n      }',
    to: '      if (c === "\'" || c === \'"\' || c === "`") {\n        continue;\n      }',
  },
  {
    name: "only `check` is recognised as an assertion helper, so ok/eq/checkTrue go unparsed",
    from: '    for (const m of text.matchAll(/\\b(?:check|checkTrue|ok|eq)\\s*\\(/g)) {',
    to: '    for (const m of text.matchAll(/\\bcheck\\s*\\(/g)) {',
  },
  {
    name: "every file is excused from the NUL rule, not the one that owns the exemption",
    from: "    carriers.every((f) => f === BINARY_BY_DESIGN),",
    to: "    true,",
  },
  {
    // The scenario the floor beside `includes` exists for: a detector that
    // has stopped seeing NUL bytes at all. `every()` over an empty list is
    // true, so the first check passes silently; only `carriers.length >= 1`
    // says that the analysis found nothing to have an opinion about.
    name: "NUL bytes stop being detected, so the whole section passes over an empty list",
    from: '    if (raw.indexOf("\\u0000") !== -1) carriers.push(f);',
    to: "    if (false) carriers.push(f);",
  },
  {
    name: "the tautology findings are collected but never asserted on",
    from: "    for (const hit of cannotFail(code)) tautologies.push(`${file}: ${hit}`);",
    to: "    void cannotFail(code);",
  },
];

console.log("gate-vacuity mutations\n");

const original = readFileSync(GATE, "utf8");
for (const [name, body] of FIXTURES) writeFileSync(name, body);

let caught = 0;
const missed = [];
try {
  // BASELINE FIRST. If the gate cannot tell the fixtures apart before
  // anything is mutated, every result below is meaningless.
  const base = probe();
  console.log(`baseline: ${render(base)}`);
  // Each dirty fixture must be reported ONCE PER SHAPE it carries, so the
  // counts below are the floor this suite measures everything against.
  const wanted = {
    vacuityDirty: (n) => n >= 1,
    vacuityClean: (n) => n === 0,
    tautologyDirty: (n) => n >= 5,
    tautologyClean: (n) => n === 0,
    parsedFloorGreen: (v) => v === true,
    nulReported: (n) => n >= 1,
    exemptionGreen: (v) => v === true,
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

// AND THE GATE IS GREEN AGAIN ON THE REAL REPOSITORY, which is the only
// proof that every mutation was restored.
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
console.log("Every clause of the detector is load-bearing.");
