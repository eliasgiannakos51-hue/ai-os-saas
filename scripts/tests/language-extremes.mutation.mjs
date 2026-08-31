#!/usr/bin/env node
/*
 * CAN language-extremes.test.mjs TELL A COMPLETE SCRIPT TEST FROM A LUCKY ONE?
 *
 * The rule it enforces came from a defect that PASSED in Japanese and failed
 * in Chinese: a space-based line breaker has kana to work with and Han to
 * choke on. A suite that tested `ja` and stopped would have been green over
 * a Chinese user losing half their document. So the gate has to notice a
 * script test that reaches only one end — and has to keep noticing when its
 * own clauses are damaged.
 *
 * The fixture is a real gate file, written and removed, so what is measured
 * is the gate reading the directory rather than a hand-fed string. It is
 * named with a LEADING DOT so `npm run test:unit`'s shell glob does not pick
 * it up while it exists.
 *
 * Run: node scripts/tests/language-extremes.mutation.mjs
 */
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/language-extremes.test.mjs";
const CJK_ONLY = "scripts/tests/.extremes-fixture-cjk-only.test.mjs";
const RTL_ONLY = "scripts/tests/.extremes-fixture-rtl-only.test.mjs";
const BOTH = "scripts/tests/.extremes-fixture-both.test.mjs";
const GREEK_ONLY = "scripts/tests/.extremes-fixture-greek-only.test.mjs";

const HEADER = `// A fixture written by language-extremes.mutation.mjs. Deleted when it finishes.
`;

const FIXTURES = [
  // Japanese alone — the exact shape that hid the CJK line-breaking defect.
  [
    CJK_ONLY,
    `${HEADER}const sample = "こんにちは世界";\nexport default sample;\n`,
  ],
  [
    RTL_ONLY,
    `${HEADER}const sample = "مرحبا بالعالم";\nexport default sample;\n`,
  ],
  [
    BOTH,
    `${HEADER}const sample = ["中文", "مرحبا"];\nexport default sample;\n`,
  ],
  // Neither end: not a script test at all, and must never be reported.
  [
    GREEK_ONLY,
    `${HEADER}const sample = "Καλημέρα κόσμε";\nexport default sample;\n`,
  ],
];

const FLOOR_LINE = "gates carrying non-European sample text";
const EXEMPTION_LINE = "every exemption still describes a script test";

function probe() {
  let out = "";
  try {
    out = execFileSync(process.execPath, [GATE], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  const named = (f) => out.split(f.replace("scripts/tests/", "")).length - 1;
  return {
    cjkOnlyReported: named(CJK_ONLY),
    rtlOnlyReported: named(RTL_ONLY),
    bothReported: named(BOTH),
    greekOnlyReported: named(GREEK_ONLY),
    floorGreen: !out
      .split("\n")
      .some((l) => l.includes("FAIL") && l.includes(FLOOR_LINE)),
    exemptionGreen: !out
      .split("\n")
      .some((l) => l.includes("FAIL") && l.includes(EXEMPTION_LINE)),
  };
}

const KEYS = [
  "cjkOnlyReported",
  "rtlOnlyReported",
  "bothReported",
  "greekOnlyReported",
  "floorGreen",
  "exemptionGreen",
];
const render = (o) => KEYS.map((k) => `${k}=${o[k]}`).join("  ");

const MUTANTS = [
  {
    name: "Japanese alone counts as covering both ends",
    from: "    const hasRtl = present.some((s) => RTL.includes(s));",
    to: "    const hasRtl = true;",
  },
  {
    name: "Arabic alone counts as covering both ends",
    from: "    const hasCjk = present.some((s) => CJK.includes(s));",
    to: "    const hasCjk = true;",
  },
  {
    name: "kana counts as the CJK extreme but Han does not exist to the scan",
    from: "  han: /[㐀-䶿一-鿿]/u,",
    to: "  han: /(?!)/u,",
  },
  {
    name: "Arabic is no longer recognised at all",
    from: "  arabic: /[\u0600-ۿݐ-ݿ]/u,",
    to: "  arabic: /(?!)/u,",
  },
  {
    name: "Greek is treated as a script test, so ordinary content is reported",
    from: "const NON_EUROPEAN = {",
    to: "const NON_EUROPEAN = {\n  greek: /[\\u0370-\\u03ff]/u,",
  },
  {
    name: "the findings are collected but never asserted on",
    from: "    short.push(\n      `${file}: has ${present.join(\", \")} — missing ${missing.join(\" and \")}`,\n    );",
    to: "    void missing;",
  },
  {
    name: "the allowlist excuses every file, not the one that owns the entry",
    from: "    if (ALLOWED.has(file)) continue;",
    to: "    if (ALLOWED.size > 0) continue;",
  },
  {
    name: "the scan reads no files, so there is nothing to be incomplete",
    from: "  if (present.length === 0) continue;",
    to: "  continue;\n  // eslint-disable-next-line no-unreachable",
  },
];

console.log("language-extremes mutations\n");

const original = readFileSync(GATE, "utf8");
for (const [name, body] of FIXTURES) writeFileSync(name, body);

let caught = 0;
const missed = [];
try {
  const base = probe();
  console.log(`baseline: ${render(base)}`);
  const wanted = {
    cjkOnlyReported: (n) => n >= 1,
    rtlOnlyReported: (n) => n >= 1,
    bothReported: (n) => n === 0,
    greekOnlyReported: (n) => n === 0,
    floorGreen: (v) => v === true,
    exemptionGreen: (v) => v === true,
  };
  const wrong = KEYS.filter((k) => !wanted[k](base[k]));
  if (wrong.length > 0) {
    console.log(
      `\nBASELINE IS WRONG (${wrong.join(", ")}) — no mutation result below would mean anything.`,
    );
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const source = original;
    if (!source.includes(m.from)) {
      missed.push({
        ...m,
        why: "the mutation target no longer exists in the gate",
      });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = source.replace(m.from, m.to);
    if (mutated === source) {
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
      console.log(
        `  CAUGHT  ${m.name}\n          -> ${moved.map((k) => `${k}: ${base[k]} -> ${after[k]}`).join(", ")}`,
      );
    } else {
      missed.push({
        ...m,
        why: "no observation moved — the clause does nothing",
      });
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !restored) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
