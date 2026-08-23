// UNSPLASH ATTRIBUTION HAS TO SURVIVE AN EDIT, NOT JUST A GENERATION.
//
// scripts/tests/unsplash-compliance.test.mjs proves the credit is BUILT
// correctly and lands in the page the generator produces. That is where
// the previous pass stopped, and it is only half of the requirement.
//
// THE SECOND CAUSE. A published site is not frozen after generation. The
// owner edits it — "make the hero bigger", "move the gallery up", "change
// the headline" — and api/websites/edit/route.ts sends the CURRENT
// document to Claude and stores the FULL document it returns. The edit
// system prompt (lib/website-builder.ts, EDIT_SYSTEM_PROMPT) says "keep
// every other section exactly as they were". That is a prompt rule, and
// this codebase has already written down what a prompt rule is worth:
// lib/website-link-safety.ts, in its own header — "A prompt rule is a
// strong prior, not a guarantee, and the failure mode is silent and
// user-visible on the customer's live site."
//
// It is worth exactly the same here, with a worse consequence. A model
// rewriting a hero block sees
//
//     <span class="unsplash-credit" style="...">Photo by ... </span>
//
// sitting between the <img> and the <h1>, reads it as leftover markup,
// and does not copy it forward. The photo is still there, still hotlinked
// from images.unsplash.com, and now UNCREDITED — on a live customer page,
// with nothing red anywhere. That is precisely the condition an Unsplash
// production-access review looks for, and precisely the condition no
// existing test could see, because every existing test stops at the
// generator's output.
//
// So the invariant this file defends is not "the generator emits a
// credit". It is:
//
//     EVERY <img> POINTING AT images.unsplash.com IN A DOCUMENT WE ARE
//     ABOUT TO STORE CARRIES A CREDIT NAMING ITS PHOTOGRAPHER, WITH BOTH
//     LINKS CARRYING utm_source AND utm_medium.
//
// stated over the document AS STORED, whatever produced it.
//
// The checker below is written independently of the implementation on
// purpose: it walks the document and reads what is actually next to each
// image, rather than re-using the production regex, so it cannot pass by
// agreeing with a bug.
//
// Run: node scripts/tests/unsplash-attribution-durability.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
const ok = (name, cond) => check(name, Boolean(cond), true);

const ph = await loadTs("src/lib/website-image-placeholders.ts");

// ---------------------------------------------------------------------
// An INDEPENDENT reading of "is this photo credited".
// ---------------------------------------------------------------------
//
// Deliberately not the production matcher. It splits the document at
// every <img> and asks what a person would ask looking at the rendered
// page: is there, right here, a credit that names somebody, and do both
// of its links carry the referral parameters Unsplash requires?

const UNSPLASH_CDN = "https://images.unsplash.com/";

/** Every <img …> tag in the document, with the text that follows it up to
 *  the next <img> or the end — i.e. the region a credit for THIS image
 *  could occupy. */
function imagesWithTrailingRegion(html) {
  const out = [];
  const positions = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) positions.push({ tag: m[0], start: m.index, end: re.lastIndex });
  for (let i = 0; i < positions.length; i++) {
    const nextStart = i + 1 < positions.length ? positions[i + 1].start : html.length;
    out.push({ tag: positions[i].tag, after: html.slice(positions[i].end, nextStart) });
  }
  return out;
}

function srcOf(tag) {
  const m = tag.match(/\bsrc="([^"]*)"/);
  return m ? m[1] : "";
}

/** What the visitor can see and click, for one image. */
function creditFor(image) {
  // Only the FIRST credit span after the image belongs to it; anything
  // further along belongs to whatever comes next.
  const span = image.after.match(/<span[^>]*class="unsplash-credit"[^>]*>([\s\S]*?)<\/span>\s*$|<span[^>]*class="unsplash-credit"[^>]*>([\s\S]*?)<\/span>/);
  if (!span) return null;
  const inner = span[1] ?? span[2] ?? "";
  const hrefs = [...inner.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1],
    text: m[2],
  }));
  // The visible sentence, with tags removed and entities left alone —
  // this is what a reviewer reads on the page.
  const text = inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return { inner, hrefs, text };
}

// Checked the way a BROWSER sees it, not with a regex over the raw
// attribute. The href in the document is HTML-escaped ("&amp;" between
// parameters); a pattern matching on "&" alone silently accepts a link
// whose parameters a browser would never separate, and a pattern
// matching only "&amp;" would reject a correct un-escaped one. Decoding
// and parsing removes the whole question.
const UTM_OK = (rawHref) => {
  const href = rawHref
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return (
    url.searchParams.get("utm_source") === "ionexa" &&
    url.searchParams.get("utm_medium") === "referral"
  );
};

/** The invariant, applied to a whole document. Returns the offenders. */
function uncreditedUnsplashImages(html) {
  const offenders = [];
  for (const image of imagesWithTrailingRegion(html)) {
    const src = srcOf(image.tag);
    if (!src.startsWith(UNSPLASH_CDN)) continue;
    const credit = creditFor(image);
    if (!credit) {
      offenders.push({ src, why: "no credit at all" });
      continue;
    }
    if (!/^Photo by .+ on Unsplash$/.test(credit.text)) {
      offenders.push({ src, why: `credit does not read "Photo by X on Unsplash": ${credit.text}` });
      continue;
    }
    if (credit.hrefs.length !== 2) {
      offenders.push({ src, why: `expected 2 links, found ${credit.hrefs.length}` });
      continue;
    }
    const bad = credit.hrefs.filter((h) => !UTM_OK(h.href));
    if (bad.length) offenders.push({ src, why: `link without utm: ${bad.map((b) => b.href).join(", ")}` });
  }
  return offenders;
}

// ---------------------------------------------------------------------
// The document the GENERATOR produces — built through the real function,
// never hand-written, so what is under test is what actually ships.
// ---------------------------------------------------------------------

const PHOTO_A = {
  url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?ixid=abc&w=1080",
  photographerName: "Annie Spratt",
  photographerUrl: "https://unsplash.com/@anniespratt",
};
const PHOTO_B = {
  url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?ixid=def&w=1080",
  photographerName: "Jay Wennington",
  photographerUrl: "https://unsplash.com/@jaywennington",
};
// A name that is markup. It has to survive the round trip intact and
// still be escaped — a credit that loses the escaping on the way back is
// an injection into a customer's live page.
const PHOTO_HOSTILE = {
  url: "https://images.unsplash.com/photo-9999999999999?ixid=xyz&w=1080",
  photographerName: `Mallory "><script>alert(1)</script>`,
  photographerUrl: "https://unsplash.com/@mallory?ref=x",
};

const GENERATED_SOURCE = `<!doctype html><html><head><style>body{margin:0}</style></head><body>
<header id="top"><h1>Kafe Ladadika</h1></header>
<section class="hero">
  <img src="PLACEHOLDER:hero" alt="specialty coffee bar" data-image-query="specialty coffee bar interior" />
  <h2>Specialty coffee, made here</h2>
</section>
<section id="menu">
  <img src="PLACEHOLDER:cakes" alt="homemade cakes" data-image-query="homemade cakes display" />
  <img src="/uploads/our-own-shopfront.jpg" alt="our shopfront" />
</section>
</body></html>`;

const generated = ph.applyResolvedImageUrls(
  GENERATED_SOURCE,
  new Map([
    ["hero", PHOTO_A],
    ["cakes", PHOTO_B],
  ])
);

console.log("== The generator's own output already satisfies the invariant ==");
check("generation leaves nothing uncredited", uncreditedUnsplashImages(generated), []);
ok("the user's own uploaded image is NOT given an Unsplash credit", !/our-own-shopfront[\s\S]{0,400}unsplash-credit/.test(generated));

// ---------------------------------------------------------------------
// WHAT AN EDIT ACTUALLY DOES TO IT.
// ---------------------------------------------------------------------
//
// Each of these is a document in the shape editWebsiteHtml returns:
// a complete page, the photo still present and still hotlinked, and the
// credit damaged in one specific way. They are the cross-product of the
// ways a full-document rewrite can lose an attribution — not a sample.

/** Removes every credit span. The commonest outcome: the model rewrote
 *  the section and did not copy the span forward. */
const dropAllCredits = (html) => html.replace(/<span[^>]*class="unsplash-credit"[\s\S]*?<\/span>/g, "");

/** Removes only the FIRST credit — the model touched the hero and left
 *  the rest of the page alone, which is the literal instruction it was
 *  given. */
const dropFirstCredit = (html) => html.replace(/<span[^>]*class="unsplash-credit"[\s\S]*?<\/span>/, "");

/** Keeps the credit but rewrites the links "cleanly", dropping the
 *  tracking parameters. A tidy-minded model does this on its own. */
const stripUtm = (html) => html.replace(/[?&]utm_source=ionexa(&amp;|&)utm_medium=referral/g, "");

/** Keeps the credit text but flattens the links to plain text. */
const unlinkCredit = (html) =>
  html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, (tag, inner) =>
    /unsplash/i.test(tag) ? inner : tag
  );

/** The model kept everything but re-indented and re-wrapped the markup —
 *  the credit is still there, just no longer on the same line. */
const reflow = (html) => html.replace(/><span class="unsplash-credit"/g, '>\n      <span class="unsplash-credit"');

const EDITS = [
  { name: "the model dropped every credit span", mutate: dropAllCredits },
  { name: "the model dropped only the hero's credit", mutate: dropFirstCredit },
  { name: "the model tidied the utm parameters away", mutate: stripUtm },
  { name: "the model turned the credit links into plain text", mutate: unlinkCredit },
  { name: "the model re-indented the markup (credit intact)", mutate: reflow },
];

console.log("\n== Before enforcement: what an edit leaves behind ==");
for (const edit of EDITS) {
  const damaged = edit.mutate(generated);
  const broken = uncreditedUnsplashImages(damaged);
  const expectedBroken = edit.name.includes("re-indented") ? 0 : 1;
  ok(
    `${edit.name} — the checker can SEE the damage (${broken.length} uncredited)`,
    edit.name.includes("re-indented") ? broken.length === 0 : broken.length >= expectedBroken
  );
}

// ---------------------------------------------------------------------
// THE ENFORCEMENT PASS.
// ---------------------------------------------------------------------

const enforce = ph.enforceUnsplashAttribution;
ok("an enforcement pass exists", typeof enforce === "function");

if (typeof enforce === "function") {
  console.log("\n== After enforcement: every edit ends up compliant ==");
  for (const edit of EDITS) {
    const damaged = edit.mutate(generated);
    const repaired = enforce(damaged).html;
    check(`${edit.name} → repaired`, uncreditedUnsplashImages(repaired), []);
  }

  console.log("\n== It repairs by RESTORING, not by deleting the photo ==");
  const repaired = enforce(dropAllCredits(generated)).html;
  ok("Annie Spratt is named again", /Photo by <a[^>]*>Annie Spratt<\/a> on/.test(repaired));
  ok("Jay Wennington is named again", /Photo by <a[^>]*>Jay Wennington<\/a> on/.test(repaired));
  ok("both photos are still on the page", (repaired.match(/images\.unsplash\.com/g) || []).length >= 2);
  ok("the user's own image is untouched", repaired.includes('src="/uploads/our-own-shopfront.jpg"'));
  check("nothing was reported as removed", enforce(dropAllCredits(generated)).removed, 0);
  ok("the repair is reported", enforce(dropAllCredits(generated)).restored >= 2);

  console.log("\n== It is idempotent ==");
  const once = enforce(generated).html;
  const twice = enforce(once).html;
  // The property is a FIXED POINT, not "the input is unchanged": the
  // first pass legitimately adds the page-level credits block that
  // applyResolvedImageUrls does not emit (see buildPageCreditsBlock —
  // the credit beside the photo is invisible on two of the four layouts
  // a model writes, so the block is the guarantee). Stated as the fixed
  // point AND as "the only difference is that block", so the pass cannot
  // start quietly changing anything else.
  check("enforcing twice equals enforcing once", twice, once);
  check(
    "the only thing the first pass added is the page credits block",
    once.replace(/<div\b[^>]*class="unsplash-page-credits"[\s\S]*?<\/div>/, ""),
    generated
  );
  ok("and there is exactly one of them", (once.match(/unsplash-page-credits/g) || []).length === 1);
  // ASSERTED ON THE STRING, because the browser cannot tell the
  // difference. A block appended after </html> is hoisted into <body> by
  // the HTML parser and renders identically, so the rendered check in
  // unsplash-credit-visible.prodtest.mjs stays green either way — that
  // mutation survived until this line existed. Where the bytes put it is
  // the property the code actually claims.
  ok(
    "the block sits INSIDE </body>, not appended after the document",
    once.indexOf('class="unsplash-page-credits"') < once.lastIndexOf("</body>")
  );
  ok("the document still ends properly", once.trimEnd().endsWith("</html>"));
  ok("still exactly one after a second pass", (twice.match(/unsplash-page-credits/g) || []).length === 1);
  check("a correct document reports no repairs", enforce(generated).restored, 0);
  ok("exactly one credit per photo after two passes", (twice.match(/unsplash-credit/g) || []).length === 2);

  console.log("\n== A photo it cannot attribute is not displayed ==");
  // Both the credit AND the carried photographer are gone — the model
  // rewrote the <img> tag itself. There is no name left anywhere, so the
  // photo cannot be credited, and this codebase's stated rule (see the
  // note on UnsplashPhoto in lib/unsplash.ts) is that a photo we cannot
  // attribute is a photo we are not allowed to display.
  const noProvenance = dropAllCredits(generated).replace(/\sdata-unsplash-[a-z]+="[^"]*"/g, "");
  const result = enforce(noProvenance);
  check("it leaves nothing uncredited", uncreditedUnsplashImages(result.html), []);
  ok("the unattributable photos were removed", result.removed === 2);
  ok("no images.unsplash.com src survives uncredited", !/images\.unsplash\.com/.test(result.html));
  ok("the user's own image still survives", result.html.includes('src="/uploads/our-own-shopfront.jpg"'));

  console.log("\n== The escaping survives the round trip ==");
  const hostilePage = ph.applyResolvedImageUrls(
    `<body><img src="PLACEHOLDER:h" alt="x" data-image-query="x" /></body>`,
    new Map([["h", PHOTO_HOSTILE]])
  );
  const hostileRepaired = enforce(dropAllCredits(hostilePage)).html;
  ok("the restored credit contains no live script tag", !/<script/i.test(hostileRepaired));
  ok("the name is displayed, escaped", hostileRepaired.includes("&lt;script&gt;"));
  ok(
    "a profile URL that already had a query keeps it and gains the utm",
    /unsplash\.com\/@mallory\?ref=x&amp;utm_source=ionexa&amp;utm_medium=referral/.test(hostileRepaired)
  );
  check("the hostile page ends up compliant", uncreditedUnsplashImages(hostileRepaired), []);

  console.log("\n== A document with no Unsplash photos is untouched ==");
  const plain = `<body><img src="/uploads/a.jpg" alt="a"><p>hello</p></body>`;
  check("returned unchanged", enforce(plain).html, plain);
  check("nothing restored", enforce(plain).restored, 0);
  check("nothing removed", enforce(plain).removed, 0);
}

// ---------------------------------------------------------------------
// THE WIRING. A pass nothing calls is a pass that does not exist.
// ---------------------------------------------------------------------
console.log("\n== It runs on every path that stores a document ==");
const generateRoute = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
const editRoute = readFileSync("src/app/api/websites/edit/route.ts", "utf8");

// CALLING IT IS NOT USING IT, and the first version of this test could
// not tell the difference: it matched `= enforceUnsplashAttribution(`,
// which a line that computes the repair and then throws it away still
// satisfies. scripts/tests/unsplash-attribution.mutation.mjs deleted the
// assignment of `.html` back onto the document on both routes and this
// file stayed green. So the assertion is now about the DOCUMENT: the
// variable that gets stored must be reassigned from the enforcement's
// own result.
// GENERATION NOW ENFORCES OVER AN ARRAY, because a site can have more
// than one page and a pass that only ever saw the home page would let a
// sub-page ship an uncredited photograph. The shape differs between the
// two routes, so each is asserted against the shape it actually has —
// what is common is that the enforced result is what gets stored.
ok("generation imports the enforcement pass", /enforceUnsplashAttribution/.test(generateRoute));
ok(
  "generation enforces on EVERY document, not just the home page",
  /const attributions = cleaned\.map\(\(doc\) => enforceUnsplashAttribution\(doc\)\);/.test(generateRoute)
);
ok(
  "...and feeds each enforced document back",
  /cleaned\[i\] = attributions\[i\]\.html;/.test(generateRoute)
);
// THE WHOLE CHAIN, not its first link. Generation now runs
// cleaned -> stripped -> optimised -> stored, and the old assertion
// stopped at `stripped` — so a later stage could have dropped the credit
// and this file would have stayed green while pointing at the stage that
// added it.
ok(
  "...and what is stored comes from that array, through every stage after it",
  /const stripped = cleaned\.map\(/.test(generateRoute) &&
    /const optimised = stripped\.map\(/.test(generateRoute) &&
    /htmlContent = optimised\[0\];/.test(generateRoute) &&
    /html: optimised\[i \+ 1\]/.test(generateRoute)
);

// AND THE STAGES THEMSELVES DO NOT EAT THE CREDIT. Executed, because
// "the pass runs afterwards" says nothing about what it does: the SEO
// pass rewrites the <head> and touches every <img> on the page, which is
// exactly where a credit and its data-unsplash-* provenance live.
{
  const seoHead = await loadTs("src/lib/seo/head.ts");
  const altText = await loadTs("src/lib/seo/alt-text.ts");
  const credited = `<!DOCTYPE html><html lang="en"><head><title>Acme</title></head><body>
<h1>Acme</h1><p>${"A neighbourhood bakery. ".repeat(4)}</p>
<img src="https://images.unsplash.com/photo-x" data-unsplash-photographer="Jo Ma" data-unsplash-profile="https://unsplash.com/@joma?utm_source=ionexa&amp;utm_medium=referral">
<span class="unsplash-credit">Photo by <a href="https://unsplash.com/@joma?utm_source=ionexa&amp;utm_medium=referral">Jo Ma</a> on <a href="https://unsplash.com/?utm_source=ionexa&amp;utm_medium=referral">Unsplash</a></span>
</body></html>`;
  const after = seoHead.enforceSeoHead(altText.enforceImageAltText(credited).html, {
    canonicalUrl: "https://x.test/s/acme",
    siteUrl: "https://x.test/s/acme",
    siteName: "Acme",
  }).html;
  ok("the credit element survives the SEO pass", /class="unsplash-credit"/.test(after));
  ok("...with the photographer still named", /Jo Ma<\/a>/.test(after));
  ok("...and both referral parameters intact",
    (after.match(/utm_source=ionexa&amp;utm_medium=referral/g) ?? []).length >= 3,
    String((after.match(/utm_source=ionexa&amp;utm_medium=referral/g) ?? []).length));
  ok("...and the provenance attributes still on the <img>",
    /data-unsplash-photographer="Jo Ma"/.test(after) && /data-unsplash-profile="/.test(after));
}
{
  const variable = "updatedHtml";
  ok("edit imports the enforcement pass", /enforceUnsplashAttribution/.test(editRoute));
  const call = new RegExp(
    `const (\\w+) = enforceUnsplashAttribution\\(${variable}\\);[\\s\\S]{0,120}?${variable} = \\1\\.html;`
  );
  ok("edit feeds the enforced document back into what is stored", call.test(editRoute));
  // AND THE STORED VALUE IS THAT SAME DOCUMENT. This used to read
  // `html_content: updatedHtml`, which stopped being the whole truth when
  // an edit gained a target: the edited document now goes to
  // html_content OR to one entry of the pages array, and the old
  // assertion was blind to the second — a sub-page could have been
  // stored without the enforcement and this file would have stayed
  // green. So both destinations are asserted, through the one function
  // that decides between them.
  ok(
    "edit hands the enforced document to the writer",
    new RegExp(`applyEditedDocument\\([^)]*, ${variable}\\)`).test(editRoute)
  );
  ok(
    "...and BOTH of that writer's outputs are what get stored",
    /const saved = applyEditedDocument\(/.test(editRoute) &&
      /const nextPages = saved\.pages;/.test(editRoute) &&
      /const nextHomeHtml = saved\.htmlContent;/.test(editRoute) &&
      /html_content: nextHomeHtml, pages: nextPages\.length > 0 \? nextPages : null/.test(editRoute)
  );
  // The writer must actually put it somewhere — a version that returned
  // the site untouched would satisfy every regex above.
  const target = await loadTs("src/lib/publishing/page-edit-target.ts");
  const PAGES = [{ slug: "a", label: "A", html: "<old-a>" }];
  const home = target.applyEditedDocument("<old-home>", PAGES, -1, "<enforced>");
  ok("...and a home edit really stores the enforced document", home.htmlContent === "<enforced>");
  const sub = target.applyEditedDocument("<old-home>", PAGES, 0, "<enforced>");
  ok("...and a sub-page edit really stores it too", sub.pages[0].html === "<enforced>");
}

// Order matters and the compiler cannot see it: enforcement has to run
// AFTER the pass that resolves placeholders into real photos, or there
// are no Unsplash images to check yet.
for (const [label, src, variable] of [
  ["generation", generateRoute, "htmlContent"],
  ["edit", editRoute, "updatedHtml"],
]) {
  // The call gained an argument (the owner's photo-source choice), so the
  // anchor is the call HEAD rather than the whole call — pinned to the
  // opening paren so it cannot match a mention in a comment.
  const resolveAt = src.indexOf(`await resolveWebsiteImagePlaceholders(${variable},`);
  const enforceAt = src.indexOf("enforceUnsplashAttribution(");
  ok(`${label}: enforcement runs after placeholder resolution`, resolveAt !== -1 && enforceAt > resolveAt,
    `resolve at ${resolveAt}, enforce at ${enforceAt}`);
}

// The edit prompt should ask as well as be enforced — the same
// belt-and-braces lib/website-link-safety.ts uses.
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
const editPrompt = builder.slice(builder.indexOf("const EDIT_SYSTEM_PROMPT"), builder.indexOf("function buildEditSystemBlocks"));
// Asserted on the INSTRUCTION, not just the word. A bullet that mentions
// `unsplash-credit` while telling the model it may tidy them up is worse
// than silence, and the mutation run proved a bare substring check
// accepts exactly that.
ok("the edit prompt names the credit markup", /unsplash-credit/.test(editPrompt));
ok("the edit prompt names the provenance attributes", /data-unsplash-/.test(editPrompt));
ok(
  "the edit prompt forbids deleting a credit",
  /Never delete one/i.test(editPrompt)
);
ok(
  "the edit prompt forbids rewording or tidying a credit",
  /never reword one, never "tidy" its links/i.test(editPrompt)
);
ok(
  "the edit prompt says a credit moves with its image",
  /its credit moves with it/i.test(editPrompt)
);
ok(
  "the edit prompt does not permit tidying credits away",
  !/credits? may be tidied/i.test(editPrompt)
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
