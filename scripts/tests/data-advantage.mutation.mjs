#!/usr/bin/env node
/*
 * WOULD THE RECORDS STILL REACH THE MODEL?
 *
 * Run: node scripts/tests/data-advantage.mutation.mjs
 *
 * The defect is silent by construction. Drop the context and every
 * screen still works, every gate still passes, every post still comes
 * out — it is simply a post anybody's tool could have written, and
 * nothing anywhere says the account's records stopped being sent. That
 * is what happened for the whole life of these three features until
 * 2026-09-27, and what made it survive is that there was no way to see
 * it from the outside.
 *
 * SEVEN MUTANTS. Three cut the record out of each generator. Two attack
 * the boundary around it — the half that is security rather than
 * quality. Two attack the money: a context sent but not priced, and a
 * context loaded after the price is fixed.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/data-advantage.test.mjs";
const POSTS_PROMPT = "src/lib/posts/prompt.ts";
const DECK_PROMPT = "src/lib/presentations/prompt.ts";
const WEBSITE = "src/lib/website-builder.ts";
const POSTS_ROUTE = "src/app/api/posts/generate/route.ts";

const MUTANTS = [
  {
    // THE RECORD NEVER ARRIVES. Posts go back to being what Copy.ai
    // writes, and nothing on any screen changes.
    name: "Posts stops sending the account's records",
    file: POSTS_PROMPT,
    from: '  const context = businessContext.trim()\n    ? `\\n${scrub(businessContext.trim())}\\n\\n---\\n`\n    : "";',
    to: '  const context = "";',
    expect: "the account's record reaches the message",
  },
  {
    name: "Presentations stops sending the account's records",
    file: DECK_PROMPT,
    from: '  const context = businessContext.trim() ? `\\n${scrub(businessContext.trim())}\\n\\n---\\n` : "";',
    to: '  const context = "";',
    expect: "the account's record reaches the message",
  },
  {
    // THE WEBSITE'S BLOCK IS BUILT AND NOT USED. The subtler form: the
    // function still exists, still has its comment, and is simply not
    // in the message any more.
    name: "the website builder assembles the records and leaves them out",
    file: WEBSITE,
    from: '    buildBusinessContextBlock(businessContext ?? ""),\n    buildUserBriefBlock(description),',
    to: "    buildUserBriefBlock(description),",
    expect: "both in the user message",
  },
  {
    // THE BOUNDARY MOVES. The records land outside the untrusted region,
    // where a row that reads like a command reads like a command.
    name: "Posts puts the records outside the untrusted markers",
    file: POSTS_PROMPT,
    from: "${UNTRUSTED_OPEN}${context}",
    to: "${context}${UNTRUSTED_OPEN}",
    expect: "inside the untrusted markers",
  },
  {
    // THE MARKER CAN BE FORGED. A record containing the closing marker
    // ends the untrusted region early and everything after it reads as
    // instructions.
    name: "a record may carry the closing marker through unscrubbed",
    file: DECK_PROMPT,
    from: '    text.split(UNTRUSTED_OPEN).join("(marker removed)").split(UNTRUSTED_CLOSE).join("(marker removed)");',
    to: "    text;",
    expect: "cannot end the region early",
  },
  {
    // A NEW ACCOUNT IS CHARGED FOR A HEADER ABOUT RECORDS IT HAS NOT
    // GOT, and the model is told to use records that are not there.
    name: "an empty account still gets the records block",
    file: WEBSITE,
    from: '  const text = businessContext.trim();\n  if (!text) return "";',
    to: "  const text = businessContext.trim();",
    expect: "contributes no block at all",
  },
  {
    // THE MONEY. The context is sent and not priced: every hold is
    // short by the size of the account, and settlement exceeds it.
    name: "the context is loaded after the price is fixed",
    file: POSTS_ROUTE,
    from: "    const workspace = await loadWorkspaceContext(supabase, { include: true, brief: description });\n    const businessContext = renderWorkspaceContext(workspace);\n\n    const plan = await resolveEffectivePlan(user);",
    to: "    const plan = await resolveEffectivePlan(user);",
    expect: "loaded before the cost is estimated",
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

console.log("data-advantage mutations\n");

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
console.log("A Make feature that knows nothing about its user goes red here first.");
