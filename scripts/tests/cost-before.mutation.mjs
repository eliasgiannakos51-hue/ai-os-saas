#!/usr/bin/env node
/*
 * WOULD A LARGE ACTION THAT LOST ITS PRICE STILL PASS?
 *
 * Run: node scripts/tests/cost-before.mutation.mjs
 *
 * Each defect is an edit that reads harmless — "tidy the panel", "the
 * number is in the confirm step anyway", "raise the threshold so fewer
 * dialogs nag" — and each one puts a button that spends 100+ credits on a
 * screen that does not say so. scripts/tests/cost-before.test.mjs must go
 * red on the clause that names it.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/cost-before.test.mjs";
const RESEARCH = "src/components/research/research-workspace.tsx";
const BUILDER = "src/components/website-builder/website-builder-workspace.tsx";
const PICKER = "src/components/agents/depth-picker.tsx";
const ESTIMATE = "src/lib/billing/estimate.ts";
const CONFIG = "src/lib/billing/pricing-config.ts";
const LIST = "scripts/lib/cost-shown-before.mjs";

const MUTANTS = [
  {
    name: "Deep Research stops showing its estimate",
    file: RESEARCH,
    from: '{t("estimate", { credits: draft.credits })}',
    to: "{null}",
    expect: "deepResearch: src/components/research/research-workspace.tsx renders",
  },
  {
    // THE SENTENCE STAYS, THE NUMBER GOES: the expression survives only as
    // a comment, which a reader of the file would still find.
    name: "Deep Research's estimate survives only inside a comment",
    file: RESEARCH,
    from: '{t("estimate", { credits: draft.credits })}',
    to: '{/* t("estimate", { credits: draft.credits }) */}',
    expect: "deepResearch: src/components/research/research-workspace.tsx renders",
  },
  {
    name: "the Website Builder stops showing its estimate",
    file: BUILDER,
    from: '{t("estimatedCost", { count: estimatedCost })}',
    to: "{null}",
    expect: "websiteGenerate: src/components/website-builder/website-builder-workspace.tsx renders",
  },
  {
    name: "the depth picker shows a dash where the per-run price was",
    file: PICKER,
    from: '{fact ? formatNumber(fact.credits, locale) : "—"}',
    to: '{"—"}',
    expect: "agentRunDeep: src/components/agents/depth-picker.tsx renders",
  },
  {
    // A NEW LARGE ACTION nobody listed: website edits grow until they cross
    // the line. The population is the estimator's, so this must be found.
    name: "a website edit becomes large and nobody lists where it is priced",
    file: ESTIMATE,
    from: "  websiteEdit: {\n    systemPromptTokens: 2900,\n    auxiliaryCalls: [{ inputTokens: 4000, outputTokens: 300 }],\n    baseOutputChars: 4000,",
    to: "  websiteEdit: {\n    systemPromptTokens: 2900,\n    auxiliaryCalls: [{ inputTokens: 4000, outputTokens: 300 }],\n    baseOutputChars: 40000,",
    expect: "websiteEdit: has an entry",
  },
  {
    // FEWER NAGS: the line is moved so high that nothing is large, and every
    // check in section 2 passes over an empty list.
    name: "the large-action line is raised until nothing is large",
    file: CONFIG,
    from: "  largeActionConfirmThreshold: 50,",
    to: "  largeActionConfirmThreshold: 100000,",
    expect: "some actions are large",
  },
  {
    name: "the list keeps an entry for an action that no longer exists",
    file: LIST,
    from: "  websiteGenerate: {",
    to: '  ghostAction: { file: "src/components/website-builder/website-builder-workspace.tsx", renders: "estimatedCost" },\n  websiteGenerate: {',
    expect: "ghostAction: still a priced action",
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

console.log("cost-before mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [file, text] of originals) writeFileSync(file, text); };

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
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A large action that loses its price on screen goes red here first.");
