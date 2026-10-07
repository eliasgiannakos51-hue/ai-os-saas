/*
 * CHAT OPENS THE SITE (MASTER 16, package 7): «γράφω "φτιάξε μου site για
 * το camping" και ανοίγει το Site δίπλα».
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. WHEN. A request for a site opens it — in Greek with and without
 *      accents, in English, German, Spanish, French — and a question about
 *      sites, a remark about one, or a request for something else does not.
 *   2. THE REQUESTS, shared by the Site shell and the pane, run against a
 *      fake fetch: questions come back as questions; a started site hands
 *      the row to the worker unless the server suppressed a duplicate; a
 *      refusal carries the server's own reason; the status is watched until
 *      it stops, retried on a failed read and stopped when the screen is
 *      gone; a change names a vanished page and a lost part; Stop asks the
 *      worker to stop.
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
// WITH ITS DEPENDENCIES: the requests go through fetchWithAuthRetry, which
// imports the browser Supabase client to refresh a session on a 401.
const { loadTsWithDeps } = await import("./load-ts.mjs");
const req = await loadTsWithDeps("src/lib/website-builder/site-requests.ts");

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
console.log("\n== 2. the shared requests, against a fake fetch ==");
// ---------------------------------------------------------------------
const calls = [];
let answers = {};
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null, keepalive: init.keepalive ?? false });
  const key = Object.keys(answers).find((k) => u.startsWith(k));
  const a = key ? answers[key] : { status: 404, body: { ok: false } };
  const next = Array.isArray(a) ? a.shift() ?? a.at(-1) : a;
  if (next === "throw") throw new TypeError("network");
  return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
};
const site = (status, html = "") => ({ id: "s1", name: "Camping", status, html_content: html, error_message: status === "failed" ? "boom" : null });

calls.length = 0;
answers = { "/api/websites/generate": { body: { ok: true, needsClarification: true, questions: ["Πού;", "Τι τιμές;"] } } };
let out = await req.startSiteGeneration({ name: "Camping", description: "site για camping", skipClarification: false });
check("questions come back as questions", out.kind === "questions" && out.questions.length === 2);
check("...and no worker is started", !calls.some((c) => c.url.includes("/process")));
check("...and the request says whether questions may be skipped", calls[0]?.body?.skipClarification === false && calls[0]?.body?.description === "site για camping");

calls.length = 0;
answers = { "/api/websites/generate/process": { body: { ok: true } }, "/api/websites/generate": { body: { ok: true, generated: true, record: site("pending") } } };
out = await req.startSiteGeneration({ name: "Camping", description: "site για camping", skipClarification: true });
check("a started site comes back with its row", out.kind === "started" && out.record.id === "s1");
const worker = calls.find((c) => c.url === "/api/websites/generate/process");
check("...and the worker is handed the row, kept alive past navigation", worker && worker.body.websiteId === "s1" && worker.keepalive === true);

calls.length = 0;
answers = { "/api/websites/generate": { body: { ok: true, generated: true, duplicateSuppressed: true, record: site("processing") } } };
await req.startSiteGeneration({ name: "Camping", description: "x", skipClarification: true });
check("a duplicate the server suppressed starts no second worker", !calls.some((c) => c.url.includes("/process")));

answers = { "/api/websites/generate": { status: 402, body: { ok: false, error: "Δεν έχεις αρκετά credits." } } };
out = await req.startSiteGeneration({ name: "Camping", description: "x", skipClarification: true });
check("a refusal carries the server's own reason (credits)", out.kind === "refused" && out.error === "Δεν έχεις αρκετά credits.");
answers = { "/api/websites/generate": { body: { ok: true, generated: false, message: "Αυτό δεν είναι site." } } };
out = await req.startSiteGeneration({ name: "Camping", description: "x", skipClarification: true });
check("a site the server would not make says why", out.kind === "notMade" && out.message === "Αυτό δεν είναι site.");
answers = { "/api/websites/generate": "throw" };
let threw = null;
try { await req.startSiteGeneration({ name: "C", description: "x", skipClarification: true }); } catch (e) { threw = e; }
check("no connection is thrown, for the screen to say in its own words", threw instanceof TypeError);

// watchSite, with no waiting: the interval is replaced for this run.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
calls.length = 0;
answers = { "/api/websites/status": [{ status: 500, body: { ok: false } }, { body: { ok: true, record: site("processing") } }, { body: { ok: true, record: site("completed", "<html></html>"), usage: 1 } }] };
const seen = [];
// A watch that gives up never calls onDone, so the wait is bounded: a
// hang is a failure here, not a gate that never ends.
const done = await new Promise((resolve) => {
  req.watchSite("s1", { alive: () => true, onRecord: (r) => seen.push(r.status), onDone: (r, usage) => resolve({ r, usage }) });
  realSetTimeout(() => resolve(null), 3000);
});
check("a failed read is retried, and every state is heard", seen.join(",") === "processing,completed", seen.join(","));
check("...until it stops running, with the usage to report", done !== null && done.r.status === "completed" && done.usage?.usage === 1);
check("...through the status of that one site", calls.every((c) => c.url === "/api/websites/status?id=s1"));
calls.length = 0;
answers = { "/api/websites/status": { body: { ok: true, record: site("processing") } } };
await new Promise((resolve) => { req.watchSite("s1", { alive: () => false, onRecord: () => {}, onDone: () => {} }); realSetTimeout(resolve, 20); });
check("a screen that is gone stops the watch before it asks", calls.length === 0);
globalThis.setTimeout = realSetTimeout;

answers = { "/api/websites/edit": { body: { ok: true, edited: true, record: site("completed", "<html>2</html>") } } };
calls.length = 0;
out = await req.requestSiteChange({ websiteId: "s1", changeRequest: "βάλε ωράριο" });
check("a change returns the new row", out.kind === "changed" && out.record.html_content === "<html>2</html>");
check("...and goes without a part unless one was chosen", !("section" in calls[0].body));
await req.requestSiteChange({ websiteId: "s1", changeRequest: "x", section: 2 });
check("...and with it when one was", calls[1].body.section === 2);
answers = { "/api/websites/edit": { status: 404, body: { ok: false, reason: "unknown_page" } } };
check("a page that is gone is named", (await req.requestSiteChange({ websiteId: "s1", changeRequest: "x" })).reason === "pageGone");
answers = { "/api/websites/edit": { status: 502, body: { ok: false, reason: "box_lost" } } };
check("a part that did not come back is named", (await req.requestSiteChange({ websiteId: "s1", changeRequest: "x", section: 1 })).reason === "boxLost");
answers = { "/api/websites/s1/cancel": { body: { ok: true } } };
check("Stop asks the worker to stop", (await req.requestSiteStop("s1")) === true);
check("a running site is one that is pending or processing", req.isSiteRunning(site("pending")) && req.isSiteRunning(site("processing")) && !req.isSiteRunning(site("completed")) && !req.isSiteRunning(null));

// ---------------------------------------------------------------------
console.log("\n== 3. the chat, behind the switch ==");
// ---------------------------------------------------------------------
check('"chat-opens-tools" is declared as a switch', /\n  "chat-opens-tools": "/.test(code("src/lib/flags/flags.ts")));
check("the Chat page reads it", /opensTools=\{await isFeatureOn\("chat-opens-tools", user\)\}/.test(code("src/app/dashboard/chat/page.tsx")));
const chat = code("src/components/chat/chat-workspace.tsx");
const decide = chat.indexOf("if (opensTools && openSiteFor(text, locale)) {");
const paid = chat.indexOf('const res = await fetch("/api/chat"');
check("the decision is made before /api/chat is called, so no model is paid to decide", decide > 0 && paid > decide);
check("...and a request for a site opens it and returns", /if \(opensTools && openSiteFor\(text, locale\)\) \{\s*showMine\(\);\s*setOpenWorkId\(null\);\s*setSiteHidden\(false\);\s*setSiteBrief\(text\);\s*return;\s*\}/.test(chat));
check("what is said next goes to the open site first", /if \(siteBrief !== null && sitePaneRef\.current\?\.take\(text\)\) \{\s*showMine\(\);\s*setSiteHidden\(false\);\s*return;\s*\}/.test(chat) && chat.indexOf("sitePaneRef.current?.take(text)") < paid);
check("the pane is drawn beside the conversation", /<SitePane\s+ref=\{sitePaneRef\}\s+key=\{siteBrief\}\s+brief=\{siteBrief\}\s+hidden=\{siteHidden\}\s+onBack=\{\(\) => setSiteHidden\(true\)\}\s+onClose=\{\(\) => setSiteBrief\(null\)\}/.test(chat));
check("on a phone, back to the conversation keeps the site open, and one press shows it again",
  /\{siteBrief !== null && siteHidden && \(\s*<button type="button" onClick=\{\(\) => setSiteHidden\(false\)\} data-testid="chat-site-reopen"/.test(chat) && /onClick=\{onBack\}[^>]*data-testid="chat-site-back"/.test(code("src/components/chat/site-pane.tsx")));
check("...and a change said from the conversation shows it again", /sitePaneRef\.current\?\.take\(text\)\) \{\s*showMine\(\);\s*setSiteHidden\(false\);/.test(chat));
check("...and closed when the conversation changes", /useEffect\(\(\) => setSiteBrief\(null\), \[activeId\]\)/.test(chat));

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
  /if \(outcome\.kind === "refused"\) \{[\s\S]{0,120}failWith\(getErrorMessage\(outcome\.error/.test(pane) && /err instanceof TypeError \? tCommon\("networkErrorCheckConnection"\)/.test(pane));
check('"Open in Site" opens that site, or the brief when there is no site yet', /\/dashboard\/website-builder\?project=\$\{encodeURIComponent\(site\.id\)\}/.test(pane) && /\/dashboard\/website-builder\?brief=\$\{encodeURIComponent\(description\.slice\(0, 500\)\)\}/.test(pane));
check("what the brief took from memory is said, as in the Site", /const fromMemory = remembered\.forRecord\(done\);/.test(pane));
check("the Site shell makes its site through the same requests", /startSiteGeneration\(/.test(code("src/components/website-builder/website-shell.tsx")) && !/fetch\("\/api\/websites\/generate/.test(code("src/components/website-builder/website-shell.tsx")));

// ---------------------------------------------------------------------
console.log("\n== 5. the words ==");
// ---------------------------------------------------------------------
const KEYS = ["label", "willMake", "make", "notNow", "openInSite", "building", "changing", "nextChanges", "reopen"];
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.chat?.sitePane ?? {};
  const empty = KEYS.filter((k) => typeof m[k] !== "string" || !m[k].trim());
  check(`${file}: the pane's words (${KEYS.length})`, empty.length === 0, empty.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
