/*
 * CHAT OPENS THE SITE (MASTER 16, package 7): «γράφω "φτιάξε μου site για
 * το camping" και ανοίγει το Site δίπλα».
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. WHEN. A request for a site opens it — in Greek with and without
 *      accents, in English, German, Spanish, French — and a question about
 *      sites, a remark about one, or a request for something else does not.
 *   2. THE REQUESTS, shared by the Site shell and the pane, are RUN
 *      against a fake fetch in scripts/tests/chat-opens-tools.itest.mjs
 *      (they import the browser Supabase client, which a gate here may not
 *      bundle); this file holds that both screens use them.
 *   3. THE CHAT, behind the switch "chat-opens-tools": the page reads the
 *      switch; the decision runs BEFORE /api/chat, so no model is paid to
 *      decide; what is said next goes to the open site first.
 *   4. THE PANE: the price before anything is spent, nothing spent until
 *      the press, the questions answered in the Chat field or skipped, Stop
 *      while it builds, the finished site sandboxed with no scripts, the
 *      next message a change, and "Open in Site" — all through the shared
 *      requests, with none of its own.
 *   5. The words, in ten languages.
 *
 * The same in a browser: scripts/tests/chat-opens-tools.prodtest.mjs.
 *
 * Run: node scripts/tests/chat-opens-tools.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
const code = (p) => stripComments(readFileSync(p, "utf8"));

const open = await loadTs("src/lib/chat/open-tool.ts");

console.log("chat-opens-tools");

// ---------------------------------------------------------------------
console.log("\n== 1. which messages open the Site ==");
// ---------------------------------------------------------------------
const OPENS = [
  ["φτιάξε μου site για το camping", "el"],
  ["φτιαξε μου site για το camping", "el"],
  ["ΦΤΙΑΞΕ ΜΟΥ ΣΑΙΤ ΓΙΑ ΤΟ ΚΑΦΕ ΜΟΥ", "el"],
  ["Θέλω ένα site για το εστιατόριό μου", "el"],
  ["θα ήθελα μια ιστοσελίδα για το γραφείο μου", "el"],
  ["φτιάξε μου ένα site;", "el"],
  ["Make me a website for my bakery", "en"],
  ["I want a website for my dental clinic", "en"],
  ["Erstelle eine Website für meine Bäckerei", "de"],
  ["Crea un sitio web para mi tienda", "es"],
  ["crée un site web pour ma boulangerie", "fr"],
];
for (const [text, locale] of OPENS) check(`opens: «${text}»`, open.openSiteFor(text, locale) === true);
const STAYS = [
  ["τι είναι ένα καλό site;", "el"],
  ["πώς φτιάχνω ένα site;", "el"],
  ["μου αρέσει το site της Apple", "el"],
  ["θέλω να μάθω πώς φτιάχνεται ένα site", "el"],
  ["φτιάξε μου μια παρουσίαση για τους επενδυτές", "el"],
  ["φτιάξε μου site και παρουσίαση για το camping", "el"],
  ["What makes a good website?", "en"],
  ["I want to know how websites work?", "en"],
  ["", "el"],
];
for (const [text, locale] of STAYS) check(`stays in the conversation: «${text}»`, open.openSiteFor(text, locale) === false);

// ---------------------------------------------------------------------
console.log("\n== 3. the chat, behind the switch ==");
// ---------------------------------------------------------------------
check('"chat-opens-tools" is declared as a switch', /\n  "chat-opens-tools": "/.test(code("src/lib/flags/flags.ts")));
const chatPage = code("src/app/dashboard/chat/page.tsx");
check("the Chat page reads it", /bypassesCredits, plan, opensTools\] = await Promise\.all\(\[[\s\S]*?isFeatureOn\("chat-opens-tools", user\),\s*\]\);/.test(chatPage) && /opensTools=\{opensTools\}/.test(chatPage));
// A PLAN WITHOUT THE SITE GETS ITS WALL, from the gate /api/websites/generate
// asks — not a «Φτιάξ' το» the route refuses in English (2026-10-08,
// scripts/tests/chat-opens-tools-edges.prodtest.mjs).
check("a plan without the Site gets the plan's wall in the pane, from the route's own gate",
  /opensTools && !accountHasCapability\(plan\.slug, "websiteBuilder", isAdminEmail\(user\.email\)\)\s*\?\s*upgradeWallProps\("websiteBuilder"/.test(chatPage) &&
    /siteWall=\{siteWall\}/.test(chatPage));
const chat = code("src/components/chat/chat-workspace.tsx");
const decide = chat.indexOf("if (opensTools && openSiteFor(text, locale)) {");
const paid = chat.indexOf('const res = await fetch("/api/chat"');
check("the decision is made before /api/chat is called, so no model is paid to decide", decide > 0 && paid > decide);
check("...and a request for a site opens it and returns", /if \(opensTools && openSiteFor\(text, locale\)\) \{\s*showMine\(\);\s*setOpenWorkId\(null\);\s*setSiteHidden\(false\);\s*setSiteBrief\(text\);\s*return;\s*\}/.test(chat));
check("what is said next goes to the open site first", /if \(siteBrief !== null && sitePaneRef\.current\?\.take\(text\)\) \{\s*showMine\(\);\s*setSiteHidden\(false\);\s*return;\s*\}/.test(chat) && chat.indexOf("sitePaneRef.current?.take(text)") < paid);
check("the pane is drawn beside the conversation", /<SitePane\s+ref=\{sitePaneRef\}\s+key=\{siteBrief\}\s+brief=\{siteBrief\}\s+wall=\{siteWall\}\s+hidden=\{siteHidden\}\s+onBack=\{\(\) => setSiteHidden\(true\)\}\s+onClose=\{\(\) => setSiteBrief\(null\)\}/.test(chat));
check("on a phone, back to the conversation keeps the site open, and one press shows it again",
  /\{siteBrief !== null && siteHidden && \(\s*<button type="button" onClick=\{\(\) => setSiteHidden\(false\)\} data-testid="chat-site-reopen"/.test(chat) && /onClick=\{onBack\}[^>]*data-testid="chat-site-back"/.test(code("src/components/chat/site-pane.tsx")));
check("...and a change said from the conversation shows it again", /sitePaneRef\.current\?\.take\(text\)\) \{\s*showMine\(\);\s*setSiteHidden\(false\);/.test(chat));
check("...and closed when the conversation changes", /useEffect\(\(\) => setSiteBrief\(null\), \[activeId\]\)/.test(chat));
{
  // «Νέα συνομιλία» from a conversation that never reached /api/chat: its
  // id is already null, so the effect above does not run, and the pane has
  // to be closed by startNewChat itself (the prodtest drives it).
  const start = chat.indexOf("function startNewChat() {");
  const body = start > 0 ? chat.slice(start, chat.indexOf("\n  }\n", start)) : "";
  check("...and «Νέα συνομιλία» closes it even when there was no conversation yet", /setSiteBrief\(null\);/.test(body) && /setOpenWorkId\(null\);/.test(body), body.slice(0, 200));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the pane ==");
// ---------------------------------------------------------------------
const pane = code("src/components/chat/site-pane.tsx");
check("the price before anything is spent, from the server's own estimator", /estimateForAction\(\s*"websiteGenerate"/.test(pane) && /tSite\("estimatedCost", \{ count: credits \}\)/.test(pane));
check("nothing is spent until the press", /onClick=\{\(\) => void make\(description, false\)\}\s*data-testid="chat-site-make"/.test(pane) && (pane.match(/void make\(/g) ?? []).length === 3);
check("the questions: answered in the Chat field, or skipped", /if \(stage === "questions"\) \{[\s\S]{0,300}appendClarificationAnswers\(description, questions,[\s\S]{0,200}void make\(enriched, true\);\s*return true;/.test(pane) && /onClick=\{\(\) => void make\(description, true\)\} data-testid="chat-site-skip"/.test(pane));
check("the finished site: what is said next changes it", /if \(stage === "done" && site && site\.status === "completed"\) \{\s*void change\(text, site\);\s*return true;/.test(pane));
check("...and anything else is the conversation's", /return false;\s*\},\s*\}\)\);/.test(pane));
check("Stop while it builds", /stage === "building" && site &&[\s\S]{0,200}data-testid="chat-site-stop"[\s\S]{0,120}requestSiteStop\(site\.id\)/.test(pane));
check("the preview is sandboxed, with no scripts, and marked as made by AI", /<AiGeneratedNotice variant="block" \/>\s*<iframe [^>]*srcDoc=\{html\} sandbox="" /.test(pane));
check("only a whole document is drawn", /looksLikeCompleteHtmlDocument\(html\)/.test(pane));
check("all through the shared requests, with none of its own", /from "@\/lib\/website-builder\/site-requests"/.test(pane) && !/fetch\(/.test(pane));
check("refusals and no connection are said, never swallowed",
  /if \(outcome\.kind === "refused"\) \{[\s\S]{0,120}failWith\([\s\S]{0,200}serverSaid\(getErrorMessage\(outcome\.error/.test(pane) && /err instanceof TypeError \? tCommon\("networkErrorCheckConnection"\)/.test(pane));
// IN THE SCREEN'S LANGUAGE (2026-10-08): the route's and the worker's
// sentences are English, and a provider's own error reached the pane as
// `529 {"type":"error",…}`.
check("the plan's wall, before anything is offered", /useState<Stage>\(wall \? "locked" : "confirm"\)/.test(pane) && /\{stage === "locked" && wall && \([\s\S]{0,300}<UpgradeRequired \{\.\.\.wall\} \/>/.test(pane));
check("a site that failed is said in the pane's own words, never the worker's sentence",
  /failWith\(whyNotMade\(done\)\)/.test(pane) && /return t\("failed"\);/.test(pane) && !/error_message/.test(pane));
check("a server sentence is shown as it came only on an English screen", /const serverSaid = \(text: string \| null \| undefined, ours: string\) => \(locale\.startsWith\("en"\) && text \? text : ours\);/.test(pane));
check("no credits is said by the credits notice, from the code and numbers the route sends",
  /if \(outcome\.code === "insufficient_credits"\) \{[\s\S]{0,160}setNoCredits\(\{ available: outcome\.available, needed: outcome\.needed \}\)/.test(pane) && /<OutOfCreditsNotice/.test(pane) &&
    (code("src/app/api/websites/generate/route.ts").match(/code: "insufficient_credits",\s*available: check\.remaining,/g) ?? []).length === 2 &&
    /code: str\(data\.code\), available: num\(data\.available\), needed: num\(data\.needed\)/.test(code("src/lib/website-builder/site-requests.ts")));
{
  // AND THE CHAT ITSELF, out of credits: the same English sentence was set
  // as the chat's error on every screen (scripts/tests/brand-memory.prodtest.mjs).
  const chatRoute = code("src/app/api/chat/route.ts");
  check("Chat says no credits in its own words, before the answer and inside it",
    /code: "insufficient_credits",\s*available: check\.remaining,\s*needed: estimate\.reserveCredits,/.test(chatRoute) &&
      /available: reservation\.available, needed: streamEstimate\.reserveCredits/.test(chatRoute) &&
      /setError\(data\.code === "insufficient_credits" \? outOfCreditsText\(data\.available, data\.needed\) : data\.message\);/.test(chat) &&
      /streamError = event\.outOfCredits === true \? outOfCreditsText\(event\.available, event\.needed\)/.test(chat));
}
check('"Open in Site" opens that site, or the brief when there is no site yet', /\/dashboard\/website-builder\?project=\$\{encodeURIComponent\(site\.id\)\}/.test(pane) && /\/dashboard\/website-builder\?brief=\$\{encodeURIComponent\(description\.slice\(0, 500\)\)\}/.test(pane));
check("what the brief took from memory is said, as in the Site", /const fromMemory = remembered\.forRecord\(done\);/.test(pane));
check("the Site shell makes its site through the same requests", /startSiteGeneration\(/.test(code("src/components/website-builder/website-shell.tsx")) && !/fetch\("\/api\/websites\/generate/.test(code("src/components/website-builder/website-shell.tsx")));

// ---------------------------------------------------------------------
console.log("\n== 5. the words ==");
// ---------------------------------------------------------------------
const KEYS = ["label", "willMake", "make", "notNow", "openInSite", "building", "changing", "nextChanges", "reopen"];
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
check(`the words to look for (${KEYS.length})`, KEYS.length >= 9);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.chat?.sitePane ?? {};
  const empty = KEYS.filter((k) => typeof m[k] !== "string" || !m[k].trim());
  check(`${file}: the pane's words (${KEYS.length})`, empty.length === 0, empty.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
