// A SITE AND A DOCUMENT IN ANOTHER LANGUAGE, IN THE SAME FORM (MASTER 16,
// package 28), behind the switch "translate".
//
// What would be wrong quietly:
//
//   A TRANSLATION THAT CHANGED THE FORM. Section 1 cuts real pages into
//   pieces, puts a translation back, and requires every tag and every
//   attribute but the read ones to come back byte for byte — the
//   skeleton — and an untouched piece to come back as its own bytes.
//
//   A PIECE PUT BACK WRONG. A mark dropped, doubled, or closed before it
//   opened would give a broken page; section 1 requires such a piece to
//   stay as it was, counted, and a list of the wrong length to be no
//   answer at all.
//
//   A SITE THAT LOST A PAGE, OR A LINK THAT NO LONGER LEADS ANYWHERE.
//   Section 2 translates a five-page site and requires every slug, and
//   every page, to survive.
//
//   A PRICE ON SCREEN THAT IS NOT THE HOLD. Section 3 holds both halves of
//   the route to the same pieces and the same estimate, and the order: the
//   switch, the owner's own row, the plan for a site, the hold before the
//   model, the original never written.
//
// Run: node scripts/tests/translate.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const read = (f) => stripComments(readFileSync(f, "utf8"));
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

const S = await loadTs("src/lib/translate/segments.ts");
const P = await loadTs("src/lib/translate/translate-prompt.ts");
const SRC = await loadTs("src/lib/translate/sources.ts");

const PAGE = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>Camping Ήλιος &amp; Θάλασσα</title><meta name="description" content="Διακοπές δίπλα στη θάλασσα"><meta property="og:title" content="Camping Ήλιος"><style>.hero{color:#e85d04}</style></head>
<body><nav class="top"><a href="/">Αρχική</a> · <a href="/contact">Επικοινωνία</a></nav>
<section id="hero" style="background:url(a.jpg)"><h1 class="hero">Καλώς ήρθατε στο <strong>Camping Ήλιος</strong>!</h1>
<p>Τιμή: 25&nbsp;€ <br>ανά βράδυ, <em>με <b>ρεύμα</b></em>.</p>
<img src="https://x.supabase.co/storage/v1/object/public/w/a.jpg" alt="Θέα στη θάλασσα" width="800"><input type="submit" value="Κράτηση">
<code>npm run</code><div translate="no">Ήλιος <span>όνομα</span></div><pre>  κείμενο  </pre>
<script>const msg = "<p>γεια</p>"; if (a < b) {}</script><!-- σχόλιο --><p>   </p><p>2026</p></section></body></html>`;

console.log("== 1. the pieces, and the form put back byte for byte ==");
{
  const { plan, pieces } = S.planHtml(PAGE);
  const texts = pieces.map((p) => p.text);
  ok("what a person reads is sent: the title, the description, a link line, a heading, a sentence, an image's words, a button", ["Camping Ήλιος & Θάλασσα", "Διακοπές δίπλα στη θάλασσα", "Camping Ήλιος", "<1>Αρχική</1> · <2>Επικοινωνία</2>", "Καλώς ήρθατε στο <1>Camping Ήλιος</1>!", "Θέα στη θάλασσα", "Κράτηση"].every((t) => texts.includes(t)), JSON.stringify(texts));
  ok("a sentence carries its bold and its line break as marks, nested as they were", texts.some((t) => /^Τιμή: 25 € <1\/>ανά βράδυ, <2>με <3>ρεύμα<\/3><\/2>\.$/.test(t)), JSON.stringify(texts));
  ok("nothing that is not prose is sent: script, style, code, pre, translate=\"no\", comments, numbers, blank paragraphs", !texts.some((t) => /γεια|color|npm|κείμενο|όνομα|σχόλιο|^2026$|^\s*$/.test(t)), JSON.stringify(texts));
  ok("...nor a URL, a class, a style or a size", !texts.some((t) => /https?:|hero|background|800|charset/.test(t)));

  const identity = S.rebuildHtml(plan, texts, pieces);
  ok("the page with every piece answered as itself is the page, byte for byte", identity.html === PAGE && identity.kept === 0);

  const english = texts.map((t) =>
    t
      .replace("Camping Ήλιος & Θάλασσα", "Camping Ilios & Sea")
      .replace("Διακοπές δίπλα στη θάλασσα", "Holidays by the sea")
      .replace("<1>Αρχική</1> · <2>Επικοινωνία</2>", "<1>Home</1> · <2>Contact</2>")
      .replace("Καλώς ήρθατε στο <1>Camping Ήλιος</1>!", "<1>Camping Ilios</1> welcomes you!")
      .replace(/^Τιμή.*$/, "Price: 25 € <1/>per night, <2>with <3>power</3></2>.")
      .replace("Θέα στη θάλασσα", "Sea view <&> \"sun\"")
      .replace("Κράτηση", "Book")
  );
  const out = S.rebuildHtml(plan, english, pieces, 0, "en");
  ok("the translated page has the same form: every tag and every attribute but the read ones", S.skeletonOf(out.html) === S.skeletonOf(PAGE), `${S.skeletonOf(out.html)}\n        ${S.skeletonOf(PAGE)}`);
  ok("...in the other language, every piece placed", out.kept === 0 && /<h1 class="hero"><strong>Camping Ilios<\/strong> welcomes you!<\/h1>/.test(out.html) && /<a href="\/">Home<\/a> · <a href="\/contact">Contact<\/a>/.test(out.html) && /<title>Camping Ilios &amp; Sea<\/title>/.test(out.html));
  ok("...with the page's language said, and the words that were not prose untouched", /<html lang="en">/.test(out.html) && out.html.includes('<script>const msg = "<p>γεια</p>"; if (a < b) {}</script>') && out.html.includes("<code>npm run</code>") && out.html.includes('<div translate="no">Ήλιος <span>όνομα</span></div>'));
  ok("a translation is text: what it says cannot become markup, in a sentence or an attribute", /alt="Sea view &lt;&amp;&gt; &quot;sun&quot;"/.test(out.html) && !/<&>/.test(out.html) && /value="Book"/.test(out.html));
  ok("an image keeps its address and its size", out.html.includes('src="https://x.supabase.co/storage/v1/object/public/w/a.jpg"') && out.html.includes('width="800"'));

  const marks = { closers: { 1: "</strong>" }, marks: ["<strong>"] };
  const source = "Καλώς ήρθατε στο <1>Camping</1>!";
  ok("a mark dropped is no answer", S.rebuildRun("Welcome to Camping!", marks.marks, marks.closers, source) === null);
  ok("a mark twice is no answer", S.rebuildRun("<1>Welcome</1> to <1>Camping</1>", marks.marks, marks.closers, source) === null);
  ok("a mark closed before it opens is no answer", S.rebuildRun("</1>Camping<1> welcomes you", marks.marks, marks.closers, source) === null);
  ok("marks crossed — one pair closed inside the other — are no answer", S.rebuildRun("<1>a <2>b</1> c</2>", ["<strong>", "<em>"], { 1: "</strong>", 2: "</em>" }, "x <1>a <2>b</2></1>") === null && S.rebuildRun("<1>a <2>b</2></1>", ["<strong>", "<em>"], { 1: "</strong>", 2: "</em>" }, "x <1>a <2>b</2></1>") === "<strong>a <em>b</em></strong>");
  ok("a single mark written as a pair is no answer", S.rebuildRun("a<1>b</1>", ["<br>"], {}, "a<1/>b") === null);
  ok("...and such a piece stays as it was, counted", (() => {
    const r = S.rebuildHtml(plan, texts.map((t) => (t.startsWith("Καλώς") ? "Welcome to Camping!" : t)), pieces);
    return r.kept === 1 && r.html.includes("Καλώς ήρθατε στο <strong>Camping Ήλιος</strong>!");
  })());
  ok("an empty or missing answer leaves the piece as it was, counted", S.rebuildHtml(plan, texts.map((t, i) => (i === 0 ? "" : i === 1 ? null : t)), pieces).kept === 2);
  ok("the model's list is read only when it is the length that was sent", S.readTranslations({ translations: ["a", "b"] }, 2)?.length === 2 && S.readTranslations({ translations: ["a"] }, 2) === null && S.readTranslations({ translations: "a" }, 1) === null && S.readTranslations(null, 0) === null);
}

console.log("\n== 2. a five-page site and a document ==");
{
  const page = (title, slug) => `<!DOCTYPE html><html lang="el"><head><title>${title}</title></head><body><nav><a href="/">Αρχική</a><a href="/${slug}">${title}</a></nav><h1>${title}</h1><p>Κείμενο για ${title}.</p></body></html>`;
  const site = {
    name: "Camping Ήλιος",
    html_content: page("Αρχική", "rooms"),
    pages: ["rooms", "prices", "gallery", "contact"].map((slug, i) => ({ slug, label: ["Δωμάτια", "Τιμές", "Φωτογραφίες", "Επικοινωνία"][i], html: page(["Δωμάτια", "Τιμές", "Φωτογραφίες", "Επικοινωνία"][i], slug) })),
  };
  const planned = SRC.planSite(site);
  ok("the site is read as Greek", planned.from === "el");
  ok("every page and every label is in the one list", planned.pieces.length > 4 * 3 && ["Δωμάτια", "Τιμές", "Φωτογραφίες", "Επικοινωνία"].every((l) => planned.pieces.some((p) => p.kind === "plain" && p.text === l)));
  const tr = { "Αρχική": "Home", "Δωμάτια": "Rooms", "Τιμές": "Prices", "Φωτογραφίες": "Photos", "Επικοινωνία": "Contact" };
  const answer = planned.pieces.map((p) => p.text.replace(/Κείμενο για/g, "Text about").replace(/Αρχική|Δωμάτια|Τιμές|Φωτογραφίες|Επικοινωνία/g, (w) => tr[w]));
  const out = planned.rebuild(answer, "en");
  ok("the copy has all five pages, the same slugs, translated labels", out.pages.length === 4 && out.pages.map((p) => p.slug).join() === "rooms,prices,gallery,contact" && out.pages.map((p) => p.label).join() === "Rooms,Prices,Photos,Contact");
  ok("every page keeps its form, and its links still lead to the same slugs", [site.html_content, ...site.pages.map((p) => p.html)].every((h, i) => S.skeletonOf(h) === S.skeletonOf(i === 0 ? out.html_content : out.pages[i - 1].html)) && out.pages[3].html.includes('<a href="/contact">Contact</a>'));
  ok("the copy is named for its language, and nothing was left behind", out.name === "Camping Ήλιος · English" && out.kept === 0);
  ok("a one-page site stays one page", SRC.planSite({ name: "x", html_content: page("Αρχική", "a"), pages: null }).rebuild([], "en").pages === null);
  ok("a long name still fits with its language", SRC.copyName("α".repeat(200), "en").length === 100 && SRC.copyName("α".repeat(200), "en").endsWith(" · English"));

  const doc = SRC.planDocument({ title: "Προσφορά για το ξενοδοχείο", html: "<h2>Τιμές</h2><ul><li>Δωμάτιο: <strong>80 €</strong></li></ul><p>Ισχύει ως τις 30/6.</p>" });
  ok("a document: its title first, then its body", doc.pieces[0].text === "Προσφορά για το ξενοδοχείο" && doc.pieces.some((p) => p.text === "Δωμάτιο: <1>80 €</1>"));
  const docOut = doc.rebuild(doc.pieces.map((p, i) => (i === 0 ? "Offer for the hotel" : p.text.replace("Τιμές", "Prices").replace("Δωμάτιο", "Room").replace("Ισχύει ως τις", "Valid until"))), "en");
  ok("...comes back with the same form and its title translated", docOut.title === "Offer for the hotel" && docOut.html === "<h2>Prices</h2><ul><li>Room: <strong>80 €</strong></li></ul><p>Valid until 30/6.</p>" && docOut.kept === 0);
  ok("...and an English document is read as English", SRC.planDocument({ title: "Offer", html: "<p>Valid until June, for every room in the hotel.</p>" }).from === "en");
}

console.log("\n== 3. the price, the calls, the route ==");
{
  const pieces = Array.from({ length: 300 }, (_, i) => ({ text: `Κομμάτι ${i} με λίγες λέξεις μέσα του`, kind: "run" }));
  const batches = P.translateBatches(pieces);
  ok("every piece is in exactly one batch, in order", batches.flat().join() === pieces.map((_, i) => i).join());
  ok("no batch is past its ceiling", batches.every((b) => b.length <= P.BATCH_COUNT && b.reduce((s, i) => s + pieces[i].text.length, 0) <= P.BATCH_CHARS));
  ok("the input priced is every call's input, system included", P.translateInputChars(pieces, "en") === batches.reduce((s, b) => s + P.translateSystemPrompt("en").length + P.batchMessage(pieces, b, "en").length, 0));
  ok("the output ceiling grows with the call and stops at the model's", P.batchMaxTokens(100) === 2048 && P.batchMaxTokens(9000) === 6512 && P.batchMaxTokens(1e9) === 16000 && P.batchMaxTokens(NaN) === 2048);
  ok("the model is told the marks stay and nothing is merged", /Keep every mark exactly as written and exactly once/.test(P.translateSystemPrompt("en")) && /Never merge, split, skip/.test(P.translateSystemPrompt("en")) && /English/.test(P.translateSystemPrompt("en")));

  const route = read("src/app/api/translate/route.ts");
  const call = read("src/lib/translate/translate-call.ts");
  ok("the switch is asked before anything is read", /if \(!\(await isFeatureOn\("translate", user\)\)\) return \{ ok: false, response: NextResponse\.json\(\{ ok: false, code: "not_enabled" \}, \{ status: 403 \}\) \};/.test(route) && route.indexOf('isFeatureOn("translate"') < route.indexOf('.from("user_websites")'));
  ok("a site needs the plan that includes the Site, before it is read", /if \(!accountHasCapability\(await resolveEffectivePlanSlug\(user\), "websiteBuilder", isAdminEmail\(user\.email\)\)\)/.test(route) && route.indexOf('"websiteBuilder"') < route.indexOf('.from("user_websites")'));
  ok("the thing is read by id AND owner, sites and documents alike", /\.from\("user_websites"\)\s*\.select\("id, name, description, html_content, pages, status"\)\s*\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)/.test(route) && /\.from\("user_documents"\)\.select\("id, title, content"\)\.eq\("id", id\)\.eq\("user_id", user\.id\)/.test(route));
  ok("a site still being made is not translated", /if \(data\.status !== "completed" \|\| !String\(data\.html_content \?\? ""\)\.trim\(\)\)/.test(route));
  ok("the price and the hold are the same estimate of the same pieces", (route.match(/priceFor\(user, translateInputChars\((loaded\.plan\.)?pieces, target\)\)/g) ?? []).length === 2 && /estimateForAction\(\s*"documentTranslate",\s*\{ model: TRANSLATE_MODEL, inputChars, planSlug: plan\?\.slug \?\? null \}/.test(route));
  ok("same language, nothing to say, or too long: refused before any price", /if \(loaded\.plan\.from === target\) return \{ code: "same_language", status: 400 \};/.test(route) && /if \(chars > MAX_TRANSLATE_CHARS\) return \{ code: "too_long", status: 413/.test(route) && route.indexOf("const refused = refusal(loaded, target);\n    if (refused) return NextResponse.json({ ok: false") < route.indexOf("reserveCredits("));
  ok("a site copy counts against the Site's daily cap", /if \(\(count \?\? 0\) >= MAX_GENERATIONS_PER_DAY\) return NextResponse\.json\(\{ ok: false, code: "daily_limit" \}, \{ status: 429 \}\);/.test(route) && /export const MAX_GENERATIONS_PER_DAY = 50;/.test(readFileSync("src/lib/website-generation-limits.ts", "utf8")) && /import \{ FAIR_USE_WINDOW_MS, MAX_GENERATIONS_PER_DAY, isLargeGenerationRequest \} from "@\/lib\/website-generation-limits";/.test(readFileSync("src/app/api/websites/generate/route.ts", "utf8")));
  ok("the hold comes before the model, and a failure or a stop releases it", route.indexOf("reserveCredits(") < route.indexOf("translatePieces(") && /if \(!outcome\.ok\) \{\s*await releaseReservation\(user\.id, reservationId\);/.test(route));
  ok("an answer with nothing usable is paid for and writes nothing", /if \(outcome\.unanswered >= pieces\.length\) \{\s*const settlement = await settle\(\{ outcome: "unusable" \}\);\s*return NextResponse\.json\(\{ ok: false, code: "unusable"/.test(route));
  ok("the original is never written: one insert of a NEW row each, no update", !/\.update\(/.test(route) && /createAdminClient\(\)\s*\.from\("user_websites"\)\s*\.insert\(\{ user_id: user\.id, name: site\.name,/.test(route) && /\.from\("user_documents"\)\s*\.insert\(\{ user_id: user\.id, title: doc\.title,/.test(route));
  ok("the calls: usage recorded before the list is read, a wrong list asked once more, a stop ends them all", call.indexOf('costs.record("generation"') < call.indexOf("readTranslations(") && /if \(result\.ok && result\.list === null\) result = await callBatch\(/.test(call) && /stop\.abort\(\);/.test(call) && /if \(response\.stop_reason === "max_tokens"\) return \{ ok: true, list: null \};/.test(call));
}

console.log("\n== 4. the screen, the words, the switch ==");
{
  const btn = read("src/components/translate/translate-button.tsx");
  ok("the price is asked of the same route and shown before the button can be pressed", /fetch\(`\/api\/translate\?kind=\$\{kind\}&id=/.test(btn) && /disabled=\{price\.state !== "priced" \|\| run\.state === "running"\}/.test(btn));
  ok("the dialog says the original does not change, before anything is pressed", /kind === "site" \? t\("copyNoteSite"\) : t\("copyNoteDocument"\)/.test(btn));
  ok("a piece left as it was is said, with its count", /run\.result\.kept > 0 && <p className="text-xs text-warning" data-testid="translate-kept">\{t\("kept", \{ count: run\.result\.kept \}\)\}/.test(btn));
  ok("Site, the document editor and the writer each offer it only with the switch", /translate=\{await isFeatureOn\("translate", user\)\}/.test(read("src/app/dashboard/website-builder/page.tsx")) && /translate=\{await isFeatureOn\("translate", user\)\}/.test(read("src/app/dashboard/documents/[id]/page.tsx")) && /translate=\{await isFeatureOn\("translate", user\)\}/.test(read("src/app/dashboard/documents/page.tsx")) && /\{translate && current\.status === "completed" && \(\s*<TranslateButton\s*kind="site"/.test(read("src/components/website-builder/website-shell.tsx")) && /\{translate && <TranslateButton kind="document"/.test(read("src/components/documents/document-editor.tsx")) && /\{translate && <TranslateButton kind="document"/.test(read("src/components/documents/documents-shell.tsx")));
  const KEYS = ["button", "title", "language", "copyNoteSite", "copyNoteDocument", "estimating", "estimate", "bypassFree", "sameLanguage", "nothing", "tooLong", "estimateFailed", "go", "running", "stop", "stopped", "done", "kept", "charged", "chargedNothing", "open", "insufficient", "dailyLimit", "notIncluded", "unusable", "failed"];
  for (const l of LOCALES) {
    const m = messages[l].dashboard?.translate ?? {};
    const missing = KEYS.filter((k) => typeof m[k] !== "string" || !m[k].trim());
    const uncounted = ["estimate", "kept", "charged"].filter((k) => !/\{count, plural,/.test(m[k] ?? ""));
    const unnamed = !/\{name\}/.test(m.done ?? "") || !/\{chars\}/.test(m.tooLong ?? "") || !/\{limit\}/.test(m.tooLong ?? "");
    ok(`${l}: every sentence, the counted ones counted, the named ones named`, missing.length === 0 && uncounted.length === 0 && !unnamed, [...missing, ...uncounted, unnamed ? "placeholders" : ""].join(" "));
  }
  ok('the switch "translate" is declared', /\n  translate: "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));
  ok("the route is claimed by Documents in the catalog", /"documents\/\[id\]\/docx", "translate"\]/.test(readFileSync("src/lib/billing/feature-catalog.ts", "utf8")));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length ? 1 : 0;
