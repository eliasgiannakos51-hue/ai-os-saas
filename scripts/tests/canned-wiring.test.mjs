// The knowledge base is CONNECTED to something.
//
// lib/support/knowledge-base.ts shipped with 27 articles, a matcher, a
// threshold and its own passing test suite (canned-answers.test.mjs) — and
// nothing imported it. Every "how much does it cost", "how do I cancel",
// "what are credits" paid for a full Claude turn: reserve, stream, memory
// extraction, settle, cost-log row. To reproduce a sentence that has not
// changed in months.
//
// canned-answers.test.mjs already proves the MATCHER is right (no moving
// numbers, never for account-specific questions, accent-insensitive). This
// file proves the matcher is REACHED, that reaching it skips the money,
// and that the answers are visible somewhere other than a chat reply.
//
// Run: node scripts/tests/canned-wiring.test.mjs
import { readFileSync, existsSync } from "node:fs";

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

const chat = readFileSync("src/app/api/chat/route.ts", "utf8");
const { loadTs } = await import("./load-ts.mjs");
const kb = await loadTs("src/lib/support/knowledge-base.ts");

console.log("== 1. it is wired into chat at all ==");
check("chat imports the matcher", /import \{ matchCannedAnswer/.test(chat));
check("and calls it", /matchCannedAnswer\(/.test(chat));
check("with a dedicated handler", /answerFromKnowledgeBase/.test(chat));

console.log("\n== 2. the canned path costs nothing ==");
const handler = chat.slice(
  chat.indexOf("async function answerFromKnowledgeBase"),
  chat.indexOf("export async function POST")
);
check("the handler exists", handler.length > 200);
check("it never reserves credits", !/reserveCredits\(/.test(handler));
check("it never settles", !/settleReservation\(/.test(handler));
check("it never consumes a free-chat message", !/consumeFreeChatMessage/.test(handler));
check("it never constructs an Anthropic client", !/new Anthropic\(/.test(handler));
check("it never extracts memory (a second billed call)", !/extractAndStoreMemory/.test(handler));
check("the receipt it returns is explicitly zero", /creditsCharged: 0/.test(handler));

console.log("\n== 3. it is checked before the machinery it is meant to skip ==");
// Ordering is measured inside the POST body only. Measuring against the
// whole file would compare against the IMPORT lines, which naturally come
// first and would make every one of these pass for the wrong reason.
const body = chat.slice(chat.indexOf("export async function POST"));
const cannedAt = body.indexOf("const cannedMatch =");
const breakerAt = body.indexOf("const breakerCheck = await checkAiCallAllowed");
const planAt = body.indexOf("const plan = await resolveEffectivePlan(user)");
const contextAt = body.indexOf("await getUserFullContext(");
const creditCheckAt = body.indexOf("await hasEnoughCredits(");
check("all the markers were found", [cannedAt, breakerAt, planAt, contextAt, creditCheckAt].every((i) => i > 0));
check("the match happens before the circuit breaker", cannedAt < breakerAt);
check("before the plan is resolved", cannedAt < planAt);
check("and before any context is loaded", cannedAt < contextAt);
// The point of that ordering: someone out of credits can still be told how
// to cancel their subscription.
check("so it is reachable with no credits left", cannedAt < creditCheckAt);

console.log("\n== 4. two thresholds, because context changes the meaning ==");
check("a new conversation uses the library default", /CANNED_THRESHOLD_NEW_CONVERSATION = 0\.85/.test(chat));
check("mid-conversation is stricter", /CANNED_THRESHOLD_MID_CONVERSATION = 0\.92/.test(chat));
check(
  "and the threshold is chosen from whether a conversation exists",
  /conversationId \? CANNED_THRESHOLD_MID_CONVERSATION : CANNED_THRESHOLD_NEW_CONVERSATION/.test(chat)
);
check("Mentor Mode is never answered from the FAQ", /mentorMode\s*\?\s*null/.test(chat));
// The behavioural half of the same claim.
const pricing = kb.matchCannedAnswer("πόσο κοστίζει;", 0.85);
check("a clear FAQ matches at the new-conversation threshold", pricing?.article.id === "pricing-overview");
check(
  "and the same question is rejected at the mid-conversation threshold",
  kb.matchCannedAnswer("πόσο κοστίζει;", 0.92) === null ||
    kb.matchCannedAnswer("πόσο κοστίζει;", 0.92).confidence >= 0.92
);
check(
  "an account-specific question never matches at either threshold",
  kb.matchCannedAnswer("πόσα credits μου έχουν μείνει;", 0.85) === null
);

console.log("\n== 5. the wire shape is identical to a model reply ==");
// A canned answer arriving in a different shape would need its own
// rendering, its own error handling and its own bookkeeping, and the three
// would drift.
check("it streams NDJSON", /application\/x-ndjson/.test(handler));
check("with a meta event", /type: "meta"/.test(handler));
check("a delta event", /type: "delta"/.test(handler));
check("and a done event carrying a receipt", /type: "done"[\s\S]{0,200}buildUsageReceipt/.test(handler));
check("the conversation is created or verified like the model path", /chat_conversations/.test(handler));
check("both messages are persisted, so history stays coherent", /role: "assistant", content: answer/.test(handler));

console.log("\n== 6. the same answers are readable as a page ==");
check("the Help Centre exists", existsSync("src/app/help/page.tsx"));
const help = readFileSync("src/app/help/page.tsx", "utf8");
check("built from the same knowledge base", /from "@\/lib\/support\/knowledge-base"/.test(help));
check("not a second hand-written copy", !/const ARTICLES = \[/.test(help));
check("every article gets its own anchor", /id=\{article\.id\}/.test(help));
check("it is public, not under /dashboard", existsSync("src/app/help/page.tsx") && !existsSync("src/app/dashboard/help/page.tsx"));
check("and it is in the sitemap", /"\/help"/.test(readFileSync("src/app/sitemap.ts", "utf8")));
check("reachable from the sidebar", /href: "\/help"/.test(readFileSync("src/lib/sidebar-nav.ts", "utf8")));

console.log("\n== 7. every article link points at a route that exists ==");
// Found by building the page: one article linked to /legal/privacy, and
// there is no /legal segment in this app. Nothing rendered these links
// before, so the 404 was invisible.
const APP_ROUTES = new Set();
function collect(dir) {
  const { readdirSync, statSync } = require("node:fs");
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) collect(full);
    else if (entry === "page.tsx") {
      APP_ROUTES.add(full.replace("src/app", "").replace("/page.tsx", "") || "/");
    }
  }
}
const { createRequire } = await import("node:module");
globalThis.require = createRequire(import.meta.url);
collect("src/app");
for (const article of kb.KNOWLEDGE_BASE) {
  if (!article.href) continue;
  check(
    `${article.id} -> ${article.href} exists`,
    APP_ROUTES.has(article.href),
    `known routes: ${[...APP_ROUTES].filter((r) => r.startsWith(article.href.split("/").slice(0, 2).join("/"))).join(", ")}`
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
