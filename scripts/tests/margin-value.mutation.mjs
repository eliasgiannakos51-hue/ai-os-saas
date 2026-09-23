#!/usr/bin/env node
/*
 * CAN THE VALUE GATE SEE THE VALUE CHANGE?
 *
 * The two the report asked for by name — 2 and 3 — plus the ones that
 * matter more: a plan margin quietly lowered, a floor weakened, and the
 * refusal going back to being a log entry nobody reads.
 *
 * Run: node scripts/tests/margin-value.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/margin-value.test.mjs";
const CONFIG = "src/lib/billing/pricing-config.ts";
const POLICY = "src/lib/billing/margin-policy.ts";
const ENVCHECK = "src/lib/env-check.ts";
const MEASURE = "scripts/measure-margin.mjs";

const TARGETS = [GATE, CONFIG, POLICY, ENVCHECK, MEASURE];

const MUTANTS = [
  {
    // THE ONE THE REPORT ASKED FOR. The margin becomes 2.
    name: "the margin default becomes 2",
    file: CONFIG,
    from: "  marginMultiplier: 4,",
    to: "  marginMultiplier: 2,",
    expect: "the default is exactly 4",
  },
  {
    // ...and 3, which is the more dangerous one: it is close enough to
    // look plausible in a diff.
    name: "the margin default becomes 3",
    file: CONFIG,
    from: "  marginMultiplier: 4,",
    to: "  marginMultiplier: 3,",
    expect: "the default is exactly 4",
  },
  {
    // THE FLOOR WEAKENED, which is how 2 would actually get in: not by
    // editing the default but by widening the range that accepts it.
    name: "the floor is lowered so 2 would be accepted",
    file: CONFIG,
    from: "export const MARGIN_MULTIPLIER_MIN = 4;",
    to: "export const MARGIN_MULTIPLIER_MIN = 2;",
    expect: "the floor is exactly 4",
  },
  {
    // THE CLAMP. A refused value silently becoming the nearest legal one
    // is the shape the comment in pricing-config.ts explicitly rejects —
    // "a silent clamp to 10 would look like the setting worked".
    name: "an out-of-range value is clamped instead of refused",
    file: CONFIG,
    from: "      marginMultiplier: num(\"CREDIT_MARGIN_MULTIPLIER\", DEFAULTS.marginMultiplier, (n) =>\n        n < MARGIN_MULTIPLIER_MIN || n > MARGIN_MULTIPLIER_MAX",
    to: "      marginMultiplier: num(\"CREDIT_MARGIN_MULTIPLIER\", DEFAULTS.marginMultiplier, () =>\n        false",
    expect: "does NOT become the margin",
  },
  {
    // A PLAN MARGIN LOWERED. This is the change that would actually cost
    // money, and the one no existing gate looked at.
    name: "the paid plans drop from 5 to 4",
    file: POLICY,
    from: "  starter: 5,",
    to: "  starter: 4,",
    expect: "every paid plan settles at exactly 5",
  },
  {
    // ...and free, whose 6 exists because it has no revenue to take a
    // share of.
    name: "free drops from 6 to the paid rate",
    file: POLICY,
    from: "  free: 6,",
    to: "  free: 5,",
    expect: "free settles at exactly 6",
  },
  {
    // THE MAX() BECOMING A MIN(). Every number stays what it is and the
    // combination rule inverts, so the LOWEST margin wins — which no
    // check on the constants alone could see.
    name: "the combination rule takes the lowest margin instead of the highest",
    file: POLICY,
    from: "  if (planMargin !== null && planMargin > margin) {",
    to: "  if (planMargin !== null && planMargin < margin) {",
    expect: "every paid plan settles at exactly 5",
  },
  {
    // THE REASON THE REPORT EXISTED. The refusal goes back to being a
    // log entry.
    name: "a refused value stops reaching the screen",
    file: ENVCHECK,
    from: "  for (const bad of checkEnv(env).suspicious) {",
    to: "  for (const bad of []) {",
    expect: "a refused margin appears in the warnings a screen renders",
  },
  {
    // ...and the half-measure: it reaches the screen as a gentle note
    // beside a half-configured OAuth pair.
    name: "the refusal is downgraded to a warning",
    file: ENVCHECK,
    from: '      key: `refused_value_${bad.name.toLowerCase()}`,\n      severity: "critical",',
    to: '      key: `refused_value_${bad.name.toLowerCase()}`,\n      severity: "warning",',
    expect: "as critical, because it decides what a customer is charged",
  },
  {
    // THE FLOOR UNDER THE POPULATION. A feature map that comes back
    // empty makes every per-feature clause pass over nothing.
    name: "the feature map is read as empty",
    file: GATE,
    from: "const features = [...new Set(Object.values(policy.ACTION_TO_FEATURE))].sort();",
    to: "const features = [];",
    expect: "features were found to check",
  },
  {
    // AND THE INSTRUMENT. A measure script that lists its own features
    // stops measuring the ones added after it was written.
    name: "the instrument types its own feature list",
    file: MEASURE,
    from: "const features = [...new Set(Object.values(policy.ACTION_TO_FEATURE))].sort();",
    to: 'const features = ["chat_message", "website_generate"];',
    expect: "derives its features from the action map",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("margin-value mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = originals.get(m.file).replace(m.from, () => m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
