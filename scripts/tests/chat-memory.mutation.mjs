#!/usr/bin/env node
/*
 * "THE CHAT DOESN'T REMEMBER PREVIOUS CONVERSATIONS" — AND THE FREE PLAN
 * WAS PAYING FOR IT.
 *
 * The read side asked for `plan.capabilities.chatMemoryLimit` rows and the
 * write side asked whether the user had switched memory off. Two conditions,
 * never derived from each other. Free is limit 0, and `.limit(0)` is not
 * "no limit" — PostgREST sends LIMIT 0 and Postgres returns nothing. So the
 * read was always empty while the write kept making a SECOND billed Claude
 * call on every message, filing extracted personal facts into a table
 * nothing would ever read back.
 *
 * chat-memory.test.mjs is the answer: one predicate both sides derive from,
 * a Settings panel that says which of the three zeroes this is, and the
 * privacy rules on what may be extracted at all. The mutants below break
 * each of those and name the check that has to notice — the predicate, the
 * two gates in the route, the panel that must not drift from the predicate,
 * and the extraction's own silence about what it read.
 *
 * Run: node scripts/tests/chat-memory.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/chat-memory.test.mjs";
const POLICY = "src/lib/chat/memory-policy.ts";
const ROUTE = "src/app/api/chat/route.ts";
const MEMORY = "src/lib/chat/memory.ts";
const PANEL = "src/components/settings/chat-memory-settings.tsx";
const BASELINE = "supabase/migrations/20260803000000_baseline_schema.sql";

const MUTANTS = [
  {
    // THE BUG ITSELF. Without `planLimit > 0` a Free account is "active"
    // again: a second Claude call per message, charged, for rows the read
    // side can never return.
    name: "a plan limit of zero counts as memory being on",
    file: POLICY,
    from: "  return userEnabled && Number.isFinite(planLimit) && planLimit > 0;",
    to: "  return userEnabled;",
    expect: "plan limit 0 -> memory is OFF",
  },
  {
    // THE FINITE GUARD, AND WHAT IT IS ACTUALLY FOR. NaN and -1 are both
    // rejected by `> 0` on their own, so the gate's two checks for them
    // passed with the guard removed — this mutant found that and the
    // answer was a third check rather than a softer mutant. Infinity is
    // the value the guard exists for: the plausible way to write
    // "unlimited", and the one that reaches `.limit(Infinity)`.
    name: "the finite guard goes, so an Infinity limit reads as memory being on",
    file: POLICY,
    from: "  return userEnabled && Number.isFinite(planLimit) && planLimit > 0;",
    to: "  return userEnabled && planLimit > 0;",
    expect: "Infinity limit -> OFF",
  },
  {
    // DEFAULTS THE WRONG WAY. chat_memory_enabled is only ever WRITTEN as
    // false; treating anything but `true` as off switches the feature off
    // for every account that never opened the setting.
    name: "memory defaults to off for anyone who never touched the switch",
    file: POLICY,
    from: "  return user?.user_metadata?.chat_memory_enabled !== false;",
    to: "  return user?.user_metadata?.chat_memory_enabled === true;",
    expect: "defaults to on",
  },
  {
    // THE WRITE UNGATED — the original shape, reintroduced. The read stays
    // correct, so the feature still looks off; the cost does not.
    name: "the extraction call stops being gated on the predicate",
    file: ROUTE,
    from: "        if (memoryActive) {\n          await extractAndStoreMemory({",
    to: "        if (true || memoryActive) {\n          await extractAndStoreMemory({",
    expect: "the WRITE is gated on it",
  },
  {
    // HISTORY IN THE WRONG ORDER. The query is newest-first for the LIMIT
    // to mean "the last N"; the model must see oldest-first. Drop the
    // reverse and every conversation is replayed backwards.
    name: "conversation history reaches the model newest-first",
    file: ROUTE,
    from: "const history = (historyRows ?? []).reverse() as {",
    to: "const history = (historyRows ?? []) as {",
    expect: "oldest-first",
  },
  {
    // THE EXPLANATION DRIFTS FROM THE CONDITION. The panel decides which
    // of the three zeroes to show; if its test stops matching
    // chatMemoryActive's, an account is told the wrong reason and the
    // toggle is enabled where it changes nothing.
    name: "the Settings panel stops mirroring the predicate",
    file: PANEL,
    from: "  const planIncludesMemory = Number.isFinite(planLimit) && planLimit > 0;",
    to: "  const planIncludesMemory = planLimit !== 0;",
    expect: "mirrors chatMemoryActive's own condition",
  },
  {
    // AN ON SWITCH THAT CHANGES NOTHING. Enabled on a plan without memory,
    // it writes a preference the write side will never read.
    name: "the toggle is enabled on a plan that has no memory",
    file: PANEL,
    from: "disabled={updating || !planIncludesMemory}",
    to: "disabled={updating}",
    expect: "toggle is disabled when the plan excludes memory",
  },
  {
    // NOT IDEMPOTENT. This project's migrations are pasted by hand, and
    // sometimes twice; a bare CREATE TABLE turns the second paste into an
    // error that stops the rest of the file.
    name: "chat_memory stops being created idempotently",
    file: BASELINE,
    from: "create table if not exists public.chat_memory (",
    to: "create table public.chat_memory (",
    expect: "IF NOT EXISTS",
  },
  {
    // THE EXTRACTED TEXT IN A LOG LINE. This is the one thing the feature
    // may never do: the whole point of the extraction prompt is that
    // sensitive content is dropped before it is stored, and a debug log
    // puts it somewhere with no retention rule at all.
    // The log line carries `new Error("debug")` before the payload on
    // purpose: the gate's old pattern was `logApiError\([^)]*extracted`,
    // and a character class excluding `)` stops at the first one. The
    // mutant was not weakened to suit it; the pattern was replaced.
    name: "the extracted memory text is written to the error log",
    file: MEMORY,
    from: "    if (!extracted || extracted.toUpperCase() === \"NONE\") return;",
    to: "    logApiError(\"chat:extractAndStoreMemory\", new Error(\"debug\"), { extracted });\n    if (!extracted || extracted.toUpperCase() === \"NONE\") return;",
    expect: "never logged",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("chat-memory mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Neither side of chat memory can switch itself back on, or start talking, without this going red.");
