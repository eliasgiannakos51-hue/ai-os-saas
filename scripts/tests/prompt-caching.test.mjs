// Prompt caching: the breakpoint is where the saving is, and a prompt
// under the model's minimum is not cached at all.
//
// WHAT THIS GUARDS. Before this test, exactly one of ~25 Anthropic call
// sites in the app used prompt caching (lib/website-builder.ts). The rest
// re-sent their whole system prompt at full input price on every call —
// including api/chat, the highest-volume feature in the product, whose
// static prefix measures 7,510 characters.
//
// Two failure modes make this worth a build gate rather than a one-off
// edit, because BOTH of them look exactly like success:
//
//   1. BREAKPOINT ON THE VARYING BLOCK. Anthropic writes a cache entry
//      only at the breakpoint, and reads only find entries earlier
//      requests wrote. Mark the end of the WHOLE chat system prompt and
//      the per-message part (the entities this message mentioned) is
//      inside the hashed prefix: every request writes a new entry, none
//      ever reads one, and the only effect is paying the 1.25x write
//      premium forever. Nothing errors. The code still greps as "cached".
//
//   2. PROMPT UNDER THE MODEL MINIMUM. Anthropic will not cache a prefix
//      below a per-model floor and returns NO error when asked to —
//      cache_creation_input_tokens just comes back 0. Sonnet 4.6 needs
//      1,024 tokens; Haiku 4.5 needs 4,096. So "route this to Haiku to
//      save money" can silently switch caching OFF for a prompt that
//      cached fine on Sonnet.
//
// Both are invisible in code review and invisible in the response unless
// somebody reads the usage fields, which is why they are asserted here.
//
// Run: node scripts/tests/prompt-caching.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function ok(name, cond) {
  check(name, Boolean(cond), true);
}

const cs = await loadTs("src/lib/ai/cached-system.ts");
const conduct = await loadTs("src/lib/ai-conduct.ts");
const checklist = await loadTs("src/lib/ai-quality-checklist.ts");

const SONNET = "claude-sonnet-4-6";

// ---------------------------------------------------------------------
// 1. The model minimums, from Anthropic's published table.
// ---------------------------------------------------------------------
console.log("\nModel cache minimums");
check("sonnet-4-6 minimum is 1024", cs.modelCacheMinimumTokens(SONNET), 1024);
check("haiku-4-5 minimum is 4096", cs.modelCacheMinimumTokens("claude-haiku-4-5"), 4096);
check("opus-5 minimum is 512", cs.modelCacheMinimumTokens("claude-opus-5"), 512);
// Dated and variant spellings must resolve to the same row, exactly as
// lib/billing/model-pricing.ts normalises them — otherwise a response
// reporting "claude-haiku-4-5-20251001" would be judged against the
// fallback instead of Haiku's real 4,096.
check(
  "dated snapshot resolves to its alias",
  cs.modelCacheMinimumTokens("claude-haiku-4-5-20251001"),
  4096
);
check("variant suffix resolves to its alias", cs.modelCacheMinimumTokens("claude-sonnet-4-6[1m]"), 1024);
// An unknown model must assume the LARGEST minimum: guessing low would
// place a marker that never caches while looking like it does.
check(
  "unknown model gets the largest known minimum",
  cs.modelCacheMinimumTokens("claude-something-new"),
  4096
);
check("undefined model gets the largest known minimum", cs.modelCacheMinimumTokens(undefined), 4096);

// ---------------------------------------------------------------------
// 2. Breakpoint placement — the failure that looks like success.
// ---------------------------------------------------------------------
console.log("\nBreakpoint placement");
const bigStatic = "S".repeat(1024 * 4); // 1,024 tokens at 4 chars/token
const suffix = "\n\nper-request tail";
const blocks = cs.buildCachedSystem({
  staticPrefix: bigStatic,
  dynamicSuffix: suffix,
  model: SONNET,
});
check("two blocks when there is a dynamic tail", blocks.length, 2);
ok("breakpoint is on the STATIC block", blocks[0].cache_control?.type === "ephemeral");
ok("no breakpoint on the DYNAMIC block", blocks[1].cache_control === undefined);
// The whole point: what the model receives must be unchanged.
check(
  "blocks concatenate back to the original prompt",
  blocks.map((b) => b.text).join(""),
  bigStatic + suffix
);

// An empty tail must not produce an empty text block — Anthropic rejects
// those, and an account with no memories, no mentioned entities and no
// AI Life Context genuinely produces one.
const noTail = cs.buildCachedSystem({ staticPrefix: bigStatic, dynamicSuffix: "", model: SONNET });
check("empty tail yields exactly one block", noTail.length, 1);
ok("that one block still carries the breakpoint", noTail[0].cache_control?.type === "ephemeral");
ok(
  "no block anywhere is empty text",
  [...blocks, ...noTail].every((b) => b.text.length > 0)
);

// ---------------------------------------------------------------------
// 3. The size rule — a marker below the minimum is worse than none.
// ---------------------------------------------------------------------
console.log("\nSize rule");
const tooSmall = "S".repeat(1023 * 4);
const smallBlocks = cs.buildCachedSystem({ staticPrefix: tooSmall, dynamicSuffix: suffix, model: SONNET });
ok(
  "under the minimum, NO cache_control is emitted",
  smallBlocks.every((b) => b.cache_control === undefined)
);
check(
  "under the minimum, the prompt is still sent whole and unchanged",
  smallBlocks.map((b) => b.text).join(""),
  tooSmall + suffix
);
// The same prefix that caches on Sonnet must NOT be marked on Haiku,
// whose minimum is four times higher. This is the trap a cost-driven
// model downgrade walks into.
const haikuBlocks = cs.buildCachedSystem({
  staticPrefix: bigStatic,
  dynamicSuffix: suffix,
  model: "claude-haiku-4-5",
});
ok(
  "a Sonnet-sized prefix is NOT marked on Haiku",
  haikuBlocks.every((b) => b.cache_control === undefined)
);
ok("the same prefix IS marked on Sonnet", blocks[0].cache_control?.type === "ephemeral");

// ---------------------------------------------------------------------
// 4. The REAL chat prompt, measured through the real source.
// ---------------------------------------------------------------------
// Built from the actual template literal in the route and the actual
// exported conduct/checklist constants — not a hand-written fixture, so
// editing any of them re-measures here instead of drifting from here.
console.log("\nReal chat system prompt");
const chatSrc = readFileSync("src/app/api/chat/route.ts", "utf8");
const wsi = chatSrc.match(/const WEB_SEARCH_INSTRUCTION = `([\s\S]*?)`;/)?.[1] ?? "";
const baseTpl =
  chatSrc.match(/function buildSystemPrompt\(personaName: string\): string \{\s*return `([\s\S]*?)`;\s*\}/)?.[1] ??
  "";
ok("found WEB_SEARCH_INSTRUCTION in the route", wsi.length > 0);
ok("found buildSystemPrompt in the route", baseTpl.length > 0);
const chatStatic = baseTpl
  .replace("${personaName}", "Ionexa")
  .replace("${WEB_SEARCH_INSTRUCTION}", wsi)
  .replace("${AI_CONDUCT_EL}", conduct.AI_CONDUCT_EL)
  .replace("${AI_QUALITY_CHECKLIST_EL}", checklist.AI_QUALITY_CHECKLIST_EL);
ok("no unresolved interpolation left in the measured prefix", !chatStatic.includes("${"));
ok(
  `chat static prefix (${chatStatic.length} chars, ~${cs.approximateTokens(chatStatic)} tokens) clears Sonnet's 1,024`,
  cs.isWorthCaching(chatStatic, SONNET)
);
// If this ever goes false, chat caching has silently stopped paying and
// the prefix needs to grow back or the breakpoint needs to move.
check("chat prefix is judged cacheable on the model chat actually calls", cs.isWorthCaching(chatStatic, SONNET), true);

// ---------------------------------------------------------------------
// 5. Wiring — the constant exists AND the call site passes it.
// ---------------------------------------------------------------------
// `system:` is a runtime string as far as the compiler is concerned: a
// route that stopped calling buildCachedSystem would typecheck cleanly
// and silently return to full-price prompts. Rule: assert the wiring.
console.log("\nCall-site wiring");
ok("chat route imports buildCachedSystem", /import \{ buildCachedSystem \} from "@\/lib\/ai\/cached-system"/.test(chatSrc));
ok("chat route passes it to system:", /system: buildCachedSystem\(\{/.test(chatSrc));
ok(
  "chat route splits static prefix from dynamic suffix",
  /systemStaticPrefix/.test(chatSrc) && /systemDynamicSuffix/.test(chatSrc)
);
// The estimator must still size the FULL prompt, not just the cached
// half — otherwise every chat reserve silently shrinks.
ok(
  "chat still estimates against the whole prompt",
  /const systemPrompt = systemStaticPrefix \+ systemDynamicSuffix;/.test(chatSrc)
);

const missionSrc = readFileSync("src/lib/mission-agents.ts", "utf8");
ok(
  "mission-agents imports buildCachedSystem",
  /import \{ buildCachedSystem \} from "@\/lib\/ai\/cached-system"/.test(missionSrc)
);
check(
  "both mission calls go through it",
  (missionSrc.match(/buildCachedSystem\(\{/g) ?? []).length,
  2
);

// Create Anything routes through TWO separate copies of the module
// catalogue (lib/create-studio/route-entry.ts and this file's own, a
// deliberate duplication documented in mission-step-runner.ts). Both are
// large and static, so both must be cached — caching one and forgetting
// the other is exactly the drift that duplication invites.
for (const [label, file] of [
  ["jobs/handlers/create", "src/lib/jobs/handlers/create.ts"],
  ["mission-step-runner", "src/lib/mission-step-runner.ts"],
]) {
  const src = readFileSync(file, "utf8");
  ok(`${label} imports buildCachedSystem`, /from "@\/lib\/ai\/cached-system"/.test(src));
  ok(`${label} passes it to system:`, /system: buildCachedSystem\(\{/.test(src));
  // The catalogue must be the STATIC half. If someone folds the
  // per-request additions into staticPrefix, the breakpoint starts
  // hashing them and every call writes an entry nothing reads.
  ok(
    `${label} caches the catalogue, not the per-request additions`,
    /staticPrefix: buildSystemPrompt\(\)/.test(src)
  );
  ok(
    `${label} keeps agentRole/mission context in the dynamic half`,
    /dynamicSuffix:[\s\S]{0,220}agentRoleSystemPromptAddition/.test(src)
  );
}

// Every Anthropic system prompt this app sends that clears the model
// minimum should be going through one of the two cached paths. This is
// the count of call sites that do; it goes UP, never down.
const CACHED_CALL_SITES = [
  "src/app/api/chat/route.ts",
  "src/lib/mission-agents.ts",
  "src/lib/jobs/handlers/create.ts",
  "src/lib/mission-step-runner.ts",
];
check(
  "every expected call site is wired",
  CACHED_CALL_SITES.filter((f) => /buildCachedSystem/.test(readFileSync(f, "utf8"))).length,
  CACHED_CALL_SITES.length
);
// website-builder.ts predates this helper and marks cache_control
// directly. It must stay cached either way.
ok(
  "website-builder still caches its own system prompt",
  /cache_control: \{ type: "ephemeral" \}/.test(readFileSync("src/lib/website-builder.ts", "utf8"))
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
