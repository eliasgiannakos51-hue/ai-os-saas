// ONE BOX, ONE CHANGE (docs/MASTER.md, package 4 of Μέρος 16): «σε Site
// και Slides πατάω ένα κουτί, γράφω τι να αλλάξει, και αλλάζει μόνο αυτό».
//
// Section 1 and 2 RUN the two halves that make "only this" true — the
// code that takes one slide, or one part of a page, out of what the model
// returned and puts it into what was stored. Each is fed a model answer
// that changed EVERYTHING, and the rest must come out identical to the
// stored copy. Section 3 holds the two routes to calling them, before any
// money is held, and section 4 the two shells to sending the box.
//
// Run: node scripts/tests/boxes.test.mjs
import { readFileSync } from "node:fs";
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
const read = (f) => stripComments(readFileSync(f, "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("== 1. a slide is a box ==");
const deck = await loadTs("src/lib/presentations/deck.ts");
const slide = (n, extra = {}) => ({ layout: "bullets", title: `Slide ${n}`, bullets: [`point ${n}`], notes: `say ${n}`, imageQuery: null, image: null, ...extra });
const photo = { kind: "unsplash", url: "https://images.unsplash.com/p", photographerName: "A", photographerUrl: "https://unsplash.com/@a", downloadLocation: "x" };
const stored = { title: "Breakfast", imageSource: "unsplash", slides: [slide(1), slide(2, { imageQuery: "coffee", image: photo }), slide(3), slide(4)] };
// The model was asked for slide 3 and rewrote all of it.
const answer = {
  title: "REWRITTEN",
  imageSource: "unsplash",
  slides: [slide(1, { title: "X" }), slide(2, { title: "Y", imageQuery: "tea" }), slide(3, { title: "Slide 3, shorter" }), slide(4, { bullets: [] })],
};
const kept = deck.keepOnlySlide(stored, answer, 2);
check("only the chosen slide is taken from the model's answer", kept?.slides[2].title === "Slide 3, shorter");
check("...every other slide is the stored one, whatever the model wrote",
  kept && [0, 1, 3].every((i) => same(kept.slides[i], stored.slides[i])), JSON.stringify(kept?.slides.map((s) => s.title)));
check("...and so is the deck's title", kept?.title === "Breakfast");
check("a slide the deck does not have is no box", deck.keepOnlySlide(stored, answer, 4) === null && deck.keepOnlySlide(stored, answer, -1) === null);
check("an answer missing the chosen slide is unusable, not a deck with a hole",
  deck.keepOnlySlide(stored, { ...answer, slides: answer.slides.slice(0, 2) }, 2) === null);
check("a slide index from a request: none, one of this deck, or bad",
  deck.readSlideIndex(undefined, 4) === null && deck.readSlideIndex(null, 4) === null && deck.readSlideIndex(3, 4) === 3 &&
    [4, -1, 1.5, "1", true].every((v) => deck.readSlideIndex(v, 4) === "bad"));
check("the model is told which slide, of how many, and the words",
  /slide 3 of 4/.test(deck.scopeInstructionToSlide("make it shorter", 2, 4)) && /make it shorter$/.test(deck.scopeInstructionToSlide("make it shorter", 2, 4)));
const again = { ...stored.slides[1], title: "Coffee, warmer" };
check("a box that still wants the same picture keeps it, with no search", deck.keepBoxImage(stored.slides[1], again, "unsplash").image === photo);
check("...one that wants another picture is searched for again", deck.keepBoxImage(stored.slides[1], { ...again, imageQuery: "tea" }, "unsplash").image === null);
check("...one that wants none has none", deck.keepBoxImage(stored.slides[1], { ...again, imageQuery: null }, "unsplash").image === null);
const own = { kind: "own", path: "u/1.jpg" };
check("...and with the person's own photos the stored one stays", deck.keepBoxImage({ ...stored.slides[1], image: own }, { ...again, imageQuery: "tea" }, "own").image === own);

console.log("\n== 2. a part of a page is a box ==");
const boxes = await loadTs("src/lib/website-boxes.ts");
const page = `<!doctype html><html><head><title>A > B</title><style>p>a{color:red}</style></head><body class="x">
<header><nav><a href="/">Home</a></nav></header>
<main><section id="hero" data-cta="go/>now"><h1>Καλώς <em>ήρθατε</em></h1><img src="a.jpg" alt="x > y"><p>One<br>two</p></section>
<section><h2>Υπηρεσίες</h2><ul><li>a<li>b</ul></section></main>
<!-- <section>not a box</section> -->
<footer><p>© 2026</p></footer><script>if (a<b) document.write("</section>")</script></body></html>`;
const found = boxes.findPageBoxes(page);
check("the boxes are the header, each section (inside <main>), and the footer",
  same(found.map((b) => b.tag), ["header", "section", "section", "footer"]), JSON.stringify(found.map((b) => b.tag)));
check("...each named by its heading, with the tags taken out", found[1]?.heading === "Καλώς ήρθατε" && found[2]?.heading === "Υπηρεσίες" && found[0]?.heading === null);
check("...a commented-out section and a script are not boxes, and a '>' in an attribute does not end a tag",
  page.slice(found[1].start, found[1].end).endsWith("</section>") && page.slice(found[1].start, found[1].end).includes('alt="x > y"'));
const marked = boxes.markBoxForEdit(page, 2);
check("the box to change is marked for the model", marked?.includes(`<section ${boxes.BOX_MARK}="edit"><h2>Υπηρεσίες`));
// The model changed the marked box AND the header, the first section and the title.
const modelPage = marked
  .replace("Υπηρεσίες", "Τι κάνουμε")
  .replace("<h1>Καλώς", "<h1>ΑΛΛΑΓΜΕΝΟ")
  .replace("<title>A > B</title>", "<title>new</title>")
  .replace('<a href="/">Home</a>', '<a href="/">Αρχική</a>');
const saved = boxes.takeEditedBox(page, modelPage, 2);
check("only the chosen part is taken from the model's page; every other byte is the stored page",
  saved === page.replace("Υπηρεσίες", "Τι κάνουμε"), saved?.slice(0, 200));
check("...and the mark does not reach the saved page", saved !== null && !saved.includes(boxes.BOX_MARK));
check("a model page without the marked part is an edit that did not happen", boxes.takeEditedBox(page, page.replace("Υπηρεσίες", "x"), 2) === null);
check("a part the page does not have is no box",
  boxes.markBoxForEdit(page, 4) === null && boxes.takeEditedBox(page, modelPage, 4) === null &&
    boxes.readBoxIndex(4, found.length) === "bad" && boxes.readBoxIndex(0, found.length) === 0 && boxes.readBoxIndex(undefined, 4) === null &&
    [-1, 0.5, "2"].every((v) => boxes.readBoxIndex(v, 4) === "bad"));
const outlined = boxes.outlineBoxes(page, 1);
check("the preview numbers every box and outlines the chosen one, with CSS only",
  (outlined.match(/data-ionexa-n="\d"/g) ?? []).length === 4 && /<section data-ionexa-n="2" data-ionexa-on id="hero" data-cta="go\/>now">/.test(outlined) &&
    outlined.indexOf("[data-ionexa-on]") < outlined.indexOf("</head>") && (outlined.match(/<script/g) ?? []).length === 1);

console.log("\n== 3. the routes take one box, before anything is held ==");
const slidesRoute = read("src/app/api/presentations/[id]/edit/route.ts");
const at = (src, re) => src.search(re);
check("Slides: a slide that is not in the deck is refused before any credits are held",
  /const box = readSlideIndex\(slideIndex, stored\.slides\.length\);\s*if \(box === "bad"\) return NextResponse\.json\(\{ error: "bad_slide" \}, \{ status: 400 \}\);/.test(slidesRoute) &&
    at(slidesRoute, /readSlideIndex\(/) < at(slidesRoute, /reserveCredits\(/));
check("Slides: the model is told which slide",
  /instruction: box === null \? instruction : scopeInstructionToSlide\(instruction, box, stored\.slides\.length\)/.test(slidesRoute));
check("Slides: the rest of the deck is the stored deck",
  /const boxed = outcome\.ok && box !== null \? keepOnlySlide\(stored, outcome\.deck, box\) : null;/.test(slidesRoute) &&
    /let deck: Deck = boxed \?\? outcome\.deck;/.test(slidesRoute) && /if \(!outcome\.ok \|\| \(box !== null && !boxed\)\)/.test(slidesRoute));
check("Slides: a picture is searched for that one slide only, never the whole deck again",
  /if \(boxed && box !== null\) \{[\s\S]*?keepBoxImage\(stored\.slides\[box\], boxed\.slides\[box\], stored\.imageSource\)[\s\S]*?resolveUnsplashImages\(\{ \.\.\.boxed, slides: \[slide\] \}\)[\s\S]*?\} else if \(stored\.imageSource === "unsplash"\) deck = await resolveUnsplashImages\(deck\);/.test(slidesRoute));
const siteRoute = read("src/app/api/websites/edit/route.ts");
check("Site: a part that is not on the page is refused before the site is locked or credits held",
  /const section = readBoxIndex\(sectionRaw, findPageBoxes\(sourceHtml\)\.length\);\s*if \(section === "bad"\)/.test(siteRoute) &&
    at(siteRoute, /readBoxIndex\(/) < at(siteRoute, /reserveCredits\(/) && at(siteRoute, /readBoxIndex\(/) < at(siteRoute, /\.update\(\{ editing_started_at: /));
check("Site: the model sees the part marked, and is told to change only it",
  /section === null \? sourceHtml : \(markBoxForEdit\(sourceHtml, section\) \?\? sourceHtml\),\s*section === null \? changeRequest : scopeChangeToBox\(changeRequest\)/.test(siteRoute));
check("Site: the rest of the page is the stored page, before photos, links and the safety review run on it",
  /const boxed = takeEditedBox\(sourceHtml, updatedHtml, section\);\s*if \(!boxed\) throw new Error\(BOX_LOST\);\s*updatedHtml = boxed;/.test(siteRoute) &&
    at(siteRoute, /takeEditedBox\(/) < at(siteRoute, /resolveWebsiteImagePlaceholders\(/) &&
    at(siteRoute, /takeEditedBox\(/) < at(siteRoute, /reviewWebsiteContentSafety\(/));
check("Site: a part that did not come back releases the hold and says so",
  /await releaseReservation\(user\.id, reservationId\);\s*if \(err instanceof Error && err\.message === BOX_LOST\) \{\s*return NextResponse\.json\(\{ ok: false, reason: BOX_LOST \}/.test(siteRoute));
check("the breaker tells a change to one box from the same words for the whole page",
  /fingerprintRequest\(params\.id, instruction, box\)/.test(slidesRoute) && /fingerprintRequest\(websiteId, `\$\{pageSlugRaw\}\\n\$\{typeof sectionRaw === "number" \? sectionRaw : ""\}\\n\$\{changeRequest\}`\)/.test(siteRoute));

console.log("\n== 4. the shells send the box ==");
const slides = read("src/components/presentations/presentations-shell.tsx");
const cards = read("src/components/presentations/deck-slides.tsx");
const site = read("src/components/website-builder/website-shell.tsx");
const shell = read("src/components/shell/tool-shell.tsx");
check("Slides: each slide is pressed to choose it", /onClick=\{\(\) => onSelect\(index\)\}\s*aria-pressed=\{selected === index\}/.test(cards) && /selected=\{box\}/.test(slides));
check("Slides: the change goes with the slide", /\.\.\.\(box === null \? \{\} : \{ slideIndex: box \}\)/.test(slides));
check("Slides: another deck opening forgets the chosen slide", /const setOpen = \(next: Open \| null\) => \{\s*setOpenDeck\(next\);\s*setBox\(null\);/.test(slides));
check("Site: each part is pressed to choose it", /data-testid="site-box"[\s\S]{0,200}setBox\(chosen === i \? null : \{ siteId: current\.id, index: i \}\)/.test(site));
// The request is shared with the Site beside Chat (lib/website-builder/site-requests.ts).
const siteRequests = stripComments(readFileSync("src/lib/website-builder/site-requests.ts", "utf8"));
check("Site: the change goes with the part",
  /requestSiteChange\(\{ websiteId: current\.id, changeRequest: request, section: part \}\)/.test(site)
    && /\.\.\.\(input\.section === null \|\| input\.section === undefined \? \{\} : \{ section: input\.section \}\)/.test(siteRequests));
check("Site: a chosen part on another site is no choice", /const chosen = box && current && box\.siteId === current\.id && box\.index < boxes\.length \? box\.index : null;/.test(site));
check("Site: the preview stays without scripts while a part is chosen",
  /srcDoc=\{chosen === null \? html : outlineBoxes\(html, chosen\)\}\s*sandbox=""/.test(site) && !/allow-scripts/.test(site));
check("both say under the field what the next change touches, with the press back to the whole",
  /<ChosenBox label=\{tShell\("box\.slide", \{ n: box \+ 1 \}\)\} onClear=\{\(\) => setBox\(null\)\} \/>/.test(slides) &&
    /<ChosenBox label=\{chosenLabel\} onClear=\{\(\) => setBox\(null\)\} \/>/.test(site) && /data-testid="box-clear"/.test(shell));

const LOCALES = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
const KEYS = ["only", "whole", "hint", "slide", "part", "header", "footer", "nav", "placeholder", "slideChanged", "partChanged", "lost", "boxes"];
for (const l of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard?.toolShell?.box ?? {};
  check(`${l}: the boxes' words`, KEYS.every((k) => typeof m[k] === "string" && m[k]) && /\{name\}/.test(m.only) && /\{n\}/.test(m.slideChanged) && /\{name\}/.test(m.partChanged));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
