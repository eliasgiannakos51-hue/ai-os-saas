// TWO PAGES WERE CALLED "MEMORY", AND THE HELP ARTICLE POINTED AT THE
// WRONG ONE.
//
// /dashboard/memory searched YOUR OWN RECORDS across the module tables. Its
// sidebar hint said "What the AI remembers about you." in all ten
// languages. `grep -c chat_memory` on that page returned 0. Meanwhile the
// chat-memory help article — also in ten languages — told people they could
// see and delete what the chat had kept, in a place that did not exist.
//
// So there are two claims to hold, and they fail in opposite directions:
//
//   FORWARD   the article names a route, and that route must be a real page
//             that actually reads chat_memory.
//   BACKWARD  no OTHER surface may be named or described as the thing the
//             article is about. A second "Memory" is how this happened.
//
// A gate that only checked the forward direction would have passed on the
// day the bug was reported: the link resolved, to a page about something
// else entirely.
//
// Run: node scripts/tests/ai-memory.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// COMMENTS ARE NOT CODE, and every file below explains in prose what used
// to be where — a scan reading the prose would find `chat_memory` in a
// sentence about it not being there.
const code = (p) => stripComments(read(p));

const PAGE = "src/app/dashboard/ai-memory/page.tsx";
const LIST = "src/components/memory/ai-memory-list.tsx";
const SEARCH_PAGE = "src/app/dashboard/search/page.tsx";
const OLD_ROUTE = "src/app/dashboard/memory/page.tsx";
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));

console.log("== 1. the page the article promises exists, and is about chat memory ==");
check(`the locales were found (${LOCALES.length})`, LOCALES.length >= 10, String(LOCALES.length));
check("the page is there", read(PAGE).length > 0);
const pageCode = code(PAGE) + "\n" + code(LIST);
check(
  "…and it actually reads chat_memory",
  (pageCode.match(/chat_memory/g) ?? []).length >= 2,
  "the whole defect was a page called Memory with zero references to the table"
);
check("…every row of it, not a count", /from\("chat_memory"\)[\s\S]{0,200}\.select\(/.test(pageCode));
check("…ordered the way the prompt reads them", /order\("last_seen_at"/.test(pageCode));

console.log("\n== 2. what the brief asked for, on that page ==");
check("when it was written is shown", /createdAt/.test(pageCode) && /learned/.test(pageCode));
check("…and which conversation it came from", /source_conversation_id/.test(pageCode));
check("…as a link that opens it", /\/dashboard\/chat\?c=\$\{row\.conversationId\}/.test(pageCode));
check("a ✕ removes ONE row by id", /from\("chat_memory"\)\.delete\(\)\.eq\("id", id\)/.test(pageCode));
check("…and clear-all survives", /clearAll/.test(pageCode));
// CORRECTION IS DELETE-THEN-INSERT because there is no update policy, and
// the order is write-then-remove so a failure cannot lose the line.
check("correcting writes the new line before removing the old", (() => {
  const insertAt = pageCode.indexOf("chat_memory_record");
  const deleteAt = pageCode.indexOf('.delete().eq("id", row.id)');
  return insertAt > 0 && deleteAt > 0 && insertAt < deleteAt;
})(), "a delete that runs first loses the line if the insert then fails");
check("times_seen is shown as repetition, not as a number nobody reads", /repeated/.test(pageCode) && /once/.test(pageCode));
check("the prunable set is offered rather than applied silently", /chat_memory_prunable/.test(pageCode) && /prune_chat_memory/.test(pageCode));

console.log("\n== 3. the article, forward: it names a route that is real ==");
const { EN } = await import("../help-articles/en.mjs");
const article = EN.find((a) => a.slug === "chat-memory");
check("the chat-memory article is still there", Boolean(article));
check(`its link is ${article?.href}`, article?.href === "/dashboard/ai-memory", String(article?.href));
check("…and that route exists as a page", existsSync(PAGE));
check(
  "…and it is not the record search",
  article?.href !== "/dashboard/memory" && article?.href !== "/dashboard/search"
);

console.log("\n== 4. the article, backward: nothing else claims to be it ==");
// THE DIRECTION THAT WOULD HAVE CAUGHT THE BUG. The link resolved; the
// page was about something else; a second page carried the name.
const searchCode = code(SEARCH_PAGE);
check("the record search is still there, at its own address", searchCode.length > 0);
check(
  "…and it does NOT touch chat_memory",
  !/chat_memory/.test(searchCode),
  "if it did, there would be two pages doing this and the article could not be right about either"
);
check("the old /dashboard/memory address still answers", read(OLD_ROUTE).length > 0);
check("…as a permanent redirect to the search page", /permanentRedirect\("\/dashboard\/search"\)/.test(code(OLD_ROUTE)));

console.log("\n== 5. the two pages cannot share a name in ANY language ==");
{
  const clashes = [];
  const hintClashes = [];
  for (const f of LOCALES) {
    const j = JSON.parse(read(`messages/${f}`));
    const search = j?.sidebar?.items?.memory;
    const ai = j?.sidebar?.items?.aiMemory;
    if (!search || !ai) {
      clashes.push(`${f}: missing (${search ? "" : "items.memory "}${ai ? "" : "items.aiMemory"})`);
      continue;
    }
    if (search.trim() === ai.trim()) clashes.push(`${f}: both are "${search}"`);
    const searchHint = j?.sidebar?.hints?.memory ?? "";
    const aiHint = j?.sidebar?.hints?.aiMemory ?? "";
    if (!aiHint) hintClashes.push(`${f}: no hint for aiMemory`);
    if (searchHint.trim() && searchHint.trim() === aiHint.trim()) hintClashes.push(`${f}: identical hints`);
  }
  check(`the two labels differ in all ${LOCALES.length} locales`, clashes.length === 0, clashes.join("\n        "));
  check("…and so do the hints under them", hintClashes.length === 0, hintClashes.join("\n        "));

  // THE SENTENCE THAT WAS THE LIE, held at zero. The record search's hint
  // said "What the AI remembers about you." in every language while
  // reading none of it.
  const en = JSON.parse(read("messages/en.json"));
  check(
    "the record search is no longer described as what the AI remembers",
    !/remembers about you/i.test(en.sidebar.hints.memory),
    `sidebar.hints.memory = "${en.sidebar.hints.memory}"`
  );
  check(
    "…and that sentence now belongs to the page that is it",
    /remembers|kept about you/i.test(en.sidebar.hints.aiMemory),
    `sidebar.hints.aiMemory = "${en.sidebar.hints.aiMemory}"`
  );
}

console.log("\n== 6. every string the page needs, in every language ==");
{
  const KEYS = [
    "title", "description", "emptyTitle", "emptyActive", "emptyInactive", "summary",
    "repeated", "once", "learned", "lastSeen", "outsideWindow", "openConversation",
    "conversationGone", "editLabel", "deleteLabel", "save", "cancel",
    "clearAll", "clearAllConfirm", "pruneButton", "pruneConfirm", "pruned",
  ];
  const missing = [];
  for (const f of LOCALES) {
    const j = JSON.parse(read(`messages/${f}`));
    for (const k of KEYS) if (!j?.aiMemory?.[k]) missing.push(`${f}:${k}`);
    if (!j?.settings?.chatMemory?.seeAll) missing.push(`${f}:settings.chatMemory.seeAll`);
  }
  check(`all ${KEYS.length} strings present in all ${LOCALES.length} locales`, missing.length === 0, missing.slice(0, 8).join(", "));
}

console.log("\n== 7. the sidebar draws both rows ==");
{
  const nav = code("src/lib/sidebar-nav.ts");
  check("the record search moved to /dashboard/search", /href: "\/dashboard\/search"/.test(nav));
  check("…and what it remembers has its own row", /href: "\/dashboard\/ai-memory"/.test(nav));
  check("…with different icons", /RECORD_SEARCH_ICON/.test(nav) && /MEMORY_ICON/.test(nav));
  const keys = code("src/lib/sidebar-label-keys.ts");
  check("both labels resolve to a translation key", /"Search my records": "memory"/.test(keys) && /"What it remembers": "aiMemory"/.test(keys));
  check("no sidebar row points at the old address", !/href: "\/dashboard\/memory"/.test(nav));
}

console.log("\n== 8. the write path deduplicates, and the prompt says how sure it is ==");
{
  const memory = code("src/lib/chat/memory.ts");
  check(
    "the extractor no longer does a bare .insert()",
    !/from\("chat_memory"\)\s*\.insert\(/.test(memory),
    "five mentions of one fact became five rows, and twenty filled the whole prompt window"
  );
  check("…it records through the function that bumps a counter", /rpc\("chat_memory_record"/.test(memory));
  check("…keyed on the shared fold", /memoryFold\(/.test(memory));
  check("the read orders by last_seen_at, so a repeated fact stays in the window", /order\("last_seen_at"/.test(memory));

  // EXECUTED, not read. The prompt's whole job here is to distinguish two
  // claims, and a regex over the source cannot tell whether it does.
  // memory-prompt.ts, not memory.ts: the latter imports "server-only"
  // and the Anthropic SDK, so it cannot be executed by a gate. That split
  // is the reason this section can assert behaviour instead of grep.
  const { buildMemoryPromptAddition } = await loadTs("src/lib/chat/memory-prompt.ts").catch(() => ({}));
  if (buildMemoryPromptAddition) {
    const out = buildMemoryPromptAddition([
      { text: "Προτιμά σύντομες απαντήσεις.", timesSeen: 7, lastSeenAt: new Date().toISOString() },
      { text: "Δοκίμασε μία φορά την εξαγωγή.", timesSeen: 1, lastSeenAt: new Date().toISOString() },
    ]);
    check("a repeated fact is presented as repeated", /7/.test(out));
    check("…and a one-off is not presented as a preference", out.includes("μία φορά"));
    check("an empty memory adds nothing at all", buildMemoryPromptAddition([]) === "");
  } else {
    // memory.ts imports the Anthropic SDK, so it may be out of loadTs's
    // reach on some setups. Say so rather than passing quietly.
    check("buildMemoryPromptAddition could be executed", false, "loadTs could not import src/lib/chat/memory-prompt.ts");
  }
}

console.log("\n== 9. the migration is in the tree, with its canaries ==");
{
  const MIG = "supabase/migrations/20261003000000_chat_memory_dedup_and_retention.sql";
  const mig = read(MIG);
  check("the migration exists", mig.length > 0);
  for (const object of ["times_seen", "last_seen_at", "memory_fold", "confirmed_at",
                        "chat_memory_record", "chat_memory_prunable", "prune_chat_memory"]) {
    check(`…it creates ${object}`, mig.includes(object));
  }
  // LOADED AND COMPARED, not grepped. `canaries.includes("times_seen")` is
  // satisfied by `times_seen_renamed_away`, which is a canary for a column
  // that does not exist — the same substring trap that has bitten four
  // checks in this tree. ai-memory.mutation.mjs renamed exactly that and
  // this section stayed green.
  const { SCHEMA_CANARIES } = await loadTs("src/lib/health/schema-canaries.ts");
  const columns = new Set(SCHEMA_CANARIES.filter((c) => c.kind === "column").map((c) => `${c.table}.${c.column}`));
  const fns = new Set(SCHEMA_CANARIES.filter((c) => c.kind === "function").map((c) => c.fn));
  check(`the canary list was loaded (${SCHEMA_CANARIES.length})`, SCHEMA_CANARIES.length > 10);
  check("…and /api/health probes the new column", columns.has("chat_memory.times_seen"),
    [...columns].join(", "));
  for (const fn of ["chat_memory_record", "chat_memory_prunable", "prune_chat_memory"]) {
    check(`…and the ${fn} function`, fns.has(fn),
      "a migration applied by hand needs a probe, or the first sign is a broken screen");
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
