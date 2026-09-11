// A BRIEF IN, A DECK OUT — AND FOUR ABSENCES (V5 #21).
//
// /dashboard/presentations was a notes form under a name that promised
// slides; scripts/tests/presentation-notes.test.mjs held it to saying
// "does not generate slides" in ten languages. That file is gone and this
// one holds the OPPOSITE promise to the code, which is the harder one: a
// page that says it writes a deck has to reach a model, clamp what comes
// back, charge for what was spent, and hand over a file somebody can open.
//
// WHAT THIS ENVIRONMENT COULD NOT DO, said first: nothing here calls
// Anthropic. Section 2 checks the prompt, the tool schema and the order
// of the call; the deck that is rendered in sections 5 and 6 is a
// fixture. The live run is in the round's report, not in a gate.
//
// THE FOUR THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A BOUND STATED AND NOT APPLIED. The prompt tells the model "at most
//   six bullets"; a seventh arrives anyway and the .pptx has a text box
//   that overflows the slide. Section 1 checks the parser, not the prompt.
//
//   A PHOTO WITHOUT ITS PHOTOGRAPHER. Unsplash's licence requires the
//   credit; a stored image missing it is refused rather than shown.
//
//   A HOLD SIZED FROM THE BRIEF. A two-line brief for twenty slides costs
//   ten times a two-line brief for two; an estimate that read the brief
//   alone would under-hold the long deck every time. Section 4 prices it.
//
//   A FILE THAT DOES NOT OPEN. Section 5 unzips a real .pptx and finds the
//   slides, the notes and the picture in it; section 6 renders a real
//   PDF in Greek, Chinese and Arabic and reads it back with this app's own
//   extractor.
//
// Run: node scripts/tests/presentations.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadTs, loadTsLinked } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

const require = createRequire(import.meta.url);

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const lookup = (obj, dotted) => dotted.split(".").reduce((n, p) => (n == null ? undefined : n[p]), obj);

const DECK_TS = "src/lib/presentations/deck.ts";
const GENERATE_TS = "src/lib/presentations/generate.ts";
const PROMPT_TS = "src/lib/presentations/prompt.ts";
const IMAGES_TS = "src/lib/presentations/images.ts";
const PPTX_TS = "src/lib/presentations/pptx.ts";
const PDF_TSX = "src/lib/pdf/deck.tsx";
const ROUTE = "src/app/api/presentations/generate/route.ts";
const PPTX_ROUTE = "src/app/api/presentations/[id]/pptx/route.ts";
const PDF_ROUTE = "src/app/api/presentations/[id]/pdf/route.ts";
const WORKSPACE = "src/components/presentations/presentations-workspace.tsx";
const PAGE = "src/app/dashboard/presentations/page.tsx";
const MIGRATION = "supabase/migrations/20260929000000_presentation_decks.sql";

const deck = await loadTs(DECK_TS);
const {
  MIN_SLIDES, MAX_SLIDES, DEFAULT_SLIDES, MAX_BULLETS, MAX_TITLE_CHARS, MAX_BULLET_CHARS, MAX_NOTES_CHARS,
  MAX_OWN_IMAGES, SLIDE_OUTPUT_CHARS, SLIDE_LAYOUTS, IMAGE_SOURCES,
  parseDeckToolInput, parseStoredDeck, parseSlideImage, assignOwnImages, deckEstimateInputChars, clampSlideCount,
  checkDescription,
} = deck;

ok(`ten locales were read (${LOCALES.length})`, LOCALES.length === 10);

console.log("== 1. the contract: every bound is applied, not merely stated ==");
ok("the slide bounds are sane", MIN_SLIDES >= 1 && MIN_SLIDES < DEFAULT_SLIDES && DEFAULT_SLIDES <= MAX_SLIDES && MAX_SLIDES <= 20,
  `${MIN_SLIDES} < ${DEFAULT_SLIDES} <= ${MAX_SLIDES}`);
ok("five layouts, three image sources", SLIDE_LAYOUTS.length === 5 && IMAGE_SOURCES.length === 3);
const ctx = { locale: "en", imageSource: "none", fallbackTitle: "fallback" };
const slide = (i, extra = {}) => ({ layout: "bullets", title: `Slide ${i}`, bullets: ["a", "b"], notes: "say this", imageQuery: null, ...extra });
{
  const many = { title: "T", slides: Array.from({ length: MAX_SLIDES + 5 }, (_, i) => slide(i)) };
  const v = parseDeckToolInput(many, ctx);
  ok(`a twenty-first slide is dropped (${v.ok ? v.deck.slides.length : "refused"} kept of ${MAX_SLIDES + 5})`,
    v.ok && v.deck.slides.length === MAX_SLIDES);
}
{
  const v = parseDeckToolInput({ title: "T", slides: [slide(0, { bullets: Array.from({ length: MAX_BULLETS + 3 }, (_, i) => `b${i}`) })] }, ctx);
  ok("the parser drops a seventh bullet", v.ok && v.deck.slides[0].bullets.length === MAX_BULLETS,
    v.ok ? `${v.deck.slides[0].bullets.length} bullets` : v.reason);
}
{
  const long = "x".repeat(MAX_TITLE_CHARS + 50);
  const v = parseDeckToolInput({ title: long, slides: [slide(0, { title: long, bullets: ["y".repeat(MAX_BULLET_CHARS + 20)], notes: "n".repeat(MAX_NOTES_CHARS + 100) })] }, ctx);
  ok("titles, bullets and notes are cut to their limits",
    v.ok && v.deck.title.length === MAX_TITLE_CHARS && v.deck.slides[0].title.length === MAX_TITLE_CHARS &&
      v.deck.slides[0].bullets[0].length === MAX_BULLET_CHARS && v.deck.slides[0].notes.length === MAX_NOTES_CHARS);
}
{
  const v = parseDeckToolInput({ title: "T", slides: [slide(0, { layout: "hologram" }), { layout: "bullets", title: "", bullets: ["", "  "], notes: "" }] }, ctx);
  ok("an unknown layout falls back and an empty slide is skipped", v.ok && v.deck.slides.length === 1 && v.deck.slides[0].layout === "bullets");
}
ok("a deck with no slides is refused", !parseDeckToolInput({ title: "T", slides: [] }, ctx).ok);
ok("a deck with no title takes the fallback", parseDeckToolInput({ slides: [slide(0, { title: "" })] }, ctx).deck?.title === "fallback");
{
  const v = parseDeckToolInput({ title: "T", slides: [slide(0, { image: { kind: "own", path: "u/p.jpg" } })] }, ctx);
  ok("the model's output never carries an image", v.ok && v.deck.slides[0].image === null);
  const stored = parseStoredDeck({ title: "T", locale: "el", imageSource: "own", slides: [slide(0, { image: { kind: "own", path: "u/p.jpg" } })] });
  ok("...but a stored deck keeps its images, through the same clamps", stored?.slides[0].image?.path === "u/p.jpg" && stored.locale === "el");
}
{
  const full = { kind: "unsplash", url: "https://images.unsplash.com/photo-1?fm=webp", photographerName: "A", photographerUrl: "https://unsplash.com/@a", downloadLocation: "https://api.unsplash.com/photos/1/download" };
  ok("a fully attributed Unsplash photo is kept", parseSlideImage(full)?.kind === "unsplash");
  ok("an unattributed Unsplash photo is refused", parseSlideImage({ ...full, photographerName: "" }) === null);
  ok("...and so is one hosted anywhere but Unsplash's CDN", parseSlideImage({ ...full, url: "https://example.com/x.jpg" }) === null);
  ok("an own photo needs a path", parseSlideImage({ kind: "own", path: "" }) === null);
}
{
  const d = parseDeckToolInput({ title: "T", slides: [slide(0, { imageQuery: "a" }), slide(1), slide(2, { imageQuery: "c" }), slide(3, { imageQuery: "d" })] }, ctx).deck;
  const assigned = assignOwnImages(d, ["u/1.jpg", "u/2.jpg"]);
  const paths = assigned.slides.map((s) => s.image?.path ?? null);
  ok("own photos are handed out in order and never twice", JSON.stringify(paths) === JSON.stringify(["u/1.jpg", null, "u/2.jpg", null]), JSON.stringify(paths));
  ok(`...and never more than ${MAX_OWN_IMAGES}`, assignOwnImages(d, Array.from({ length: MAX_OWN_IMAGES + 5 }, (_, i) => `u/${i}.jpg`)).slides.filter((s) => s.image).length <= MAX_OWN_IMAGES);
}
ok("the estimate grows with every slide asked for", deckEstimateInputChars(100, 20) - deckEstimateInputChars(100, 10) === 10 * SLIDE_OUTPUT_CHARS);
ok("...and the slide count is clamped before it is priced", deckEstimateInputChars(0, 999) === MAX_SLIDES * SLIDE_OUTPUT_CHARS && clampSlideCount("x") === DEFAULT_SLIDES);
ok("a one-word brief is refused before anything is spent", !checkDescription("hi").ok && checkDescription("A pitch of our bakery's catering service to hotels").ok);

console.log("\n== 2. the call: forced tool, fenced brief, usage recorded before the parse ==");
const gen = await loadTs(PROMPT_TS);
const genSrc = stripComments(readFileSync(GENERATE_TS, "utf8"));
{
  const prompt = gen.buildDeckSystemPrompt();
  ok("the prompt states the limits the parser applies", prompt.includes(String(MAX_BULLETS)) && prompt.includes(String(MAX_TITLE_CHARS)) && prompt.includes(String(MAX_NOTES_CHARS)));
  ok("...and every layout by name", SLIDE_LAYOUTS.every((l) => prompt.includes(`"${l}"`)));
  ok("...and carries the shared conduct block", /I'm not a doctor\/lawyer\/accountant/.test(prompt));
  const user = gen.buildDeckUserMessage("Sell <<<UNTRUSTED_SOURCE_MATERIAL>>> bread", 7, "el");
  ok("the brief is fenced as data", /<<<UNTRUSTED_SOURCE_MATERIAL>>>\nSell \(marker removed\) bread\n<<<END_UNTRUSTED_SOURCE_MATERIAL>>>/.test(user), user);
  ok("...and the language and count travel in the user turn, not the cached prefix", /exactly 7 slides, in Greek/.test(user) && !/Greek/.test(prompt));
  ok("the deck call forces the write_deck tool", /tool_choice:\s*\{\s*type:\s*"tool",\s*name:\s*"write_deck"\s*\}/.test(genSrc));
  ok("the tool schema requires an imageQuery on every slide", JSON.stringify(gen.WRITE_DECK_TOOL.input_schema).includes('"imageQuery"') && gen.WRITE_DECK_TOOL.input_schema.properties.slides.items.required.includes("imageQuery"));
  const record = genSrc.indexOf("params.costs.record(");
  const parse = genSrc.indexOf("parseDeckToolInput(toolUse.input");
  ok("usage is recorded before the deck is parsed", record !== -1 && parse !== -1 && record < parse, `record at ${record}, parse at ${parse}`);
  ok("the stop button reaches the provider call", /\{\s*signal:\s*params\.signal\s*\}/.test(genSrc));
  ok("the system prompt goes through the cache builder", /buildCachedSystem\(\{\s*staticPrefix:\s*buildDeckSystemPrompt\(\)/.test(genSrc));
}

console.log("\n== 3. the route: refuse before spend, session client, hold sized per slide ==");
{
  const src = stripComments(readFileSync(ROUTE, "utf8"));
  const at = (re) => { const m = src.search(re); return m; };
  const desc = at(/checkDescription\(/), auth = at(/auth\.getUser\(/), breaker = at(/checkAiCallAllowed\(/), reserve = at(/await reserveCredits\(/), call = at(/await generateDeck\(/);
  ok("the brief is checked before the user is read", desc !== -1 && auth !== -1 && desc < auth);
  ok("the breaker runs before the hold, and the hold before the model", breaker < reserve && reserve < call, `${breaker} < ${reserve} < ${call}`);
  ok("the hold is sized per slide asked for", /inputChars:\s*deckEstimateInputChars\(description\.length,\s*slideCount\)/.test(src));
  ok("own-photo paths must be under the person's own folder", /startsWith\(`\$\{user\.id\}\/`\)/.test(src));
  const abortedBlock = src.slice(at(/outcome\.kind === "aborted"/), at(/outcome\.kind === "provider"/));
  ok("a stopped run releases the hold", /releaseReservation\(/.test(abortedBlock) && /status:\s*499/.test(abortedBlock));
  const unusable = src.slice(src.indexOf('if (!outcome.ok) {'), src.indexOf("let deck"));
  ok("an unusable answer still settles — the tokens were spent", /settleReservation\(/.test(unusable) && !/releaseReservation\(/.test(unusable));
  ok("the row is written through the session client, not the admin one", !/createAdminClient/.test(src) && /await supabase\s*\.from\("ai_presentations"\)\s*\.insert\(/.test(src));
  ok("both the hold and the charge are labelled presentation_generate", (src.match(/"presentation_generate"/g) ?? []).length >= 3);
  ok("the function ceiling is declared", /maxDuration = 120; \/\/ @function-limit 120/.test(readFileSync(ROUTE, "utf8")));
  for (const [file, name] of [[PPTX_ROUTE, "pptx"], [PDF_ROUTE, "pdf"]]) {
    const s = stripComments(readFileSync(file, "utf8"));
    ok(`${name}: reads the row under the session client and refuses a missing one`, /auth\.getUser\(/.test(s) && /\.eq\("id",\s*params\.id\)/.test(s) && /if \(!row\)/.test(s) && !/createAdminClient/.test(s));
    ok(`${name}: makes no model call and takes no hold`, !/messages\.create|reserveCredits|runCompletion/.test(s));
  }
  const pptxRoute = stripComments(readFileSync(PPTX_ROUTE, "utf8"));
  ok("the .pptx is sent as an attachment, uncached", /"Content-Disposition":\s*`attachment;/.test(pptxRoute) && /"Cache-Control":\s*"private, no-store"/.test(pptxRoute) && /presentationml\.presentation/.test(pptxRoute));
}

console.log("\n== 4. the price: per slide, and the number the owner was told ==");
{
  const est = await loadTs("src/lib/billing/estimate.ts");
  const margin = await loadTs("src/lib/billing/margin-policy.ts");
  const pricing = await loadTs("src/lib/billing/pricing-config.ts");
  const plans = await loadTs("src/lib/billing/plans.ts");
  const formula = await loadTs("src/lib/billing/credit-formula.ts");
  ok("presentationGenerate has a profile", Boolean(est.ACTION_PROFILES.presentationGenerate));
  ok("...and settles under presentation_generate", margin.ACTION_TO_FEATURE.presentationGenerate === "presentation_generate");
  const config = pricing.DEFAULTS;
  const brief = 600;
  const rows = [];
  for (const slug of ["free", "starter", "professional"]) {
    const plan = plans.getPlan(slug);
    const price = formula.effectiveCreditPriceEurForAccount(plan, null, config);
    const credits = [5, 10, 20].map((n) =>
      est.estimateForAction("presentationGenerate", { model: "claude-sonnet-4-6", inputChars: deckEstimateInputChars(brief, n), planSlug: slug }, config, price).estimatedCredits);
    rows.push({ slug, credits });
    console.log(`        ${slug.padEnd(12)} 5 slides ${String(credits[0]).padStart(3)}  10 slides ${String(credits[1]).padStart(3)}  20 slides ${String(credits[2]).padStart(3)} credits`);
  }
  ok("the estimate rises with the slide count on every plan", rows.every((r) => r.credits[0] < r.credits[1] && r.credits[1] < r.credits[2]));
  // THE CLAIM THIS CORRECTS. The V5 list said "~25-60 credits/deck". The
  // real number is below, from the same estimator the route reserves
  // against; the band here is wide on purpose — it holds the ORDER of
  // magnitude, and a profile change that moved a ten-slide deck outside
  // it should be argued for in the same commit.
  const ten = rows.map((r) => r.credits[1]);
  ok(`a ten-slide deck is priced between 3 and 40 credits on every plan (${ten.join(", ")})`, ten.every((c) => c >= 3 && c <= 40));
}

console.log("\n== 5. a real .pptx: slides, notes and a picture, unzipped ==");
const fixture = (locale) => ({
  version: 1,
  title: { en: "Catering for hotels", el: "Catering για ξενοδοχεία", zh: "酒店餐饮配送", ar: "خدمة التموين للفنادق" }[locale],
  locale,
  imageSource: "own",
  slides: [
    { layout: "title", title: { en: "Catering for hotels", el: "Catering για ξενοδοχεία", zh: "酒店餐饮配送", ar: "خدمة التموين للفنادق" }[locale], bullets: ["A ten-minute pitch"], notes: "Welcome them.", imageQuery: "bakery", image: { kind: "own", path: "u/1.jpg" } },
    { layout: "bullets", title: { en: "What we deliver", el: "Τι παραδίδουμε", zh: "我们提供什么", ar: "ماذا نقدّم" }[locale], bullets: ["Breakfast", "Lunch boxes", "Events"], notes: "Numbers here.", imageQuery: null, image: null },
    { layout: "quote", title: "A hotel manager", bullets: ["Best croissants in town"], notes: "", imageQuery: null, image: null },
    { layout: "section", title: "Prices", bullets: [], notes: "Pause.", imageQuery: null, image: null },
  ],
});
let pptxBytes = null;
{
  const sharp = require("sharp");
  const jpeg = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 249, g: 115, b: 22 } } }).jpeg().toBuffer();
  const images = new Map([[0, { base64: jpeg.toString("base64"), mediaType: "image/jpeg" }]]);
  // WITH ITS DEPENDENCIES: pptxgenjs is the thing under test here, not a
  // rewrite of it — through loadTsLinked, which writes nothing. The
  // loader that writes its bundle into node_modules is banned from every
  // *.test.mjs by billing-coverage §10, for a deploy it once broke.
  const { renderDeckPptx } = await loadTsLinked(PPTX_TS);
  const buf = await renderDeckPptx(fixture("en"), images);
  pptxBytes = buf;
  ok(`the exporter returns a zip (${buf.length} bytes)`, Buffer.isBuffer(buf) && buf[0] === 0x50 && buf[1] === 0x4b);
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  ok(`one slide part per slide (${slides.length})`, slides.length === 4, names.filter((n) => n.startsWith("ppt/slides/")).join(", "));
  const slide1 = await zip.file("ppt/slides/slide1.xml").async("string");
  const slide2 = await zip.file("ppt/slides/slide2.xml").async("string");
  ok("the title slide carries its title", slide1.includes("Catering for hotels"));
  ok("the bullets slide carries its bullets", slide2.includes("Lunch boxes") && slide2.includes("Events"));
  const notes = names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  const notes1 = notes.length ? await zip.file(notes[0]).async("string") : "";
  ok(`speaker notes are written into the .pptx (${notes.length} note parts)`, notes.length >= 3 && /Welcome them\./.test(notes1 + (await Promise.all(notes.map((n) => zip.file(n).async("string")))).join("")));
  // FILES, not the directory entry the zip also lists.
  const media = names.filter((n) => /^ppt\/media\/.+/.test(n) && !zip.files[n].dir);
  ok(`the picture is embedded as media (${media.length})`, media.length === 1 && /\.jpe?g$/.test(media[0]), media.join(", "));
  const pptxSrc = stripComments(readFileSync(PPTX_TS, "utf8"));
  ok("the .pptx names no font of its own", !/fontFace\s*:/.test(pptxSrc), "PowerPoint substitutes per script better than a name chosen here");
  ok("the .pptx credits an Unsplash photo on its slide", /Photo by \$\{slide\.image\.photographerName\} on Unsplash/.test(pptxSrc));
}

console.log("\n== 6. a real PDF, in three scripts, read back with this app's extractor ==");
{
  const React = (await import("react")).default;
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { registerPdfFonts } = await loadTsLinked("src/lib/pdf/fonts.ts");
  registerPdfFonts();
  const { PdfDeck } = await loadTsLinked(PDF_TSX);
  const { extractPdfText } = await loadTs("src/lib/files/pdf.ts");
  const missingChars = (wanted, haystack) => {
    const have = new Set([...haystack]);
    return [...new Set([...wanted].filter((c) => c.trim()))].filter((c) => !have.has(c));
  };
  // WHAT THE EXTRACTOR LOSES, MEASURED, AND DECLARED RATHER THAN DODGED.
  // src/lib/files/pdf.ts reads glyph ids back through the font's
  // ToUnicode map, and Noto Sans Arabic's contextual forms do not all map
  // to a letter. Probed on 2026-09-09 with single-line PDFs rendered
  // through the same stack this deck uses:
  //
  //     "ماذا نقدّم"            -> "مادا نقدّم"        ذ lost
  //     "ذ"                     -> ""                 ذ lost
  //     "مرحبا بالعالم"         -> "مرحبا نالعالم"    ب read as ن (set intact)
  //     "خدمة التموين للفنادق"  -> "دمة التموين للقبادق"   خ ف lost
  //     "نقدّم"                 -> "قدّم"              initial ن lost
  //
  // pdf-font-stack.test.mjs's Arabic sample passes because every letter
  // in it happens to come back SOMEWHERE in the string. That is a fact
  // about the sample, not about the extractor, and it is reported as a
  // defect in the round's report. Here the loss for THIS fixture's title
  // is declared by letter, so any other letter going missing still fails
  // — and the Arabic face is proven from the PDF's own font resources,
  // which the extractor cannot get wrong.
  const EXTRACTOR_LOSES = { ar: ["ذ"] };
  const FACE_IN_PDF = { el: /NotoSansSC|Inter/, zh: /NotoSansSC/, ar: /NotoSansArabic/ };
  for (const locale of ["el", "zh", "ar"]) {
    const d = fixture(locale);
    const buf = Buffer.from(await renderToBuffer(React.createElement(PdfDeck, { deck: d, images: new Map() })));
    const out = extractPdfText(buf);
    const text = out.pages.map((p) => p.text).join("\n");
    ok(`${locale}: one page per slide (${out.pages.length})`, out.pages.length === d.slides.length);
    const missing = missingChars(d.slides[1].title, text).filter((c) => !(EXTRACTOR_LOSES[locale] ?? []).includes(c));
    ok(`${locale}: the slide title survives the round trip${EXTRACTOR_LOSES[locale] ? ` (extractor loss ${EXTRACTOR_LOSES[locale].join("")} declared)` : ""}`, missing.length === 0, `never came back: ${missing.join(" ")}`);
    const latin1 = buf.toString("latin1");
    ok(`${locale}: the PDF embeds the face the deck's language leads with`, FACE_IN_PDF[locale].test(latin1));
  }
  // AND THE DECLARED LOSS IS STILL A LOSS. The day the extractor learns
  // ذ, this line goes red and the declaration above comes out — an
  // exemption that has stopped being true reads as a decision somebody
  // made about the extractor as it is now.
  {
    const probe = Buffer.from(await renderToBuffer(React.createElement(PdfDeck, { deck: fixture("ar"), images: new Map() })));
    const text = extractPdfText(probe).pages.map((p) => p.text).join("");
    ok("the declared extractor loss (ذ) is still real", !text.includes("ذ"), "the extractor returns ذ now — remove it from EXTRACTOR_LOSES");
  }
  const pdfSrc = stripComments(readFileSync(PDF_TSX, "utf8"));
  ok("the PDF derives the family from the deck's language", /pdfFontFamily\(deck\.locale\)/.test(pdfSrc));
  ok("...and breaks Chinese onto lines through cjk-wrap", /breakCjkRuns\(/.test(pdfSrc));
  ok("...and reads the deck's direction", /isRtlLocale\(deck\.locale\)/.test(pdfSrc));
}

console.log("\n== 7. the page: what it says, in ten languages, and where it sits ==");
{
  const ws = stripComments(readFileSync(WORKSPACE, "utf8"));
  const limits = [...ws.matchAll(/export const DECK_LIMITS = \[([^\]]+)\]/g)][0]?.[1].match(/"(\w+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  ok(`the four absences are declared (${limits.length})`, limits.length === 4, limits.join(", "));
  for (const limit of limits) {
    const missing = LOCALES.filter((l) => typeof lookup(messages[l], `presentations.limits.${limit}`) !== "string");
    ok(`${limit}: present in all ten locales`, missing.length === 0, missing.join(", "));
  }
  ok("the English absences each say what is NOT done", limits.every((l) => /\b(no|not)\b/i.test(lookup(messages.en, `presentations.limits.${l}`))));
  ok("the page exports through both routes", /`\/api\/presentations\/\$\{[^}]+\}\/pptx`/.test(ws) && /href=\{`\/api\/presentations\/\$\{[^}]+\}\/pdf`\}/.test(ws));
  ok("...and downloads the .pptx through the shared saver", /saveFileResponse\(/.test(ws));
  ok("the page names itself through MODULE_TITLE_KEYS", /pageTitle\(MODULE_TITLE_KEYS\.presentations\)/.test(readFileSync(PAGE, "utf8")));
  for (const l of LOCALES) {
    ok(`${l}: the nav name is the page heading`, lookup(messages[l], "sidebar.items.presentations") === lookup(messages[l], "presentations.title"));
  }
  ok("en: the name no longer says notes", !/notes/i.test(lookup(messages.en, "sidebar.items.presentations")));
  ok("en: the hint no longer disclaims the generator", !/does not create slides/i.test(lookup(messages.en, "sidebar.hints.presentations")));
  for (const l of LOCALES) {
    ok(`${l}: the tracker's empty state is gone`, lookup(messages[l], "moduleData.empty.presentations") === undefined && lookup(messages[l], "moduleData.new.presentations") === undefined);
  }
  const nav = stripComments(readFileSync("src/lib/sidebar-nav.ts", "utf8"));
  const make = nav.slice(nav.indexOf('heading: "Make"'), nav.indexOf('heading: "Ask"'));
  const row = make.slice(make.indexOf('"/dashboard/presentations"'), make.indexOf('"/dashboard/create"'));
  ok("the row is drawn under Make", row.length > 0 && !/hidden:\s*true/.test(row), "the row is hidden or filed elsewhere");
  ok("build-modules.ts no longer lists the slug", !/slug: "presentations"/.test(readFileSync("src/lib/build-modules.ts", "utf8")));
  const roadmap = readFileSync("src/app/roadmap/page.tsx", "utf8");
  ok("the roadmap files presentations under available", /status: "available"[\s\S]*?key: "presentations"[\s\S]*?status: "soon"/.test(roadmap));
  const tips = await loadTs("src/lib/help-tips.ts");
  const tip = tips.HELP_TIPS.find((t) => t.id === "presentations");
  ok("the page carries a help tip that names the edge", Boolean(tip) && /does not draw charts/i.test(lookup(messages.en, "help.presentations.doesNot")));
}

console.log("\n== 8. the migration: columns the route writes exist, nothing is dropped ==");
{
  const sql = readFileSync(MIGRATION, "utf8");
  for (const col of ["slides", "locale", "image_source", "source", "credits_charged", "error"]) {
    ok(`adds ${col} idempotently`, new RegExp(`add column if not exists ${col}\\b`).test(sql));
  }
  ok("source and image_source are constrained", /check \(source in \('note', 'generated'\)\)/.test(sql) && /image_source in \('unsplash', 'own', 'none'\)/.test(sql));
  // COMMENTS STRIPPED FIRST: the migration's own header says "No DROP
  // TABLE, no TRUNCATE", and a scan that reads prose is failed by the
  // sentence recording that it passes.
  const sqlCode = sql.replace(/^\s*--.*$/gm, "");
  ok("nothing is dropped or truncated", !/drop table|truncate/i.test(sqlCode));
  ok("the grant travels with the policy", /grant select, insert, update, delete on public\.ai_presentations to authenticated/.test(sql));
  const route = stripComments(readFileSync(ROUTE, "utf8"));
  const inserted = [...new Set([...route.matchAll(/^\s+(\w+):\s/gm)].map((m) => m[1]))];
  const known = new Set(["user_id", "title", "description", "slide_count", "status", "slides", "locale", "image_source", "source", "credits_charged", "error"]);
  const insertBlocks = [...route.matchAll(/\.insert\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  const unknown = insertBlocks.flatMap((b) => [...b.matchAll(/^\s+(\w+):/gm)].map((m) => m[1])).filter((k) => !known.has(k));
  ok(`every column the route inserts exists (${insertBlocks.length} inserts)`, insertBlocks.length >= 2 && unknown.length === 0, unknown.join(", "));
  void inserted;
}

ok("the tracker's gate is retired", !existsSync("scripts/tests/presentation-notes.test.mjs"));
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
