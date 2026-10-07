/*
 * THE SITE'S SHARED REQUESTS, RUN (package 7): the Site shell and the Site
 * opened beside Chat both make a site through
 * lib/website-builder/site-requests.ts. Here they run against a fake
 * fetch, so what each answer from the server turns into is held, not
 * read off the source.
 *
 * Run: node scripts/tests/chat-opens-tools.itest.mjs
 */
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}

// WITH ITS DEPENDENCIES: the requests go through fetchWithAuthRetry, which
// imports the browser Supabase client to refresh a session on a 401.
const { loadTsWithDeps } = await import("./load-ts.mjs");
const req = await loadTsWithDeps("src/lib/website-builder/site-requests.ts");

console.log("chat-opens-tools (the shared requests, run)");
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


console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
