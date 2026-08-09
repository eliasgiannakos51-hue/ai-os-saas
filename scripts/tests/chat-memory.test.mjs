// Cross-conversation chat memory.
//
// The reported symptom was "the chat doesn't remember previous
// conversations". It is not one bug, it is a disagreement between two
// conditions that were never derived from each other:
//
//   read side:  loadRecentMemories(supabase, id, plan.capabilities.chatMemoryLimit)
//   write side: if (isChatMemoryEnabled(user)) extractAndStoreMemory(...)
//
// Free is chatMemoryLimit 0. `.limit(0)` is not "unlimited" — PostgREST
// sends LIMIT 0 and Postgres returns nothing — so the read was always
// empty, while the write kept making a second billed Claude call on every
// message and filling a table nobody would ever read from.
//
// The second half of this file guards the extraction prompt. The crisis
// fix (6ed1bc4) added a NEVER-EXTRACT clause that vetoed the WHOLE
// EXCHANGE, so one sentence about being tired threw away the name and the
// job in the same message. The veto has to be scoped to the content.
//
// Run: node scripts/tests/chat-memory.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const policy = await loadTs("src/lib/chat/memory-policy.ts");
const { chatMemoryActive, isChatMemoryEnabled } = policy;
const { PLANS } = await loadTs("src/lib/billing/plans.ts");

console.log("== 1. the predicate itself ==");
check("plan limit 0 -> memory is OFF, both ways", chatMemoryActive({ userEnabled: true, planLimit: 0 }) === false);
check("plan limit 20 -> ON", chatMemoryActive({ userEnabled: true, planLimit: 20 }) === true);
check("user switched it off -> OFF even on a big plan", chatMemoryActive({ userEnabled: false, planLimit: 100 }) === false);
// A missing/garbage capability must not read as "unlimited".
check("NaN limit -> OFF, not unlimited", chatMemoryActive({ userEnabled: true, planLimit: NaN }) === false);
check("negative limit -> OFF", chatMemoryActive({ userEnabled: true, planLimit: -1 }) === false);
check("memory defaults to on when the user never touched the setting", isChatMemoryEnabled({ user_metadata: {} }) === true);
check("...and off only when explicitly false", isChatMemoryEnabled({ user_metadata: { chat_memory_enabled: false } }) === false);

console.log("\n== 2. the bug scenario is REAL, not hypothetical ==");
const free = PLANS.find((p) => p.slug === "free");
check("the Free plan exists", Boolean(free));
check(
  "Free really is chatMemoryLimit 0 — the value that made the read always empty",
  free.capabilities.chatMemoryLimit === 0,
  `got ${free?.capabilities?.chatMemoryLimit}`
);
check("...so extraction is now skipped for Free too", chatMemoryActive({ userEnabled: true, planLimit: free.capabilities.chatMemoryLimit }) === false);

// The invariant that keeps the two columns honest as plans change: a plan
// that ADVERTISES memory must actually load some.
console.log("\n== 3. no plan advertises memory it cannot load ==");
for (const p of PLANS) {
  if (p.capabilities.aiMemory) {
    check(
      `${p.slug}: aiMemory=true implies chatMemoryLimit > 0`,
      p.capabilities.chatMemoryLimit > 0,
      `${p.slug} advertises AI memory but loads ${p.capabilities.chatMemoryLimit} entries — the feature is off while being sold.`
    );
  }
}
// And the reverse, so a limit is never left stranded on a plan that hides
// the feature: paying to extract memories a plan will not surface is the
// exact waste this file exists to stop.
for (const p of PLANS) {
  if (!p.capabilities.aiMemory) {
    check(
      `${p.slug}: aiMemory=false implies chatMemoryLimit 0`,
      p.capabilities.chatMemoryLimit === 0,
      `${p.slug} hides AI memory but would load ${p.capabilities.chatMemoryLimit}`
    );
  }
}

console.log("\n== 4. the route derives BOTH sides from the one predicate ==");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = strip(readFileSync("src/app/api/chat/route.ts", "utf8"));
check("the route computes memoryActive from chatMemoryActive(...)", /const memoryActive = chatMemoryActive\(/.test(route));
check("...passing the plan's own limit in", /planLimit: plan\.capabilities\.chatMemoryLimit/.test(route));
check("the READ is gated on it", /memoryActive[\s\S]{0,80}loadRecentMemories\(/.test(route));
check("the WRITE is gated on it", /if \(memoryActive\)[\s\S]{0,120}extractAndStoreMemory\(/.test(route));
// The old split condition must be gone, or the two can drift apart again.
check(
  "the write is no longer gated on the user flag alone",
  !/if \(memoryEnabled\)/.test(route),
  "route.ts still has `if (memoryEnabled)` — the write can run on a plan whose read is capped at 0."
);
check("memories still reach the system prompt", /buildMemoryPromptAddition\(memories\)/.test(route));

console.log("\n== 5. in-conversation history is a separate mechanism and still there ==");
// (γ) of the brief: remembering WITHIN one conversation never went
// through chat_memory at all — it is the chat_messages replay.
check("history is loaded from chat_messages", /from\("chat_messages"\)/.test(route));
check("...oldest-first before being sent to the model", /historyRows \?\? \[\]\)\.reverse\(\)/.test(route));

console.log("\n== 6. the extraction prompt: scoped veto, not a whole-exchange veto ==");
const memSrc = readFileSync("src/lib/chat/memory.ts", "utf8");
const prompt = memSrc.match(/const EXTRACTION_SYSTEM_PROMPT =([\s\S]*?);\n/)?.[1] ?? "";
check("the prompt was found", prompt.length > 0);
check("it still forbids distress and health outright", /ψυχική δυσφορία/.test(prompt) && /αυτοκτονίας/.test(prompt) && /υγεία/.test(prompt));
// The regression 6ed1bc4 introduced: one sensitive sentence discarded the
// whole message, name and job included.
check(
  "it NO LONGER vetoes the entire exchange",
  !/ό,τι άλλο κι αν περιέχει η ανταλλαγή/.test(prompt),
  "the whole-exchange veto is back: a message that mentions being tired loses the name and the job with it."
);
check("it says explicitly that the ban is on CONTENT, not the exchange", /ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ, ΟΧΙ ολόκληρη την ανταλλαγή/.test(prompt));
check("it carries a worked mixed-content example", /Ηλία/.test(prompt) && /SaaS/.test(prompt));
check("NONE is now reserved for 'nothing non-sensitive left'", /NONE μόνο όταν δεν μένει ΤΙΠΟΤΑ μη-ευαίσθητο/.test(prompt));

console.log("\n== 7. still no crisis-to-logging wiring anywhere in memory ==");
// The same guarantee 6ed1bc4 made: detection code, flags and alerts are
// not how this is handled, and a later edit must not quietly add them.
check("no keyword detection list", !/(SUICIDE|CRISIS_KEYWORDS|distressKeywords)/i.test(memSrc));
check("the extracted text is never logged", !/logApiError\([^)]*extracted/.test(memSrc));
check("no admin alert on extraction", !/notifyAdmin|sendAdminAlert/.test(memSrc));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
