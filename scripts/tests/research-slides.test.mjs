/*
 * RESEARCH WITH NUMBERED SOURCES THAT OPEN, SENT TO SLIDES WITH ONE PRESS
 * (MASTER 16, package 11), behind the switch "research-slides".
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. THE NUMBERS OPEN: each valid [n] its own link to its own source —
 *      "[1][2]" is two links, not one — a number with no source marked ⚠
 *      and never a link, [E3] left alone, only http(s) linked.
 *   2. THE BRIEF a deck is written from: the report's own words, its
 *      numbers kept, within a ceiling, said when cut.
 *   3. THE SOURCES SLIDES: written by code from the stored list, numbered
 *      as the report numbers them, inside the deck's bounds.
 *   4. THE ROUTE: the report by id and owner, behind the switch, only when
 *      finished, through the same estimate, hold and settlement.
 *   5. THE SCREEN: the numbers and the button on the Research shell and the
 *      Research page, the price before the press, the deck opened in Slides.
 *   6. The words, in ten languages.
 *
 * The rendered links, by react-markdown itself: research-slides.itest.mjs.
 * The same in a browser: research-slides.prodtest.mjs.
 *
 * Run: node scripts/tests/research-slides.test.mjs
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

const cited = await loadTs("src/lib/research/cited-markdown.ts");
const toSlides = await loadTs("src/lib/research/research-to-slides.ts");
const deck = await loadTs("src/lib/presentations/deck.ts");

console.log("research-slides");

// ---------------------------------------------------------------------
console.log("\n== 1. the numbers open ==");
// ---------------------------------------------------------------------
const SOURCES = [
  { title: "Eurostat: τουρισμός 2025", url: "https://ec.europa.eu/eurostat/tourism" },
  { title: 'Η "ΕΛΣΤΑΤ" για τα νησιά', url: "https://www.statistics.gr/islands" },
  { title: "Κάτι τοπικό", url: "javascript:alert(1)" },
];
let out = cited.linkCitations("Οι αφίξεις αυξήθηκαν 12% [1].", SOURCES);
check("a number becomes a link to its own source", out === 'Οι αφίξεις αυξήθηκαν 12% [\\[1\\]](<https://ec.europa.eu/eurostat/tourism> "Eurostat: τουρισμός 2025").', out);
out = cited.linkCitations("Δύο πηγές [1][2].", SOURCES);
check('"[1][2]" is two links, each to its own source', /\[\\\[1\\\]\]\(<https:\/\/ec\.europa\.eu\/eurostat\/tourism>[^)]*\)\[\\\[2\\\]\]\(<https:\/\/www\.statistics\.gr\/islands>/.test(out), out);
check("...and a quote in a title cannot end the link", out.includes('"Η \'ΕΛΣΤΑΤ\' για τα νησιά"'), out);
out = cited.linkCitations("Αριθμός χωρίς πηγή [9].", SOURCES);
check("a number past the list is marked, and is no link", out === "Αριθμός χωρίς πηγή [9]⚠.", out);
out = cited.linkCitations("Από τις σημειώσεις σου [E1].", SOURCES, 1);
check("the person's own entries are left as they are", out === "Από τις σημειώσεις σου [E1].", out);
out = cited.linkCitations("Κακή διεύθυνση [3].", SOURCES);
check("only http(s) addresses are linked", out === "Κακή διεύθυνση [3].", out);
out = cited.linkCitations("Ήδη σύνδεσμος [1](https://example.org).", SOURCES);
check("a link the text already wrote is left alone", out === "Ήδη σύνδεσμος [1](https://example.org).", out);

// ---------------------------------------------------------------------
console.log("\n== 2. the brief ==");
// ---------------------------------------------------------------------
const report = {
  topic: "Ο τουρισμός στη Νάξο",
  sections: [{ heading: "Αφίξεις", body: "Αυξήθηκαν 12% [1]." }, { heading: "Κατάλυμα", body: "Λείπουν κλίνες [2]." }, { heading: "κενό", body: "  " }],
  sources: [...SOURCES, { url: 5 }, "x"],
};
const made = toSlides.researchBrief(report);
check("the brief carries the topic and the report's own words", made && made.brief.includes("«Ο τουρισμός στη Νάξο»") && made.brief.includes("## Αφίξεις\nΑυξήθηκαν 12% [1].") && !made.brief.includes("## κενό"));
check("...asks for the numbers to stay and nothing to be added", made && /Keep the source number \[n\] after every claim/.test(made.brief) && /no figure, name or claim it does not contain/.test(made.brief));
check("...and tells the model the sources slides are not its job", made && /do not write a sources slide yourself/.test(made.brief));
check("the stored sources are read with only http(s) kept", made && made.sources.length === 2 && made.sources.every((s) => s.url.startsWith("https://")), JSON.stringify(made?.sources));
const long = toSlides.researchBrief({ topic: "x", sections: [{ heading: "", body: "λ".repeat(40_000) }], sources: [] });
check(`a long report is cut to ${toSlides.RESEARCH_BRIEF_CHARS} characters, and the cut is said`, long && long.cut && long.brief.length <= toSlides.RESEARCH_BRIEF_CHARS && /The report continues/.test(long.brief), String(long?.brief.length));
check("a report with nothing in it is not a brief", toSlides.researchBrief({ topic: "x", sections: [], sources: [] }) === null && toSlides.researchBrief({ topic: "x", sections: "?", sources: [] }) === null);

// ---------------------------------------------------------------------
console.log("\n== 3. the sources slides ==");
// ---------------------------------------------------------------------
const base = { version: 1, title: "Νάξος", locale: "el", imageSource: "none", slides: Array.from({ length: 8 }, (_, i) => ({ layout: "bullets", title: `Σ${i}`, bullets: ["x"], notes: "", imageQuery: null, image: null })) };
const many = Array.from({ length: 14 }, (_, i) => ({ title: `Πηγή ${i + 1}`, url: `https://www.example${i + 1}.gr/page` }));
let withSources = toSlides.withSourcesSlides(base, many);
const added = withSources.slides.slice(8);
check("fourteen sources are three slides, six to a slide", added.length === 3 && added[0].bullets.length === deck.MAX_BULLETS && added[2].bullets.length === 2);
check("...titled in the deck's language, and counted", added[0].title === "Πηγές (1/3)" && added[2].title === "Πηγές (3/3)");
check("...numbered as the report numbers them, across slides", added[1].bullets[0] === "[7] Πηγή 7 — example7.gr" && added[2].bullets[1] === "[14] Πηγή 14 — example14.gr", added[1].bullets[0]);
check("...the full addresses in the notes", added[0].notes.split("\n")[0] === "[1] https://www.example1.gr/page");
check("...and nothing past the deck's bounds", withSources.slides.every((s) => s.bullets.every((b) => b.length <= deck.MAX_BULLET_CHARS) && s.notes.length <= deck.MAX_NOTES_CHARS && s.title.length <= deck.MAX_TITLE_CHARS));
const full = { ...base, slides: Array.from({ length: deck.MAX_SLIDES - 1 }, () => base.slides[0]) };
withSources = toSlides.withSourcesSlides(full, many);
check("with room for one slide, one is added and says how many it could not hold",
  withSources.slides.length === deck.MAX_SLIDES && withSources.slides.at(-1).title === "Πηγές" && withSources.slides.at(-1).notes.endsWith("+8"));
check("no sources, no slide", toSlides.withSourcesSlides(base, []).slides.length === 8);
check("another language, its own word", toSlides.withSourcesSlides({ ...base, locale: "de" }, many.slice(0, 2)).slides.at(-1).title === "Quellen");

// ---------------------------------------------------------------------
console.log("\n== 4. the route ==");
// ---------------------------------------------------------------------
const route = code("src/app/api/presentations/generate/route.ts");
check('"research-slides" is declared as a switch', /\n  "research-slides": "/.test(code("src/lib/flags/flags.ts")));
check("a report id is checked before anybody is read", route.indexOf('error: "bad_research"') > 0 && route.indexOf('error: "bad_research"') < route.indexOf("await supabase.auth.getUser()"));
check("...and a typed description is still held to the field's limits", /if \(researchId === null\) \{\s*const verdict = checkDeckDescription\(description\);/.test(route));
check("the report is read only with the switch on", /if \(!\(await isFeatureOn\("research-slides", user\)\)\) return NextResponse\.json\(\{ error: "not_enabled" \}, \{ status: 403 \}\);/.test(route));
check("...by id AND owner", /\.from\("research_reports"\)\s*\.select\("id, topic, status, sections, sources"\)\s*\.eq\("id", researchId\)\s*\.eq\("user_id", user\.id\)/.test(route));
check("...only when it is finished", /const made = report\.status === "ready" \? researchBrief\(/.test(route) && /if \(!made\) return NextResponse\.json\(\{ error: "research_not_ready" \}, \{ status: 409 \}\);/.test(route));
const plan = route.indexOf('accountHasCapability(await resolveEffectivePlanSlug(user), "presentations"');
const read = route.indexOf('.from("research_reports")');
const hold = route.indexOf("await reserveCredits(");
check("...after the plan gate and before the hold, so it is estimated and held as a description is", plan > 0 && read > plan && hold > read && /inputChars: deckEstimateInputChars\(description\.length \+ businessContext\.length( \+ deckChartsChars\(charts\))?, slideCount\)/.test(route));
check("room is left for the sources slides", /slideCount = Math\.max\(MIN_SLIDES, Math\.min\(slideCount, MAX_SLIDES - Math\.ceil\(reportSources\.length \/ MAX_BULLETS\)\)\);/.test(route));
check("the sources slides come from the stored list, after the model", /let deck: Deck = withSourcesSlides\(outcome\.deck, reportSources\);/.test(route));

// ---------------------------------------------------------------------
console.log("\n== 5. the screen ==");
// ---------------------------------------------------------------------
const page = code("src/app/dashboard/deep-research/page.tsx");
check("the Research page reads the switch for both screens", (page.match(/slides=\{await isFeatureOn\("research-slides", user\)\}/g) ?? []).length === 2);
for (const [file, label] of [["src/components/research/research-shell.tsx", "shell"], ["src/components/research/research-workspace.tsx", "page"]]) {
  const src = code(file);
  check(`${label}: the numbers open, with the switch`, /\{slides \? \(\s*<CitedBody body=\{section\.body\} sources=\{open\.sources \?\? \[\]\}/.test(src));
  check(`${label}: the report goes to Slides with one press, with the switch`, /\{slides && (\(\s*)?<SendToSlides\s+report=\{open\}/.test(src));
}
const send = code("src/components/research/send-to-slides.tsx");
check("the price is on the button before it is pressed, from the server's estimator on the server's brief",
  /useCostEstimate\("presentationGenerate", \{ inputChars: deckEstimateInputChars\(brief\?\.brief\.length \?\? 0, DEFAULT_SLIDES\) \}\)/.test(send) && /t\("price", \{ count: estimate\.credits \}\)/.test(send));
check("...a large one asks once more", /if \(estimate\.needsConfirmation && state !== "confirm"\) \{\s*setState\("confirm"\);\s*return;/.test(send));
check("the report goes by its id", /body: JSON\.stringify\(\{ researchId: report\.id,/.test(send) && !/description:/.test(send));
check("the deck opens in Slides", /router\.push\(`\/dashboard\/presentations\?record=\$\{encodeURIComponent\(String\(body\.id\)\)\}`\)/.test(send));
check("every refusal is said", /setError\(refusal\(String\(body\?\.error \?\? ""\)\)\)/.test(send) && /setError\(t\("offline"\)\)/.test(send));
check("the numbers are rendered by the renderer that opens links in a new tab", /<MessageContent content=\{linkCitations\(body, sources\)\}/.test(code("src/components/research/cited-body.tsx")) &&
  /target="_blank"\s*rel="noopener noreferrer"/.test(code("src/components/chat/message-content.tsx")));

// ---------------------------------------------------------------------
console.log("\n== 6. the words ==");
// ---------------------------------------------------------------------
const KEYS = ["send", "price", "confirm", "cancel", "working", "notReady", "offline"];
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
check(`the words to look for (${KEYS.length})`, KEYS.length >= 7);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.deepResearch?.toSlides ?? {};
  const empty = KEYS.filter((k) => typeof m[k] !== "string" || !m[k].trim());
  check(`${file}: the words (${KEYS.length})`, empty.length === 0 && /\{count/.test(m.price ?? "") && /\{count/.test(m.confirm ?? ""), empty.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
