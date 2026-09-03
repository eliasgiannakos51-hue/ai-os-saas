// "DO NOT PUT X" IS ENFORCED IN CODE, AND SO IS THE PAGE CAP, AND SO IS
// THE MAP ZOOM — V4.6.
//
// Three instructions that were only ever ASKED of the model, and three
// real sites where the model did as it pleased: "μη βάλεις online
// κράτηση" produced a booking form; MAX_PAGES_PER_SITE = 5 produced seven
// pages (two stored nowhere, both still in the menu, all seven paid for);
// "a Google Maps pin" produced a map of a district. Each is now enforced
// after generation (lib/website-negative-instructions.ts,
// lib/website-map-embeds.ts, lib/publishing/website-pages.ts) and the
// owner is told what was done (lib/website-generation-notes.ts).
//
// Sections 1–4 run the REAL functions on real briefs and real markup —
// ten languages, zh-Hans and ar included, and every numeric argument at
// 0 · 1 · -1 · max · NaN · Infinity · undefined. Sections 5–6 read the
// worker and the workspace for the wiring, with comments stripped so a
// sentence cannot satisfy a check meant for code.
//
// Run: node scripts/tests/website-negatives.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + String(detail).slice(0, 300) : ""}`); }
}
const read = (p) => stripComments(readFileSync(p, "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const LIB = "src/lib/website-negative-instructions.ts";
const MAPS = "src/lib/website-map-embeds.ts";
const NOTES = "src/lib/website-generation-notes.ts";
const PAGES = "src/lib/publishing/website-pages.ts";
const BUILDER = "src/lib/website-builder.ts";
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";
const SCAN = "src/lib/website-html-security-scan.ts";
const MIGRATION = "supabase/migrations/20260925000000_website_generation_notes.sql";
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

const neg = await loadTs(LIB);
const maps = await loadTs(MAPS);
const notes = await loadTs(NOTES);
const pages = await loadTs(PAGES);
const scan = await loadTs(SCAN);
const design = await loadTs("src/lib/website-design-brief.ts");
const CAP = pages.MAX_PAGES_PER_SITE;
const forbidden = (brief) => neg.forbiddenFeatures(neg.parseNegativeInstructions(brief)).sort();

console.log("== 1. reading the brief — ten languages, zh-Hans and ar included ==");
{
  // Each brief forbids exactly two features, in the negative forms the
  // product's users actually type. The one that started this is first.
  const BRIEFS = {
    el: ["Ζαχαροπλαστείο στο Χαλάνδρι. Θέλω σελίδες για προϊόντα και επικοινωνία. Μη βάλεις online κράτηση. Θέλω χάρτη, χωρίς newsletter.", ["booking", "newsletter"]],
    en: ["A bakery in Athens. No online booking please, and don't add a chat widget.", ["booking", "chatWidget"]],
    es: ["Panadería en Madrid, sin reservas online y sin mapa.", ["booking", "map"]],
    fr: ["Boulangerie à Lyon, sans réservation en ligne, pas de newsletter.", ["booking", "newsletter"]],
    de: ["Bäckerei in Berlin ohne Buchung, keine Preise.", ["booking", "prices"]],
    it: ["Panetteria a Roma senza prenotazioni e senza galleria.", ["booking", "gallery"]],
    pt: ["Padaria em Lisboa sem reservas online e sem formulário de contacto.", ["booking", "contactForm"]],
    zh: ["雅典的面包店。不要在线预订，不需要博客。", ["blog", "booking"]],
    ja: ["アテネのパン屋。予約は不要、チャットなし。", ["booking", "chatWidget"]],
    ar: ["مخبز في أثينا. بدون حجز عبر الإنترنت، من دون خريطة.", ["booking", "map"]],
  };
  for (const [l, [brief, expected]] of Object.entries(BRIEFS)) {
    const got = forbidden(brief);
    check(`${l}: the brief forbids exactly ${expected.join(" + ")}`, same(got, [...expected].sort()), JSON.stringify(got));
  }
  // The exact sentence from the bug report, on its own.
  const el = neg.parseNegativeInstructions("Μη βάλεις online κράτηση.");
  check("el: 'Μη βάλεις online κράτηση' is read as a prohibition of booking (the \\b-on-Greek bug)",
    el.length === 1 && el[0].features.includes("booking") && el[0].phrase === "Μη βάλεις online κράτηση", JSON.stringify(el));
  check("el: 'χωρίς newsletter' alone is read", same(forbidden("χωρίς newsletter"), ["newsletter"]));
  // One clause, two features.
  check("one clause can forbid two features: 'sin reservas y sin mapa'", same(forbidden("sin reservas online y sin mapa"), ["booking", "map"]));
  check("one clause can forbid two features: 'don't add a chat widget and skip the blog'", same(forbidden("don't add a chat widget and skip the blog"), ["blog", "chatWidget"]));
  // The turn of a sentence ends X.
  check("adversative: 'No booking but keep the map' forbids booking only", same(forbidden("No booking but keep the map please."), ["booking"]));
  check("adversative: 'χωρίς κράτηση αλλά με χάρτη' forbids booking only", same(forbidden("Θέλω site χωρίς κράτηση αλλά με χάρτη."), ["booking"]));
  // Positives are not negatives.
  for (const positive of [
    "Ζαχαροπλαστείο με online κράτηση και χάρτη. Κάνουμε κρατήσεις.",
    "A bakery with online booking and a map. Piano bar on Fridays.",
    "Tienda con reservas online y mapa.",
    "有在线预订和地图的面包店。",
    "مخبز مع حجز عبر الإنترنت وخريطة.",
  ]) check(`a positive brief forbids nothing: "${positive.slice(0, 40)}…"`, same(forbidden(positive), []), JSON.stringify(neg.parseNegativeInstructions(positive)));
  // Our own design-brief block is not the owner's words.
  const withDesign = `Bakery in Athens.${design.buildDesignBrief({ ...design.DEFAULT_DESIGN_CHOICES, photoSource: "none", logo: "wordmark" })}\n- no newsletter (a line our own code might one day write)`;
  check("only the owner's words are read: a prohibition after the design-brief header is ignored", same(forbidden(withDesign), []), JSON.stringify(neg.parseNegativeInstructions(withDesign)));
  check("...and ownWordsOf returns the part before the header", neg.ownWordsOf(withDesign) === "Bakery in Athens.");
  check("an unknown X is reported with no features, not dropped", (() => { const r = neg.parseNegativeInstructions("no parking on site"); return r.length === 1 && r[0].features.length === 0; })());
  check("the same clause twice is one instruction", neg.parseNegativeInstructions("no booking. No booking.").length === 1);
  for (const bad of [undefined, null, 123, "", {}, []]) {
    check(`parseNegativeInstructions(${JSON.stringify(bad) ?? "undefined"}) is []`, same(neg.parseNegativeInstructions(bad), []));
  }
  check("forbiddenFeatures tolerates garbage", same(neg.forbiddenFeatures([{ phrase: "x" }, null, 3]), []) && same(neg.forbiddenFeatures(undefined), []));
  check("negativeInstructionBlock names every forbidden feature for the model, and nothing when there is none",
    neg.negativeInstructionBlock(neg.parseNegativeInstructions(BRIEFS.el[0])).includes("online booking") &&
    neg.negativeInstructionBlock(neg.parseNegativeInstructions(BRIEFS.el[0])).includes("newsletter") &&
    neg.negativeInstructionBlock([]) === "");
}

console.log("\n== 2. enforcing on markup ==");
const SITE = `<!doctype html><html lang="el"><head><title>Ζαχαροπλαστείο</title></head><body><div class="page">
<header><nav><ul><li><a href=".">Αρχική</a></li><li><a href="products">Προϊόντα</a></li><li><a href="#">Blog</a></li><li><a href="booking">Κράτηση</a></li></ul></nav></header>
<main>
<section id="hero"><h1>Ζαχαροπλαστείο</h1><p>Καλώς ήρθατε. Κάνουμε κρατήσεις για εκδηλώσεις.</p><a class="btn" href="booking">Κάντε κράτηση</a></section>
<section id="booking"><h2>Online κράτηση</h2><form action="/api/forms/x"><input name="date"><button>Κράτηση</button></form></section>
<section id="map"><h2>Πού είμαστε</h2><iframe src="https://www.google.com/maps?q=Ανδρέα+Παπανδρέου+12,+Χαλάνδρι&amp;output=embed"></iframe></section>
<section id="newsletter"><h2>Ενημερωτικό δελτίο</h2><form><input type="email"><button>Εγγραφείτε</button></form></section>
</main>
<footer><p>© 2026</p></footer></div></body></html>`;
{
  const negatives = neg.parseNegativeInstructions("Μη βάλεις online κράτηση. Θέλω χάρτη, χωρίς newsletter.");
  const out = neg.enforceNegativeInstructions(SITE, negatives);
  const removed = Object.fromEntries(out.removed.map((r) => [r.feature, r.count]));
  check("the booking section, its form, the hero button and the nav link are gone", !/κράτηση|booking/i.test(out.html), out.html.match(/[^\n]*(?:κράτηση|booking)[^\n]*/i)?.[0]);
  check("...counted: booking removed as 4 elements (section, nav link, hero link, the section's own form is inside it)", removed.booking === 4, JSON.stringify(out.removed));
  check("the newsletter section is gone", !/newsletter|Εγγραφείτε/i.test(out.html));
  check("the map — asked for, not forbidden — is kept", /google\.com\/maps/.test(out.html));
  check("the hero, the products link and the footer survive", /id="hero"/.test(out.html) && /href="products"/.test(out.html) && /© 2026/.test(out.html));
  check("the page wrapper <div class=\"page\"> that CONTAINS the booking is not removed", /<div class="page">/.test(out.html) && /<\/div><\/body>/.test(out.html));
  check("a paragraph that merely MENTIONS reservations (plural, 'κρατήσεις') is not a booking feature and survives", /Κάνουμε κρατήσεις για εκδηλώσεις/.test(out.html));
  check("...while the plural IS recognised where it names the feature: 'χωρίς κρατήσεις'", same(forbidden("Καφετέρια χωρίς κρατήσεις."), ["booking"]));
  check("idempotent: enforcing again removes nothing", same(neg.enforceNegativeInstructions(out.html, negatives).removed, []));
  check("no negatives: the document is returned byte-identical", neg.enforceNegativeInstructions(SITE, []).html === SITE);
  check("an unknown-feature negative removes nothing", neg.enforceNegativeInstructions(SITE, neg.parseNegativeInstructions("no parking")).html === SITE);
  for (const bad of [undefined, null, "", 7]) {
    const r = neg.enforceNegativeInstructions(bad, negatives);
    check(`enforceNegativeInstructions(${String(bad)}) returns a string and nothing removed`, typeof r.html === "string" && same(r.removed, []));
  }
  // A whole page that IS the feature.
  check("featureOfPage: slug 'booking' is the booking feature", neg.featureOfPage("booking", "Κράτηση", ["booking"]) === "booking");
  check("featureOfPage: a Greek label alone is enough", neg.featureOfPage("krathsh", "Κράτηση", ["booking"]) === "booking");
  check("featureOfPage: an 'about' page is nothing", neg.featureOfPage("about", "Σχετικά", ["booking", "map"]) === null);
  check("featureOfPage: nothing forbidden, nothing found", neg.featureOfPage("booking", "Booking", []) === null);
  // Dead nav entries.
  const pruned = neg.pruneDeadNavLinks(out.html);
  check("pruneDeadNavLinks drops the '#' Blog entry link-safety left behind", pruned.pruned === 1 && !/>Blog</.test(pruned.html), JSON.stringify(pruned.pruned));
  check("...but keeps a '#' home link on a one-page site", neg.pruneDeadNavLinks('<nav><a href="#">Home</a><a href="#">Αρχική</a><a href="#">Prices</a></nav>').pruned === 1);
  check("pruneDeadNavLinks(undefined) is safe", same(neg.pruneDeadNavLinks(undefined), { html: "", pruned: 0 }));
  // The security scan still passes what the enforcer leaves.
  const issues = scan.scanWebsiteHtmlForSecurityIssues(maps.normaliseMapEmbeds(pruned.html).html, {});
  check("what is left (with the map re-zoomed) passes the static security scan with no iframe issue", !issues.some((i) => i.type === "external_iframe"), JSON.stringify(issues));
}

console.log("\n== 3. the page cap, enforced where the tokens are spent ==");
{
  const doc = (i) => `<!--IONEXA:PAGE slug="p${i}" label="Page ${i}"-->\n<!DOCTYPE html><html><head><title>${i}</title></head><body>${i}</body></html>\n`;
  const seven = Array.from({ length: 7 }, (_, i) => doc(i)).join("");
  const five = Array.from({ length: 5 }, (_, i) => doc(i)).join("");
  check(`countPageMarkers counts ${7}`, neg.countPageMarkers(seven) === 7);
  check(`pageCapReached: cap ${CAP} with exactly ${CAP} markers is NOT reached (the cap-th page is allowed)`, neg.pageCapReached(five, CAP) === false);
  check(`pageCapReached: cap ${CAP} with ${CAP + 1} markers IS reached`, neg.pageCapReached(five + doc(5), CAP) === true);
  const cut = neg.truncateAtPageCap(seven, CAP);
  check(`truncateAtPageCap keeps exactly ${CAP} markers`, neg.countPageMarkers(cut) === CAP, neg.countPageMarkers(cut));
  check("...and is a byte-identical prefix of the stream, ending where page cap+1 begins", seven.startsWith(cut) && seven.slice(cut.length).startsWith(`<!--IONEXA:PAGE slug="p${CAP}"`));
  check("truncateAtPageCap leaves a stream within the cap untouched", neg.truncateAtPageCap(five, CAP) === five);
  for (const [max, reached, keepsAll] of [[0, false, true], [1, true, false], [-1, false, true], [NaN, false, true], [Infinity, false, true], [undefined, false, true]]) {
    check(`max=${String(max)}: reached=${reached}, untouched=${keepsAll}`, neg.pageCapReached(seven, max) === reached && (neg.truncateAtPageCap(seven, max) === seven) === keepsAll);
  }
  check("truncateAtPageCap(undefined) is ''", neg.truncateAtPageCap(undefined, CAP) === "");
  // The second line of defence: pages past the cap are dropped AND named.
  const entries = Array.from({ length: 6 }, (_, i) => ({ slug: `page-${i}`, label: `P${i}`, html: "<html>x</html>" }));
  const norm = pages.normalisePages(entries);
  check(`normalisePages keeps ${CAP - 1} sub-pages of 6`, norm.pages.length === CAP - 1, norm.pages.length);
  check(`...and NAMES the ${6 - (CAP - 1)} beyond the cap in dropped, instead of breaking silently`,
    norm.dropped.length === 6 - (CAP - 1) && norm.dropped.every((d) => d.includes(`beyond the cap of ${CAP}`)), JSON.stringify(norm.dropped));
  // The builder: abort at the marker of page cap+1, record, cut, no more rounds.
  const builder = read(BUILDER);
  check("the stream accepts a page cap and a callback", /pageCap\?: number,\s*onPageCap\?: \(cap: number, started: number\) => void\s*\): Promise<\{ rawText: string; stopReason: string \| null \}>/.test(builder));
  check("on each delta the marker window is checked and the stream is ABORTED when the cap is reached",
    /if \(pageCapReached\(full, pageCap\)\) \{\s*capReached = true;\s*stream\.abort\(\);\s*\}/.test(builder));
  check("...only when a marker was just completed — not a full scan per delta", /const tail = full\.slice\(-\(delta\.length \+ 200\)\);\s*if \(!\/IONEXA:PAGE\[\^>\]\*-->\/i\.test\(tail\)\) return;/.test(builder));
  check("a cap abort is not treated as an error", /if \(!stoppedByOwner && !capReached\) throw err;/.test(builder));
  const recordAt = builder.indexOf("partialUsage(snapshot, outputTokens), stream.currentMessage?.model || MODEL)");
  const cutAt = builder.indexOf('return { rawText: truncateAtPageCap(full, cap).trim(), stopReason: "page_cap" };');
  check("the partial usage is recorded BEFORE the cut text is returned", recordAt !== -1 && cutAt !== -1 && recordAt < cutAt);
  check("the caller is told how many pages were started", /onPageCap\?\.\(cap, Math\.max\(cap \+ 1, countPageMarkersOf\(full\)\)\);/.test(builder));
  check("a 'page_cap' round ends the loop: the return is inside the catch, before any continuation", cutAt < builder.indexOf("if (looksLikeCompleteHtmlDocument(extractHtmlDocument(combined))) break;"));
  check("generateWebsiteHtml passes THE SAME cap the store enforces (MAX_PAGES_PER_SITE), not a literal", /WEB_SEARCH_TOOL,\s*shouldStop,\s*MAX_PAGES_PER_SITE,\s*onPageCap\s*\)/.test(builder) && /import \{ MAX_PAGES_PER_SITE \} from "@\/lib\/publishing\/website-pages";/.test(builder));
}

console.log("\n== 4. the map zoom ==");
{
  const q = "https://www.google.com/maps?q=Ανδρέα+Παπανδρέου+12,+Χαλάνδρι";
  const r = maps.normaliseMapUrl(q);
  check("a q= embed with no zoom gets z=17 and output=embed", r.changed && /[?&]z=17(&|$)/.test(r.url) && /output=embed/.test(r.url), r.url);
  check("z=12 (a district) becomes 17", /[?&]z=17(&|$)/.test(maps.normaliseMapUrl(q + "&z=12&output=embed").url));
  check("z=16 (a block) is accepted as is", /[?&]z=16(&|$)/.test(maps.normaliseMapUrl(q + "&z=16&output=embed").url));
  check("z=18 (a rooftop) is accepted as is", /[?&]z=18(&|$)/.test(maps.normaliseMapUrl(q + "&z=18&output=embed").url));
  check("the address query itself is preserved", decodeURIComponent(new URL(r.url).searchParams.get("q")) === "Ανδρέα Παπανδρέου 12, Χαλάνδρι");
  const pb = "https://www.google.com/maps/embed?pb=!1m18!1m12";
  check("a maps/embed?pb= blob is left alone and reported unfixable", same(maps.normaliseMapUrl(pb), { url: pb, changed: false, fixable: false }));
  check("a non-Google iframe is not touched", maps.normaliseMapUrl("https://www.youtube.com/embed/x").fixable === false);
  check("garbage is not thrown on", maps.normaliseMapUrl("not a url").fixable === false && maps.normaliseMapUrl("").fixable === false);
  const html = `<iframe src="${q}&amp;output=embed"></iframe><iframe src="${pb}"></iframe><iframe src="https://player.vimeo.com/video/1"></iframe>`;
  const n = maps.normaliseMapEmbeds(html);
  check("normaliseMapEmbeds rewrites the q= map, counts the pb= one as untouched, ignores vimeo", n.normalised === 1 && n.untouched === 1, JSON.stringify([n.normalised, n.untouched]));
  check("...writing & back as &amp; so the strict-HTML gates stay green", /z=17&amp;output=embed|output=embed&amp;z=17/.test(n.html) && !/[^&]&[a-z]+=/.test(n.html.replace(/&amp;/g, "")), n.html);
  check("idempotent", maps.normaliseMapEmbeds(n.html).normalised === 0 && maps.normaliseMapEmbeds(n.html).html === n.html);
  for (const bad of [undefined, null, ""]) check(`normaliseMapEmbeds(${String(bad)}) is safe`, same(maps.normaliseMapEmbeds(bad), { html: "", normalised: 0, untouched: 0 }));
  check("MAP_ZOOM is 17 and the floor is 16 — a building, per the request", maps.MAP_ZOOM === 17 && maps.MIN_ACCEPTABLE_MAP_ZOOM === 16);
  check("the security scan allows exactly the host the normaliser writes to", scan.ALLOWED_IFRAME_EMBEDS.some((e) => e.host === new URL(r.url).hostname && (!e.pathPrefix || new URL(r.url).pathname.startsWith(e.pathPrefix))));
  // The prompt section is a template literal, and "https://" inside it is
  // not a comment — so this reads the raw file and anchors on the
  // FUNCTIONAL_ELEMENTS_SECTION literal itself, not on a stripped copy.
  const section = readFileSync(BUILDER, "utf8").match(/const FUNCTIONAL_ELEMENTS_SECTION = `([\s\S]*?)`;/)?.[1] ?? "";
  check("the prompt asks for the q= form at z=17 and forbids the pb= blob (the belt)", /google\.com\/maps\?q=<address, URL-encoded>&z=17&output=embed/.test(section) && /never a maps\/embed\?pb= blob/.test(section), section.length);
}

console.log("\n== 5. the worker: enforced after generation, on every document, before the links ==");
{
  const proc = read(PROCESS);
  check("negatives are read from the description the worker actually has", /const negatives = parseNegativeInstructions\(description\);/.test(proc));
  check("a page that IS the feature is dropped whole, and noted", /const keptPages = split\.pages\.filter\(\(pg\) => \{\s*const feature = featureOfPage\(pg\.slug, pg\.label, forbidden\);\s*if \(!feature\) return true;\s*notes\.push\(\{ kind: "removedPage", feature, slug: pg\.slug \}\);\s*return false;/.test(proc));
  check("every document — home AND each kept page — goes through the enforcer", /\[split\.home, \.\.\.keptPages\.map\(\(pg\) => pg\.html\)\]\.map\(\(doc\) => \{\s*const enforced = enforceNegativeInstructions\(doc, negatives\);/.test(proc));
  check("...and the removals are counted into one note per feature", /notes\.push\(\{ kind: "removedFeature", feature, count \}\)/.test(proc));
  const enforceAt = proc.indexOf("enforceNegativeInstructions(doc, negatives)");
  const inventedAt = proc.indexOf("findInventedNumbers(doc, description)");
  const linksAt = proc.indexOf("makeGeneratedLinksSafe(doc, { pageSlugs: generatedSlugs })");
  const pruneAt = proc.indexOf("pruneDeadNavLinks(cleaned[i])");
  const mapsAt = proc.indexOf("normaliseMapEmbeds(pruned.html)");
  const scriptsAt = proc.indexOf("stripDisallowedExternalScripts(doc)");
  check("order: enforce → invented numbers → link-safety → prune dead nav → maps → security", [enforceAt, inventedAt, linksAt, pruneAt, mapsAt, scriptsAt].every((x, i, a) => x !== -1 && (i === 0 || a[i - 1] < x)), JSON.stringify([enforceAt, inventedAt, linksAt, pruneAt, mapsAt, scriptsAt]));
  check("link-safety is told the KEPT slugs, so a dropped page's link becomes '#' and is then pruned", /const generatedSlugs = keptPages\.map\(\(pg\) => pg\.slug\);/.test(proc));
  check("the prune+maps loop rewrites every document in place", /for \(let i = 0; i < cleaned\.length; i \+= 1\) \{\s*const pruned = pruneDeadNavLinks\(cleaned\[i\]\);\s*const maps = normaliseMapEmbeds\(pruned\.html\);\s*mapsNormalised \+= maps\.normalised;\s*cleaned\[i\] = maps\.html;\s*\}/.test(proc));
  check("a re-zoomed map is noted", /if \(mapsNormalised > 0\) notes\.push\(\{ kind: "mapZoom", count: mapsNormalised \}\);/.test(proc));
  check("the page cap callback writes its note", /\(cap, started\) => notes\.push\(\{ kind: "pageCap", cap, started \}\)/.test(proc));
  check("the notes are STORED on the row — null when empty", /generation_notes: notes\.length > 0 \? notes : null,/.test(proc));
  check("...in the same update that stores the pages", (() => { const i = proc.indexOf("generation_notes: notes.length"); return i !== -1 && proc.lastIndexOf("pages: extraPages.length > 0 ? extraPages : null,", i) > proc.lastIndexOf(".update({", i) - 1; })());
  check("the stored pages are the kept ones", /extraPages = keptPages\.map\(/.test(proc));
  const sql = readFileSync(MIGRATION, "utf8");
  check("the column exists, idempotently", /alter table public\.user_websites\s+add column if not exists generation_notes jsonb;/.test(sql));
  check("the row type carries it", /generation_notes\?: unknown;/.test(read("src/types/user-website.ts")));
}

console.log("\n== 6. the owner is told, in their language ==");
{
  const ws = read(WORKSPACE);
  check("the workspace parses the column through the shared reader", /parseGenerationNotes\(previewWebsite\.generation_notes\)/.test(ws));
  check("...only for the site as generated, not a rolled-back version", /previewWebsite && !viewingVersion \? parseGenerationNotes/.test(ws));
  check("a panel renders them whenever there is a note, behind no other condition", /\{generationNotes\.length > 0 && \(\s*<div\s+data-testid="website-generation-notes"/.test(ws));
  for (const kind of ["removedFeature", "removedPage", "pageCap", "mapZoom", "stopped"]) {
    check(`the ${kind} note is described through t("notes.${kind}")`, new RegExp(`case "${kind}":\\s*return t\\("notes\\.${kind}"`).test(ws));
  }
  check("the feature name comes from the locale too, never from the stored English label", /t\(`notes\.feature\.\$\{note\.feature\}`\)/.test(ws) && !/FEATURE_LABELS_EN/.test(ws));
  const FEATURES = ["booking", "contactForm", "newsletter", "map", "prices", "gallery", "testimonials", "blog", "social", "chatWidget"];
  const texts = {};
  for (const l of LOCALES) {
    const n = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard?.websiteBuilder?.notes ?? {};
    texts[l] = n;
    const keys = ["title", "removedFeature", "removedPage", "pageCap", "mapZoom", "stopped"];
    check(`${l}: notes.{${keys.join(",")}} and ten feature names exist`,
      keys.every((k) => typeof n[k] === "string" && n[k].length > 0) && FEATURES.every((f) => typeof n.feature?.[f] === "string" && n.feature[f].length > 0));
    check(`${l}: the sentences carry their arguments`, /\{feature\}/.test(n.removedFeature ?? "") && /\{count/.test(n.removedFeature ?? "") && /\{slug\}/.test(n.removedPage ?? "") && /\{cap\}/.test(n.pageCap ?? "") && /\{started\}/.test(n.pageCap ?? "") && /\{count/.test(n.mapZoom ?? ""));
  }
  check("el: the sentence is the one the owner asked for — 'Αφαίρεσα … όπως ζήτησες'", /^Αφαίρεσα \{feature\} όπως ζήτησες/.test(texts.el.removedFeature ?? "") && texts.el.feature?.booking === "την online κράτηση");
  check("no locale is an untranslated copy of en", LOCALES.filter((l) => l !== "en").every((l) => texts[l].removedFeature !== texts.en.removedFeature));
  // The reader.
  const parsed = notes.parseGenerationNotes([
    { kind: "removedFeature", feature: "booking", count: 4 },
    { kind: "removedPage", feature: "booking", slug: "booking" },
    { kind: "pageCap", cap: 5, started: 6 },
    { kind: "mapZoom", count: 1 },
    { kind: "stopped", credits: 0 },
    { kind: "removedFeature", feature: "booking", count: 0 },
    { kind: "stopped", credits: -3 },
    { kind: "removedFeature", feature: "dragons", count: 2 },
    { kind: "pageCap", cap: 5, started: 5 },
    { kind: "mapZoom", count: -1 },
    { kind: "mapZoom", count: NaN },
    { kind: "somethingElse" },
    null, 7, "x",
  ]);
  check("parseGenerationNotes keeps the five well-formed notes (a stop with 0 credits included) and drops ten malformed ones", parsed.length === 5 && parsed.map((n) => n.kind).join() === "removedFeature,removedPage,pageCap,mapZoom,stopped", JSON.stringify(parsed));
  const proc2 = read(PROCESS);
  check("a stop writes its own note beside the failed status, with the credits charged", /generation_notes: \[\.\.\.notes, \{ kind: "stopped", credits: settlement\.creditsCharged \}\],/.test(proc2));
  check("...and the workspace shows THAT, translated, in place of the English sentence", /stoppedNote \? describeNote\(stoppedNote\) : previewWebsite\.error_message/.test(read(WORKSPACE)));
  for (const bad of [undefined, null, "[]", {}, 0]) check(`parseGenerationNotes(${JSON.stringify(bad) ?? "undefined"}) is []`, same(notes.parseGenerationNotes(bad), []));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
