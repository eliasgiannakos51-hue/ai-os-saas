/*
 * A SITE OF FIVE PAGES, ONE PART CHANGED IN WORDS, PUBLISHED AT ITS OWN
 * ADDRESS (MASTER 16, package 10), behind the switch "site-pages".
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. THE REQUEST FOR PAGES: one, three or five, written into the brief
 *      as our own line and read back from the last such line only.
 *   2. FEWER PAGES THAN ASKED is a note on the row, said in every language.
 *   3. UNDO: the history replayed — twice is two steps back, never a redo;
 *      the route is the owner's, behind the switch, free, and deletes nothing.
 *   4. THE DOWNLOAD: a site with pages is a .zip whose pages link to each
 *      other, read back here with a parser of its own and Node's CRC.
 *   5. THE SHELL: the fourth option, the page tabs, the parts and the change
 *      of the open page, undo, the whole-site download, the notes, the
 *      address to publish at (PublishControl).
 *   6. The words, in ten languages.
 *   7. FAILURES IN THE READER'S LANGUAGE: out of credits, a provider down,
 *      a change held back or still running, a site that was not made, a
 *      brief that is not a website, a publish the plan refuses —
 *      said from a status, a code and the row's notes, never from the
 *      server's English (found 2026-10-08: a Greek screen read «Not enough
 *      credits (you have: 0, need: 15)» and the provider's own JSON).
 *
 * The same in a browser: scripts/tests/site-pages.prodtest.mjs, and through
 * the real routes with every edge: scripts/tests/site-pages-edges.prodtest.mjs.
 * The archive opened by Python's zipfile: scripts/tests/site-pages.itest.mjs.
 *
 * Run: node scripts/tests/site-pages.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { crc32 as nodeCrc32 } from "node:zlib";
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

const req = await loadTs("src/lib/websites/page-request.ts");
const undo = await loadTs("src/lib/websites/undo.ts");
const zip = await loadTs("src/lib/websites/zip-store.ts");
const dl = await loadTs("src/lib/websites/site-download.ts");
const notes = await loadTs("src/lib/website-generation-notes.ts");

console.log("site-pages");

// ---------------------------------------------------------------------
console.log("\n== 1. the request for pages ==");
// ---------------------------------------------------------------------
check("the choices are one, three and five", req.PAGE_COUNT_CHOICES.join(",") === "1,3,5");
const five = req.pageRequestBrief(5);
check("five: the brief asks for exactly five, home included", /^\n\nPAGES REQUESTED: 5\. Write exactly 5 pages including the home page/.test(five));
check("...and says it overrides the default to decide and not pad", /overrides "decide how many pages" and "do not pad"/.test(five));
check("one: a single document, no markers", /PAGES REQUESTED: 1\. Write exactly ONE page — a single document, with no other pages and no page markers/.test(req.pageRequestBrief(1)));
check("letting the site decide adds nothing", req.pageRequestBrief(null) === "" && req.pageRequestBrief(0) === "");
check("more than a site may have is held to the cap", /PAGES REQUESTED: 5\./.test(req.pageRequestBrief(9)));
check("read back from the brief", req.readPageRequest(`Ένα site για camping.${five}`) === 5 && req.readPageRequest(`x${req.pageRequestBrief(3)}`) === 3);
check("...from the last line when a brief was compiled twice", req.readPageRequest(`a${req.pageRequestBrief(3)}${five}`) === 5);
check("...never from the person's own words in the middle of a line", req.readPageRequest("θέλω PAGES REQUESTED: 4. Write exactly 4 pages") === null);
check("...and nothing when nothing was asked", req.readPageRequest("Ένα site για camping.") === null && req.readPageRequest(undefined) === null);
check("a number past the cap is not read", req.readPageRequest("\nPAGES REQUESTED: 9. Write exactly 9 pages") === null);

// ---------------------------------------------------------------------
console.log("\n== 2. fewer pages than asked ==");
// ---------------------------------------------------------------------
const parsed = notes.parseGenerationNotes([
  { kind: "pagesShort", asked: 5, made: 3 },
  { kind: "pagesShort", asked: 3, made: 3 },
  { kind: "pagesShort", asked: 5, made: 0 },
  { kind: "pagesShort", asked: "5", made: 2 },
]);
check("the note is read back, and only when fewer were made", parsed.length === 1 && parsed[0].asked === 5 && parsed[0].made === 3, JSON.stringify(parsed));
const proc = code("src/app/api/websites/generate/process/route.ts");
check("the worker compares what was asked with what was made",
  /const pagesAsked = readPageRequest\(description\);\s*const pagesMade = 1 \+ extraPages\.length;\s*if \(pagesAsked !== null && pagesMade < pagesAsked\) notes\.push\(\{ kind: "pagesShort", asked: pagesAsked, made: pagesMade \}\);/.test(proc));
check("...after the pages are final, and before the row is written",
  proc.indexOf("const pagesAsked = readPageRequest(") > proc.indexOf("extraPages = keptPages.map(") && proc.indexOf("const pagesAsked = readPageRequest(") < proc.indexOf("generation_notes: notes.length > 0 ? notes : null"));
check("the first version keeps the whole site, so undo never loses pages",
  /version_number: FIRST_VERSION_NUMBER,\s*html_content: htmlContent,\s*pages: extraPages\.length > 0 \? extraPages : null,/.test(proc));
const said = code("src/components/website-builder/use-generation-note-text.ts");
check("it is said through the shared sentences", /case "pagesShort":\s*return t\("notes\.pagesShort", \{ asked: note\.asked, made: note\.made \}\);/.test(said));

// ---------------------------------------------------------------------
console.log("\n== 3. undo ==");
// ---------------------------------------------------------------------
const row = (n, minute, said = null) => ({ id: `v${n}`, created_at: `2026-10-07T10:${String(minute).padStart(2, "0")}:00Z`, version_number: n, change_description: said });
const mark = (target) => `${undo.UNDO_MARK} ${target}`;
check("a site as first made has nothing to undo", undo.undoTarget([row(1, 0)]) === null && undo.undoTarget([]) === null);
let u = undo.undoTarget([row(1, 0), row(2, 1, "κόκκινο κουμπί")]);
check("after one change, undo restores the site as made", u?.restore.id === "v1" && u?.undoes.id === "v2");
u = undo.undoTarget([row(1, 0), row(2, 1, "a"), row(3, 2, "b"), row(4, 3, mark("b"))]);
check("undo twice goes back two changes — it never redoes", u?.restore.id === "v1" && u?.undoes.id === "v2");
check("...and after undoing everything there is nothing more", undo.undoTarget([row(1, 0), row(2, 1, "a"), row(3, 2, mark("a"))]) === null);
u = undo.undoTarget([row(1, 0), row(2, 1, "a"), row(3, 2, mark("a")), row(4, 3, "c")]);
check("a change made after an undo is undone in its turn, back to the state the undo left", u?.restore.id === "v1" && u?.undoes.id === "v4");
u = undo.undoTarget([row(3, 2, "b"), row(1, 0), row(2, 1, "a")]);
check("the history is read in the order it happened, whatever order it arrives in", u?.restore.id === "v2" && u?.undoes.id === "v3");
check("the undo row says what it took back", undo.undoDescription(row(2, 1, "κόκκινο κουμπί")) === "[undo] κόκκινο κουμπί" && undo.undoDescription(row(7, 1)) === "[undo] v7");

const route = code("src/app/api/websites/[id]/undo/route.ts");
check("the route is behind the switch", /if \(!\(await isFeatureOn\("site-pages", user\)\)\) return fail\("not_enabled", 403\);/.test(route));
check("...only the owner's site, history and version are read", (route.match(/\.eq\("user_id", user\.id\)/g) ?? []).length === 4);
check("...a site being made or changed is refused", /if \(site\.status !== "completed"\) return fail\("busy", 409\);/.test(route));
check("...nothing to undo is said", /if \(!target\) return fail\("nothing_to_undo", 409\);/.test(route));
check("...the home page and the pages come back together, written by the server as every site write is",
  /createAdminClient\(\)\s*\.from\("user_websites"\)\s*\.update\(\{ html_content: restore\.html_content, pages \}\)/.test(route));
check("...never in the middle of an edit: the edit's own lock is respected",
  /\.or\(`editing_started_at\.is\.null,editing_started_at\.lt\.\$\{staleClaimCutoff\}`\)/.test(route) && /if \(!record\) return fail\("busy", 409\);/.test(route));
check("...one more version row records it; nothing is deleted",
  /change_description: undoDescription\(target\.undoes\),/.test(route) && /version_number: highest \+ 1,/.test(route) && !/\.delete\(/.test(route));
check("...free: no hold, no charge", !/reserveCredits|settleReservation|deductCredits/.test(route));
check("...and answers in codes, never sentences", !/error: "/.test(route) && /return NextResponse\.json\(\{ ok: false, code \}, \{ status \}\);/.test(route));

// ---------------------------------------------------------------------
console.log("\n== 4. the download ==");
// ---------------------------------------------------------------------
// An independent reader: the local headers, walked by hand.
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = [];
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength + extra, at + 30 + nameLength + extra + size);
    files.push({ name, crc, data: new TextDecoder().decode(data), crcOk: nodeCrc32(data) === crc });
    at += 30 + nameLength + extra + size;
  }
  const end = bytes.length - 22;
  return { files, endOk: view.getUint32(end, true) === 0x06054b50 && view.getUint16(end + 10, true) === files.length };
}
const enc = (s) => new TextEncoder().encode(s);
check("the CRC is the standard one", zip.crc32(enc("123456789")) === 0xcbf43926 && zip.crc32(enc("")) === 0);
const archive = readZip(zip.zipStore([{ name: "index.html", data: enc("<p>αρχική</p>") }, { name: "σελίδα.html", data: enc("x") }]));
check("the archive reads back: names (UTF-8), contents, checksums, the end record",
  archive.files.length === 2 && archive.files[0].data === "<p>αρχική</p>" && archive.files[1].name === "σελίδα.html" && archive.files.every((f) => f.crcOk) && archive.endOk);

const doc = (body) => `<!DOCTYPE html><html><head><title>t</title></head><body>${body}</body></html>`;
const nav = '<nav><a href=".">Αρχική</a><a href="services">Υπηρεσίες</a><a href="about#team">Εμείς</a><a href="https://maps.google.com/x">Χάρτης</a><a href="#top">Πάνω</a><a href="tel:+30210">Τηλ</a></nav>';
const one = dl.siteDownload({ name: "Αύρα", html_content: doc("<p>μόνο</p>"), pages: null });
check("one page is one .html, as before", one.filename === "Αύρα.html" && one.type.startsWith("text/html") && new TextDecoder().decode(one.data).includes("μόνο"));
const site = dl.siteDownload({
  name: "Αύρα / Νάξος",
  html_content: doc(nav),
  pages: [{ slug: "services", label: "Υπηρεσίες", html: doc(nav + "<p>s</p>") }, { slug: "about", label: "Εμείς", html: doc(nav + "<p>a</p>") }],
});
const files = readZip(site.data).files;
check("a site with pages is a .zip named after it, safely", site.filename === "Αύρα Νάξος.zip" && site.type === "application/zip");
check("...index.html and one file per page", files.map((f) => f.name).join(",") === "index.html,services.html,about.html");
const home = files[0]?.data ?? "";
check("...whose links to each other are the files", /href="index\.html"/.test(home) && /href="services\.html"/.test(home) && /href="about\.html#team"/.test(home));
check("...and every other link is left as it was", home.includes('href="https://maps.google.com/x"') && home.includes('href="#top"') && home.includes('href="tel:+30210"'));
check("...on every page", files.every((f) => /href="services\.html"/.test(f.data)));

// ---------------------------------------------------------------------
console.log("\n== 5. the shell ==");
// ---------------------------------------------------------------------
check('"site-pages" is declared as a switch', /\n  "site-pages": "/.test(code("src/lib/flags/flags.ts")));
check("the Site page reads it for the shell", /<WebsiteShell [^>]*pages=\{await isFeatureOn\("site-pages", user\)\} \/>/.test(code("src/app/dashboard/website-builder/page.tsx")));
const shell = code("src/components/website-builder/website-shell.tsx");
check("a new site's brief carries the page request, only with the switch",
  /applyDesignBrief\(text\.slice\(0, MAX_DESCRIPTION_LENGTH\), \{ \.\.\.design, imageCount: 0 \}\) \+ \(pages \? pageRequestBrief\(pageCount\) : ""\)/.test(shell));
check("the fourth option offers «as many as needed», one, three, five", /\[null, \.\.\.PAGE_COUNT_CHOICES\]\.map\(\(n\) =>/.test(shell) && /data-testid="site-page-count"/.test(shell));
check("a site's pages are tabs over the preview", /\[\{ slug: "", label: t\("pageHome"\) \}, \.\.\.sitePages\]\.map\(\(p\) =>/.test(shell) && /onClick=\{\(\) => setOpenPage\(\{ siteId: current\.id, slug: p\.slug \}\)\}/.test(shell));
check("the preview and its parts are the open page's", /const html = pageSlug \? sitePages\.find\(\(p\) => p\.slug === pageSlug\)!\.html : current\?\.html_content \?\? "";/.test(shell) && /const boxes = useMemo\(\(\) => \(complete \? findPageBoxes\(html\) : \[\]\), \[complete, html\]\);/.test(shell));
check("a chosen part belongs to its page: another page forgets it", /box\.siteId === current\.id && box\.slug === pageSlug && box\.index < boxes\.length/.test(shell));
check("the change goes to the open page", /requestSiteChange\(\{ websiteId: current\.id, changeRequest: request, section: part, \.\.\.\(pages \? \{ pageSlug: slug \} : \{\}\) \}\)/.test(shell));
check("undo is a button on the site, with the switch", /\{pages && \(\s*<button[\s\S]{0,120}onClick=\{\(\) => void undo\(\)\}[\s\S]{0,300}data-testid="site-undo"/.test(shell));
check("...and what it says when there is nothing to undo", /outcome\.reason === "nothing" \? tShell\("pages\.nothingToUndo"\)/.test(shell));
check("the download is the whole site, with the switch", /const file = pages \? siteDownload\(site\) :/.test(shell));
check("what the code did is said beside the preview", /parseGenerationNotes\(current\.generation_notes\)/.test(shell) && /\{describeNote\(note\)\}/.test(shell));
check("the site is published at its own address from the shell", /<PublishControl websiteId=\{current\.id\} websiteName=\{current\.name\} disabled=\{current\.status !== "completed"\} \/>/.test(shell));
const requests = code("src/lib/website-builder/site-requests.ts");
check("the shared request carries the page", /pageSlug: input\.pageSlug \?\? "",/.test(requests));
check("...and undo is a shared request too", /fetchWithAuthRetry\(`\/api\/websites\/\$\{encodeURIComponent\(websiteId\)\}\/undo`, \{ method: "POST" \}\)/.test(requests));

// ---------------------------------------------------------------------
console.log("\n== 6. the words ==");
// ---------------------------------------------------------------------
const KEYS = ["auto", "count", "undo", "undone", "nothingToUndo"];
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
check(`the words to look for (${KEYS.length})`, KEYS.length >= 5);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard ?? {};
  const p = m.toolShell?.pages ?? {};
  const empty = KEYS.filter((k) => typeof p[k] !== "string" || !p[k].trim());
  const short = m.websiteBuilder?.notes?.pagesShort ?? "";
  check(`${file}: the words (${KEYS.length}), and the note with both numbers`, empty.length === 0 && /\{asked\}/.test(short) && /\{made\}/.test(short), empty.join(", "));
}
// A change held back or still running, in every language and not English
// in any other (scripts/check-i18n.js holds the copy rule for the rest).
const enSite = JSON.parse(readFileSync("messages/en.json", "utf8")).dashboard.toolShell.site;
for (const file of LOCALES) {
  const site = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.toolShell?.site ?? {};
  const own = ["held", "busy", "offTopic"].every((k) => typeof site[k] === "string" && site[k].trim() && (file === "en.json" || site[k] !== enSite[k]));
  check(`${file}: a change held back, one still running, and a brief that is not a website, in its own words`, own, JSON.stringify({ held: site.held, busy: site.busy, offTopic: site.offTopic }));
}

// ---------------------------------------------------------------------
console.log("\n== 7. failures in the reader's language ==");
// ---------------------------------------------------------------------
check("a refusal to make a site is said through the shared error sentences", /if \(outcome\.kind === "refused"\) \{\s*say\(\{ role: "tool", text: describe\(outcome\.error\)\.text \}\);/.test(shell));
check("...and so is a refused change, after its own four reasons",
  /outcome\.reason === "held"\s*\?\s*`\$\{tShell\("site\.held"\)\} \$\{tErrors\("credits\.notCharged"\)\}`\s*:\s*outcome\.reason === "busy"\s*\?\s*`\$\{tShell\("site\.busy"\)\} \$\{tErrors\("credits\.notCharged"\)\}`\s*:\s*describe\(outcome\.error\)\.text/.test(shell));
check("no server sentence reaches the conversation: not error_message, not getErrorMessage", !/\berror_message\b/.test(shell) && !/getErrorMessage/.test(shell));
check("a site that was not made is said from its status and notes", /say\(\{ role: "tool", text: failedText\(record\) \}\);/.test(shell) && /\{running\(current\) \? t\("generating"\) : failedText\(current\)\}/.test(shell));
check("...free only when no whole document was written; a stop says what it cost",
  /if \(stopped\) return describeNote\(stopped\);\s*const written = looksLikeCompleteHtmlDocument\(record\.html_content \?\? ""\);\s*return `\$\{t\("generateFailed"\)\} \$\{written \? tErrors\("credits\.unverified"\) : tErrors\("credits\.notCharged"\)\}`;/.test(shell));
check("a refusal carries the route's status and code", /if \(!res\.ok \|\| !data\?\.ok\) return \{ kind: "refused", error: new ApiError\(res\.status, data\) \};/.test(requests));
check("...a refusal answered 200 is one before any work: short credits, or a limit",
  /if \(data\.rateLimited\) return \{ kind: "refused", error: refusedBeforeWork\(data\) \};/.test(requests) && /new ApiError\(short \? 402 : 429, \{/.test(requests) && /const short = data\?\.code === "insufficientCredits";/.test(requests));
check("...and a change's refusal names a held change and a busy site",
  /: data\?\.flagged === true\s*\? "held"\s*: data\?\.busy === true\s*\? "busy"/.test(requests) && /const error = res\.ok && data\?\.ok && data\.rateLimited \? refusedBeforeWork\(data\) : new ApiError\(res\.status, data\);/.test(requests));
const generateRoute = code("src/app/api/websites/generate/route.ts");
check("making a site: both credit refusals carry the code", (generateRoute.match(/rateLimited: true,\s*code: "insufficientCredits",\s*message: insufficientCreditsMessage\(/g) ?? []).length === 2);
const editRoute = code("src/app/api/websites/edit/route.ts");
check("changing a site: both credit refusals carry the code",
  /rateLimited: true,\s*code: "insufficientCredits",\s*message: insufficientCreditsMessage\(check\.remaining, estimate\.reserveCredits\)/.test(editRoute) &&
    /\.\.\.\(reservation\.reason === "insufficient" \? \{ code: "insufficientCredits" \} : \{\}\)/.test(editRoute));
check("...a site already being changed says so", /edited: false,\s*busy: true,/.test(editRoute));
check("a brief that is not a website is said in the reader's words, not the classifier's",
  /say\(\{ role: "tool", text: outcome\.offTopic \? tShell\("site\.offTopic"\) : t\("generateFailed"\) \}\);/.test(shell) &&
    /offTopic: data\.offTopic === true/.test(requests) && /generated: false, offTopic: true, message: classification\.message/.test(generateRoute));
check("...a provider failure is named, and says the hold went back", /code: "upstreamUnavailable",\s*\.\.\.\(reservationId \? \{ creditsRefunded: true \} : \{\}\),/.test(editRoute));
const publishControl = code("src/components/publishing/publish-control.tsx");
const liveList = code("src/components/publishing/published-sites-list.tsx");
const REFUSAL = /if \(data\?\.limitReached === true\) return t\("limitReached"\);\s*if \(data\?\.upgradeRequired === true\) return t\("paidOnly"\);\s*if \(data\?\.securityBlocked === true\) return t\("securityBlocked"\);\s*if \(status === 429\) return t\("tooManyToday"\);/;
check("a refused publish is said from what the route names: the plan's limit, paid plans only, the security scan, today's limit",
  REFUSAL.test(publishControl) && /addToast\(refusalText\(response\.status, data\), "error"\);/.test(publishControl) &&
    REFUSAL.test(liveList) && /addToast\(refusalText\(response\.status, data\), "error"\);/.test(liveList));
check("...and no publishing control shows the route's own sentence", ![publishControl, liveList].some((src) => /data\??\.error\b|getErrorMessage/.test(src)));
const PUBLISH_KEYS = ["limitReached", "paidOnly", "tooManyToday", "securityBlocked"];
const enPublishing = JSON.parse(readFileSync("messages/en.json", "utf8")).dashboard.publishing;
for (const file of LOCALES) {
  const pub = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.publishing ?? {};
  const missing = PUBLISH_KEYS.filter((k) => typeof pub[k] !== "string" || !pub[k].trim() || (file !== "en.json" && pub[k] === enPublishing[k]));
  check(`${file}: a refused publish in its own words (${PUBLISH_KEYS.length})`, missing.length === 0, missing.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
