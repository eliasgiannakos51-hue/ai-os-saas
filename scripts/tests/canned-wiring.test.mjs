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
const { matchHelpArticle } = await loadTs("src/lib/support/canned-answers.ts");

// Real articles, from the file the migration is generated out of — not a
// fixture I wrote to match the assertions. A canned-answer test whose
// triggers were invented by the test author proves the matcher can match
// the test, which is not the question.
const { readFileSync: rf } = await import("node:fs");
const elContent = JSON.parse(rf("content/help/el.json", "utf8")).articles;
const EL_ARTICLES = Object.entries(elContent).map(([slug, a]) => ({
  slug, locale: "el", title: a.title, body: a.body,
  category: "billing", order: 0, triggers: a.triggers, href: null, isFallback: false,
}));

console.log("== 1. it is wired into chat at all ==");
check("chat imports the matcher", /import \{ matchHelpArticle/.test(chat));
check("and calls it", /matchHelpArticle\(/.test(chat));
// THE LOCALE DECIDES WHAT IS EVEN FETCHED, not just how it is matched.
// The route must resolve the request's locale and load articles for THAT
// locale alone — asserted on the WIRING, because the matcher's own unit
// test cannot see whether the route bothers to call it correctly, and a
// route that loaded every locale would hand a Greek paragraph to a French
// reader no matter how careful the matcher is.
check(
  "and passes the request locale to it",
  /const locale = await getLocale\(\)/.test(chat) &&
    /loadHelpArticlesForLocaleOnly\(locale\)/.test(chat) &&
    /matchHelpArticle\(\s*\n?\s*message,\s*\n?\s*cannedArticles,\s*\n?\s*locale,/.test(chat)
);
check(
  "…and does NOT use the fallback-to-English loader for the chat",
  !/loadHelpArticles\(locale\)/.test(chat),
  "answering a French reader in English is the same bug in a different language"
);
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

// THE BEHAVIOURAL HALF — AND A VACUOUS TEST THAT USED TO LIVE HERE.
//
// The two threshold checks below were previously written as
//
//     kb.matchCannedAnswer("πόσο κοστίζει;", 0.92)
//
// against a signature whose SECOND parameter is the locale, not the
// threshold. 0.92 is not "el", so the matcher returned null before doing
// any work and both checks passed without ever exercising a threshold.
// They were green for a year and measured nothing.
//
// Written out below with the arguments in the right places, and with the
// measured confidence recorded so a future reader can tell a real pass
// from a null:
//
//     matchHelpArticle("πόσο κοστίζει;", EL_ARTICLES, "el") -> pricing-overview
//
const pricing = matchHelpArticle("πόσο κοστίζει;", EL_ARTICLES, "el", 0.85);
check(
  "a clear FAQ matches at the new-conversation threshold",
  pricing?.article.slug === "pricing-overview",
  pricing ? `got ${pricing.article.slug} @ ${pricing.confidence}` : "got null"
);
check(
  "…and it is a real match, not a null that happens to satisfy the shape",
  typeof pricing?.confidence === "number" && pricing.confidence >= 0.85,
  String(pricing?.confidence)
);
{
  const strict = matchHelpArticle("πόσο κοστίζει;", EL_ARTICLES, "el", 0.92);
  check(
    "the mid-conversation threshold is genuinely stricter or equal",
    strict === null || strict.confidence >= 0.92,
    strict ? `confidence ${strict.confidence}` : "rejected"
  );
}
check(
  "an account-specific question never matches",
  matchHelpArticle("πόσα credits μου έχουν μείνει;", EL_ARTICLES, "el", 0.85) === null
);
// The leak this whole redesign is about: Greek articles, a French reader.
check(
  "a French reader is never matched against Greek articles",
  matchHelpArticle("combien ça coûte", EL_ARTICLES, "fr", 0.85) === null ||
    matchHelpArticle("combien ça coûte", EL_ARTICLES, "fr", 0.85).article.locale === "fr"
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
check(
  "built from the same table the chat answers from",
  /loadHelpArticles\(/.test(help) && /@\/lib\/support\/help-articles/.test(help),
  "a help page and a support bot answering the same question differently is worse than having only one"
);
check("not a second hand-written copy", !/const ARTICLES = \[/.test(help));
check("every article gets its own anchor", /id=\{article\.slug\}/.test(help));
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
// The links now live in src/lib/support/help-links.ts rather than beside
// the prose — a route is code, is the same in every language, and storing
// it once per (slug, locale) row would give it 134 chances to drift. This
// walks src/app so the check is against routes that actually exist, not
// against a second list of routes somebody also has to maintain.
const { HELP_LINKS } = await loadTs("src/lib/support/help-links.ts");
const manifestSlugs = JSON.parse(readFileSync("content/help/manifest.json", "utf8"))
  .articles.map((a) => a.slug);

check(
  "every article in the manifest has a link entry (or an explicit null)",
  manifestSlugs.every((slug) => slug in HELP_LINKS),
  manifestSlugs.filter((slug) => !(slug in HELP_LINKS)).join(", ")
);
check(
  "and there is no link for an article that no longer exists",
  Object.keys(HELP_LINKS).every((slug) => manifestSlugs.includes(slug)),
  Object.keys(HELP_LINKS).filter((slug) => !manifestSlugs.includes(slug)).join(", ")
);
for (const [slug, href] of Object.entries(HELP_LINKS)) {
  if (!href) continue;
  check(
    `${slug} -> ${href} exists`,
    APP_ROUTES.has(href),
    `known routes: ${[...APP_ROUTES].filter((r) => r.startsWith(href.split("/").slice(0, 2).join("/"))).join(", ")}`
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
