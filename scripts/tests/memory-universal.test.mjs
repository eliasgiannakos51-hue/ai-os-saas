// THE MEMORY IS ONE MEMORY, READ BY EVERY FEATURE, OWNED BY ONE PERSON.
//
// V6 #2. Before this, `chat_memory` was read in exactly one place —
// api/chat — so a person who had told the product how they write had to
// tell it again in the Website Builder, the deck writer, the post writer
// and the coding assistant. The table already held the hard parts
// (fold-keyed dedup, times_seen, last_seen_at); what it lacked was a
// surface column and five more readers.
//
// FOUR THINGS THIS HOLDS, and they are the four the round was specified
// against:
//
//   1. A cannot read B. Every load filters by user_id EXPLICITLY, which
//      matters most on the one path where RLS is not in force at all:
//      execute-agent runs from a cron with the service-role client.
//   2. Deleting one line does not delete others.
//   3. The memory block never breaks a prompt cache — it must sit after
//      a static prefix, never first and never with its own marker below
//      the cacheable minimum.
//   4. The same fact twice is a counter, not a second row.
//
// Run: node scripts/tests/memory-universal.test.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const surfaces = await loadTs("src/lib/memory/surfaces.ts");
const policy = await loadTs("src/lib/memory/memory-policy.ts");
const cached = await loadTs("src/lib/ai/cached-system.ts");
const prompt = await loadTs("src/lib/chat/memory-prompt.ts");

const MIGRATION = "supabase/migrations/20261007000000_universal_memory.sql";
const sql = readFileSync(MIGRATION, "utf8");

console.log("== 1. the surfaces the code knows are the surfaces the database allows ==");
// BOTH WAYS. A surface in the TypeScript list that the check constraint
// refuses is a feature whose every write throws; one in the constraint
// that the list omits is a feature nobody can switch off, because the
// switches are rendered from the list.
const inSql = [...(sql.match(/check \(surface in \(([^)]+)\)\)/)?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
check(`the constraint lists surfaces (${inSql.length})`, inSql.length >= 6, inSql.join(", "));
check(
  `the code lists the same ones (${surfaces.MEMORY_SURFACE_IDS.join(", ")})`,
  [...surfaces.MEMORY_SURFACE_IDS].sort().join(",") === [...inSql].sort().join(","),
  `code: ${[...surfaces.MEMORY_SURFACE_IDS].sort().join(",")}\n        sql:  ${[...inSql].sort().join(",")}`
);
const kindsInSql = [...(sql.match(/check \(kind in \(([^)]+)\)\)/)?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
check(
  `the kinds agree too (${kindsInSql.join(", ")})`,
  [...surfaces.MEMORY_KINDS].sort().join(",") === [...kindsInSql].sort().join(","),
  `code: ${[...surfaces.MEMORY_KINDS].sort().join(",")}\n        sql:  ${[...kindsInSql].sort().join(",")}`
);
// AN UNKNOWN SURFACE IS REFUSED, NOT COERCED. Filed under 'chat' by a
// default, a typo'd surface is invisible in the per-feature list and
// impossible to switch off — the setting would look ignored.
check(
  "memory_record refuses an unknown surface rather than defaulting it",
  /raise exception 'memory_record: unknown surface/.test(sql),
  "the function has no unknown-surface branch"
);
check(
  "...and an unknown kind",
  /raise exception 'memory_record: unknown kind/.test(sql),
  "the function has no unknown-kind branch"
);

console.log("\n== 2. A cannot read B ==");
// THE POPULATION, DERIVED: every file that reads the memory table. A
// sixth reader added tomorrow is covered without an edit here.
const readers = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) {
      const src = stripComments(readFileSync(p, "utf8"));
      if (/from\(["']chat_memory["']\)/.test(src)) readers.push({ file: p, src });
    }
  }
})("src");
check(`files that read the table were found (${readers.length})`, readers.length >= 3, readers.map((r) => r.file).join(", "));
for (const r of readers) {
  // A select without a user filter is only safe if RLS is in force, and
  // on the agent path it is not — that client is the service role.
  const selects = /\.from\(["']chat_memory["']\)[\s\S]{0,400}?\.select\(/.test(r.src);
  if (!selects) continue;
  check(
    `${r.file.replace("src/", "")} filters the read by user_id`,
    /\.eq\(["']user_id["']/.test(r.src),
    "a select with no user filter leans on RLS, which the service-role client does not have"
  );
}
// AND THE SHARED LOADER, which is the one the five new features use.
const store = stripComments(readFileSync("src/lib/memory/store.ts", "utf8"));
check(
  "the shared loader filters by user_id",
  /\.eq\("user_id", userId\)/.test(store),
  "lib/memory/store.ts loadMemories has no user filter"
);
check(
  "...and it takes the id as an argument rather than reading a session",
  /export async function loadMemories\([\s\S]{0,200}?userId: string/.test(store),
  "a loader that resolves its own identity cannot be called from a cron"
);
// THE WRITE SIDE CANNOT FORGE AN IDENTITY AT ALL.
check(
  "the write goes through the SECURITY DEFINER function, not an upsert",
  /\.rpc\("memory_record"/.test(store) && !/\.from\("chat_memory"\)[\s\S]{0,200}\.(insert|upsert)\(/.test(store),
  "an insert from the client would need a user_id parameter, which is a write-anything primitive"
);
check(
  "...and that function takes its user from auth.uid(), never an argument",
  /v_user uuid := auth\.uid\(\)/.test(sql) && !/p_user_id/.test(sql),
  "memory_record accepts a user id"
);

console.log("\n== 3. deleting one line does not delete others ==");
const list = stripComments(readFileSync("src/components/memory/ai-memory-list.tsx", "utf8"));
check(
  "the delete is keyed on the row's own id",
  /\.from\("chat_memory"\)\.delete\(\)\.eq\("id", id\)/.test(list),
  "the delete is not scoped to one row"
);
check(
  "...and there is no unqualified delete anywhere in the component",
  !/\.delete\(\)\s*;/.test(list) && !/\.delete\(\)\.neq\(/.test(list),
  "an unscoped delete would clear the table for that user"
);
check(
  "the table still has no UPDATE policy, so a correction is delete-then-insert",
  !/create policy[^;]*for update[^;]*chat_memory/i.test(sql),
  "this migration added an update policy"
);

console.log("\n== 4. the memory block never breaks a cache ==");
// MEASURED, NOT ASSUMED. Twenty facts is 547 tokens against Sonnet's
// 1,024-token minimum, so a memory block can never be a breakpoint on its
// own — and Anthropic does NOT error on a short one, it returns
// cache_creation_input_tokens: 0 and the marker reads like an
// optimisation that works.
const fact = (i) => ({ text: `Prefers ${"x".repeat(40)} (${i}).`, timesSeen: 1, lastSeenAt: new Date(0).toISOString() });
const twenty = prompt.buildMemoryPromptAddition(Array.from({ length: 20 }, (_, i) => fact(i)));
const tokens = cached.approximateTokens(twenty);
const minimum = cached.modelCacheMinimumTokens("claude-sonnet-4-6");
check(
  `twenty facts are ${tokens} tokens, under the ${minimum}-token minimum`,
  tokens < minimum,
  "if this ever stopped being true the reasoning below would need re-checking, not the code"
);
check(
  "...so the block alone is not worth its own cache marker",
  cached.isWorthCaching(twenty, "claude-sonnet-4-6") === false
);
check(
  "an empty memory produces an empty block, not a heading with no bullets",
  prompt.buildMemoryPromptAddition([]) === "",
  "a sentence announcing what the model knows, followed by nothing, reads as confident ignorance"
);
// EVERY CALL SITE PUTS IT AFTER A STATIC PREFIX.
const SITES = [
  ["src/lib/posts/generate.ts", /staticPrefix: buildPostsSystemPrompt\(\),\s*perUserBlock/],
  ["src/lib/presentations/generate.ts", /staticPrefix: buildDeckSystemPrompt\(\),\s*perUserBlock/],
];
for (const [file, re] of SITES) {
  check(
    `${file.replace("src/lib/", "")} passes it as perUserBlock, after the static prefix`,
    re.test(stripComments(readFileSync(file, "utf8"))),
    "a memory block before the static prefix makes the prefix un-cacheable for everyone"
  );
}
// The two that build their system array by hand.
const builder = stripComments(readFileSync("src/lib/website-builder.ts", "utf8"));
// POSITIONS, NOT A PATTERN. The first version of this asked whether
// SYSTEM_PROMPT was followed SOMEWHERE by memoryBlock — and a mutation
// that inserted a second memory block IN FRONT left that true, because
// the original order still existed further down. What matters is that no
// memory block precedes the cached prompt, which is a comparison of
// indices and cannot be satisfied by adding more text.
// THE ARRAY, not the function — the first version sliced from the
// declaration and the `memoryBlock: string` PARAMETER counted as a block
// in front of the prompt. What is being ordered is the returned list.
const fn = builder.slice(builder.indexOf("function buildGenerateSystemBlocks"));
const blocks = fn.slice(fn.indexOf("return ["));
const promptAt = blocks.indexOf("text: SYSTEM_PROMPT");
const memoryAt = blocks.indexOf("text: memoryBlock");
check(
  `website-builder puts SYSTEM_PROMPT first and the memory after it (${promptAt} < ${memoryAt})`,
  promptAt !== -1 && memoryAt !== -1 && promptAt < memoryAt,
  "the order decides whether the 8,150-token prompt still caches"
);
check(
  "...and NOTHING carrying the memory precedes it",
  blocks.slice(0, promptAt).indexOf("memoryBlock") === -1,
  blocks.slice(0, Math.max(0, promptAt)).slice(-200)
);
const runner = stripComments(readFileSync("src/lib/agents/agent-runner.ts", "utf8"));
check(
  "the agent runner adds it as a SECOND block, not concatenated",
  /runnerSystemPrompt\(config\) \},\s*\{ type: "text", text: params\.memoryBlock \}/.test(runner),
  "concatenating into the prompt changes the static prefix per user and nothing caches"
);

console.log("\n== 5. the same fact twice is a counter, not a row ==");
check(
  "the function looks the fact up by its FOLD before inserting",
  /update public\.chat_memory[\s\S]{0,400}?and memory_fold = p_memory_fold/.test(sql),
  "without the fold lookup every repetition is a new row"
);
check(
  "...and bumps times_seen when it finds one",
  /set times_seen\s*=\s*times_seen \+ 1/.test(sql)
);
check(
  "a race lands on the unique index and becomes a bump, not an error",
  /on conflict \(user_id, memory_fold\)[\s\S]{0,200}?times_seen = chat_memory\.times_seen \+ 1/.test(sql)
);
// THE INDEX IS NOT KEYED BY SURFACE, and that is the universality.
check(
  "the dedup key is (user_id, memory_fold) — NOT (user_id, surface, fold)",
  !/unique[\s\S]{0,120}?surface/.test(sql),
  "keying by surface too would split one fact's counter five ways and every fact would read as 'mentioned once' for ever"
);
check(
  "surface is provenance: an existing row keeps the one it was learned in",
  /surface\s+and\s+kind\s+are NOT overwritten/i.test(sql) || !/set[\s\S]{0,200}?surface\s*=/.test(sql),
  "an UPDATE that rewrote surface would make the per-feature list say wherever it was last mentioned"
);

console.log("\n== 6. one predicate decides reading AND writing ==");
const offEverywhere = { user_metadata: { chat_memory_enabled: false } };
const offForPosts = { user_metadata: { memory_disabled_surfaces: ["posts"] } };
check(
  "a plan with no memory allowance is off",
  policy.memoryActiveFor({ surface: "chat", user: {}, planLimit: 0 }) === false
);
check(
  "the global switch turns every feature off",
  surfaces.MEMORY_SURFACE_IDS.every((s) => policy.memoryActiveFor({ surface: s, user: offEverywhere, planLimit: 20 }) === false)
);
check(
  "a per-feature switch turns off exactly one",
  policy.memoryActiveFor({ surface: "posts", user: offForPosts, planLimit: 20 }) === false &&
    policy.memoryActiveFor({ surface: "website", user: offForPosts, planLimit: 20 }) === true
);
check(
  "an unset switch means ON, so a feature added later is not silently off",
  surfaces.MEMORY_SURFACE_IDS.every((s) => policy.memoryActiveFor({ surface: s, user: {}, planLimit: 20 }) === true),
  "default-off would make every new surface dead for existing accounts, indistinguishably from 'switched off'"
);
check(
  "a junk value in the stored list is ignored rather than throwing",
  policy.disabledSurfaces({ user_metadata: { memory_disabled_surfaces: ["posts", "telepathy", 7] } }).join(",") === "posts"
);
// AND THE ROUTE REFUSES WHAT THE POLICY IGNORES.
const route = stripComments(readFileSync("src/app/api/memory/surfaces/route.ts", "utf8"));
check(
  "the settings route REFUSES an unknown surface instead of dropping it",
  /Not a feature that remembers/.test(route),
  "silently dropping it makes the switch look like it did nothing"
);
check(
  "...and answers with what was stored, not what was asked for",
  /disabled: disabledSurfaces\(data\.user\)/.test(route),
  "echoing the request makes a failed write look like a working switch"
);

console.log("\n== 7. every feature that reads is wired to the switch ==");
const WIRED = [
  "src/app/api/posts/generate/route.ts",
  "src/app/api/presentations/generate/route.ts",
  "src/app/api/websites/generate/process/route.ts",
  "src/app/api/coding/run/route.ts",
  "src/lib/agents/execute-agent.ts",
];
check(`five call sites are named (${WIRED.length})`, WIRED.length === 5);
for (const file of WIRED) {
  const src = stripComments(readFileSync(file, "utf8"));
  check(
    `${file.replace("src/app/api/", "api/").replace("src/lib/", "lib/")} asks memoryActiveFor before loading`,
    /memoryActiveFor\(\{/.test(src) && /memoryPromptFor\(/.test(src),
    "a read without the predicate ignores both switches and the plan limit"
  );
}
// THE IDENTITY EACH CALL SITE PASSES IS THE ONE IT AUTHENTICATED.
//
// The loader filtering by user_id is worth nothing if the caller hands it
// somebody else's id, and on the agent path RLS cannot catch that: the
// client is service-role. So the argument is read and required to be the
// authenticated user, spelled one of the two ways this tree spells it.
for (const file of WIRED) {
  const src = stripComments(readFileSync(file, "utf8"));
  const passed = /memoryPromptFor\(\s*\w+\s*,\s*([^,]+),/.exec(src)?.[1]?.trim() ?? "";
  check(
    `${file.replace("src/app/api/", "api/").replace("src/lib/", "lib/")} passes the authenticated id (${passed || "none"})`,
    passed === "user.id" || passed === "userId",
    `it passes \`${passed}\` — anything but the id this request authenticated is another person's memory, and on the cron path there is no RLS to stop it`
  );
}

const wiredSurfaces = WIRED.map(
  (f) => /surface: "([a-z]+)"/.exec(stripComments(readFileSync(f, "utf8")))?.[1] ?? "?"
);
check(
  `and they cover five distinct surfaces (${wiredSurfaces.join(", ")})`,
  new Set(wiredSurfaces).size === 5 && !wiredSurfaces.includes("?"),
  wiredSurfaces.join(", ")
);

console.log("\n== 8. the screen shows it, per feature, in every language ==");
const locales = readdirSync("messages").filter((f) => f.endsWith(".json"));
const KEYS = ["surfacesTitle", "surfacesHelp", "surfaceOn", "surfaceOff", "surfaceSaveFailed"];
const missing = [];
const titles = [];
for (const f of locales) {
  const m = JSON.parse(readFileSync(join("messages", f), "utf8"))?.aiMemory ?? {};
  for (const k of KEYS) if (typeof m[k] !== "string" || !m[k].trim()) missing.push(`${f}:${k}`);
  for (const s of surfaces.MEMORY_SURFACE_IDS) {
    if (typeof m.surfaces?.[s] !== "string" || !m.surfaces[s].trim()) missing.push(`${f}:surfaces.${s}`);
  }
  if (typeof m.surfacesTitle === "string") titles.push(m.surfacesTitle);
}
check(`the locale files were read (${locales.length})`, locales.length >= 9, locales.join(", "));
check(`every string exists in every locale`, missing.length === 0, missing.join(", "));
// DISTINCTNESS, NOT LENGTH. A character count is a rule about the Latin
// alphabet; docs/shapes.md records the Chinese sentence that failed a
// `length > 30` check while being a perfect translation.
check(
  "...and no two locales share the same heading",
  new Set(titles).size === titles.length,
  `${titles.length} headings, ${new Set(titles).size} distinct`
);
check(
  "the list renders the surface a line was learned in",
  /t\(`surfaces\.\$\{row\.surface\}`\)/.test(list),
  "without it the per-feature list is a claim the screen does not make"
);
check(
  "the switches are real switches, with a checked state a screen reader can read",
  /role="switch"/.test(list) && /aria-checked=\{!off\}/.test(list),
  "a button with no state is not a switch"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
