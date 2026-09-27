#!/usr/bin/env node
/*
 * WOULD THE BOT STILL KNOW WHERE IT IS?
 *
 * Run: node scripts/tests/bot-environment.mutation.mjs
 *
 * The defect this defends against is not a crash. It is a green-looking
 * report: three billable checks marked BROKEN because the deployment
 * they were driven at has no provider key, filed in broken.md beside
 * real failures with nothing distinguishing them. A harness that blames
 * the product for its own aim is worse than no harness, because its
 * output is believed.
 *
 * SEVEN MUTANTS, ACROSS BOTH HALVES. Four break the preflight itself —
 * the answer, the question, the address, the third outcome. Three break
 * the half that makes the answer possible: /api/health's `ai` field, and
 * the .env.local load that lets a local run have a key at all.
 *
 * NONE OF THEM IS A COMMENT EDIT. mutation-anchors.test.mjs refuses a
 * mutant whose only change is `// `, and it is right to: a diff that
 * edits prose proves nothing about the code under it.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/bot-environment.test.mjs";
const PRE = "scripts/lib/bot-preflight.mjs";
const BOT = "scripts/e2e-bot.mjs";
const HEALTH = "src/app/api/health/route.ts";

const MUTANTS = [
  {
    // THE ANSWER IS ALWAYS YES. Every target looks like production, and
    // a keyless one spends nothing but reports everything broken.
    name: "every target is reported as able to call a model",
    file: PRE,
    from: "      canCallModel: ai.canCallModel,",
    to: "      canCallModel: true,",
    expect: "says NO",
  },
  {
    // SILENCE READ AS REFUSAL. A deployment too old to carry the field
    // would have its billable checks skipped forever, and the run would
    // look like a clean one.
    name: "a deployment that never answered counts as keyless",
    file: PRE,
    from: '      return { known: false, why: "this deployment\'s /api/health does not report `ai` — it predates the field" };',
    to: "      return { known: true, canCallModel: false, providers: [], missing: [] };",
    expect: "UNKNOWN, not NO",
  },
  {
    // THE WRONG HOST ASKED. The classic form of this bug: the harness
    // asks something it can reach instead of the thing it is testing.
    name: "the preflight asks a fixed host instead of the target",
    file: PRE,
    from: "await fetchImpl(`${base}/api/health`",
    to: 'await fetchImpl("https://example.invalid/api/health"',
    expect: "went to the target's own",
  },
  {
    // THE THIRD OUTCOME COLLAPSES INTO THE SECOND. This is the whole
    // point: NOT RUN is not a quiet BROKEN.
    name: "a keyless target makes its billable checks BROKEN",
    file: BOT,
    from: '  if (check.costs && NO_MODEL_KEY) {\n    record(check, "NOT RUN", {',
    to: '  if (check.costs && NO_MODEL_KEY) {\n    record(check, "BROKEN", {',
    expect: "never BROKEN",
  },
  {
    // THE BOT KEEPS ITS OWN COPY. Section 1 would keep passing while the
    // thing that actually runs drifted away from it.
    name: "the bot stops using the preflight the gate exercises",
    file: BOT,
    from: "const PRE = await preflight(BASE);",
    to: "const PRE = { known: false, why: \"not asked\" };",
    expect: "runs the preflight that section 1 exercised",
  },
  {
    // THE FIELD IS DERIVED SOMEWHERE ELSE. It can then disagree with
    // what a real generation would find — which is exactly the mistake
    // /api/health has already made twice about functions.
    name: "health answers about the key from process.env instead of the registry",
    file: HEALTH,
    from: "    const statuses = providerStatuses(process.env);",
    to: '    const statuses = [{ provider: "anthropic", enabled: Boolean(process.env.ANTHROPIC_API_KEY), pricesUnverified: false }];',
    expect: "providerStatuses()",
  },
  {
    // THE LOCAL RUN GOES BLIND AGAIN. A key in the developer's own file
    // is invisible to the bot and to nothing else.
    name: ".env.local is no longer read by a plain node script",
    file: BOT,
    from: 'const ENV_FILES_READ = [".env.local", ".env"].filter((f) => loadEnvFile(f) > 0);',
    to: "const ENV_FILES_READ = [];",
    expect: "picked up",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("bot-environment mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
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
console.log("A bot that blames the product for an empty environment goes red here first.");
