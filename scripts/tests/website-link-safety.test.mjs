// A generated site whose own menu sent visitors to our login page.
//
// WHAT WAS REPORTED. On a generated camping site, the links in the top
// menu led to the Ionexa login page instead of to sections of the site.
//
// WHY. A published site is one file served from /s/<subdomain>. The model
// wrote an ordinary multi-page nav — <a href="/about">About</a> — which is
// what a nav looks like everywhere else on the web. A browser resolves
// that against the ORIGIN, not against the page, so the visitor arrives at
// https://<our-domain>/about. That is our route, and ours redirects anyone
// without a session to /login. Every internal link was a door out of the
// customer's site and into our sign-in form.
//
// <base href> is the textbook fix and it is unavailable: the published-site
// CSP sets base-uri 'none' on purpose, so that injected markup cannot
// re-point every URL on the page. Relaxing that to rescue a nav would be
// trading a broken link for a redirect primitive.
//
// So the links themselves are rewritten, deterministically, before the
// document is stored — on the generate path and the edit path both.
//
// Run: node scripts/tests/website-link-safety.test.mjs
import { readFileSync } from "node:fs";

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
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const { loadTs } = await import("./load-ts.mjs");
const ls = await loadTs("src/lib/website-link-safety.ts");

// The reported page, reduced to the part that failed. Every href here is
// one a model plausibly writes and a browser plausibly sends off-site.
const CAMPING_SITE = `<!DOCTYPE html>
<html lang="el">
<head><meta charset="utf-8"><title>Camping Χαλκιδική</title></head>
<body>
  <header>
    <a href="/" class="logo">Camping Χαλκιδική</a>
    <nav>
      <a href="/about">Σχετικά</a>
      <a href="/facilities">Εγκαταστάσεις</a>
      <a href="prices.html">Τιμές</a>
      <a href="./contact">Επικοινωνία</a>
      <a href="/#gallery">Φωτογραφίες</a>
      <a href="#booking">Κράτηση</a>
      <a href="https://maps.google.com/?q=camping" target="_blank" rel="noopener">Χάρτης</a>
      <a href="tel:+302371012345">+30 2371 012345</a>
      <a href="mailto:info@camping.gr">info@camping.gr</a>
    </nav>
  </header>
  <main>
    <section id="about"><h2>Σχετικά</h2></section>
    <section id="facilities"><h2>Εγκαταστάσεις</h2></section>
    <section id="prices"><h2>Τιμές</h2></section>
    <section id="contact-us"><h2>Επικοινωνία</h2>
      <form action="/submit"><input name="email"><button>Send</button></form>
    </section>
    <section id="gallery"><h2>Gallery</h2></section>
    <section id="booking"><h2>Κράτηση</h2></section>
  </main>
</body>
</html>`;

// ---------------------------------------------------------------------
console.log("== 1. the failure, before the fix ==");
// Not a description of the bug — the bug itself, measured. If this section
// ever goes quiet the fixture stopped reproducing the report.
const escapingBefore = ls.findEscapingLinks(CAMPING_SITE);
check(
  `the reported page has links that leave the site (${escapingBefore.length})`,
  escapingBefore.length === 6,
  JSON.stringify(escapingBefore)
);
check("including the logo link to /", escapingBefore.includes("/"));
check("and the nav's /about", escapingBefore.includes("/about"));
check("and a bare prices.html", escapingBefore.includes("prices.html"));
check("and a ./contact relative path", escapingBefore.includes("./contact"));
// I first wrote 5 here and this one is why. "/#gallery" LOOKS like it
// stays on the page — it has a fragment — but the leading slash makes a
// browser resolve it against the origin first, so the visitor goes to
// <our-domain>/#gallery and lands on the login page having apparently
// clicked an in-page anchor. It is the most deceptive member of the set.
check("and /#gallery, which only looks like an in-page anchor", escapingBefore.includes("/#gallery"));

console.log("\n== 2. how a browser at /s/<slug> would read each href ==");
eq("a fragment stays a fragment", ls.classifyHref("#booking"), "anchor");
eq("an empty href is a fragment", ls.classifyHref(""), "anchor");
eq("tel: is not navigation", ls.classifyHref("tel:+302371012345"), "scheme");
eq("mailto: is not navigation", ls.classifyHref("mailto:a@b.gr"), "scheme");
eq("an absolute URL is external", ls.classifyHref("https://maps.google.com/?q=x"), "external");
// Protocol-relative reads like a path and is absolute to a browser.
// Classifying it as internal would silently break a real external link.
eq("a protocol-relative URL is external, not a path", ls.classifyHref("//maps.google.com/x"), "external");
eq("a root-relative path is the bug", ls.classifyHref("/about"), "internal-path");
eq("so is a bare filename", ls.classifyHref("prices.html"), "internal-path");
eq("so is ./something", ls.classifyHref("./contact"), "internal-path");
eq("javascript: is refused outright", ls.classifyHref("javascript:alert(1)"), "dangerous-scheme");
eq("and so is data:", ls.classifyHref("data:text/html,<script>"), "dangerous-scheme");

console.log("\n== 3. the slug an internal path was aiming at ==");
eq("/about", ls.internalHrefSlug("/about"), "about");
eq("prices.html loses the extension", ls.internalHrefSlug("prices.html"), "prices");
eq("./contact", ls.internalHrefSlug("./contact"), "contact");
eq("a trailing slash is not a slug", ls.internalHrefSlug("/pages/about/"), "about");
eq("the root means the top of the page", ls.internalHrefSlug("/"), "");
eq("index.html means the top too", ls.internalHrefSlug("/index.html"), "");
// An href that already carries a fragment said what it wanted.
eq("an existing fragment wins", ls.internalHrefSlug("/about#team"), "team");
eq("/#gallery is just gallery", ls.internalHrefSlug("/#gallery"), "gallery");
eq("a query string is not part of the slug", ls.internalHrefSlug("/about?ref=nav"), "about");

console.log("\n== 4. the anchor it becomes must EXIST ==");
// The way this 'fix' fails quietly: every link becomes #something and half
// of them jump nowhere. So the slug is matched against the ids the
// document actually has.
const ids = ls.collectAnchorTargets(CAMPING_SITE);
check("the document's ids are found", ids.includes("about") && ids.includes("gallery"));
check(
  "form field names are NOT treated as jump targets",
  !ids.includes("email"),
  JSON.stringify(ids)
);
eq("an exact id is used", ls.resolveInternalHref("/about", ids), "#about");
eq("a near miss still lands somewhere real", ls.resolveInternalHref("./contact", ids), "#contact-us");
eq("the root goes to the top", ls.resolveInternalHref("/", ids), "#");
eq("a slug with no section at all goes to the top, not to a dead anchor", ls.resolveInternalHref("/careers", ids), "#");
// Both sides of the substring match need a length floor, or a document
// with id="a" swallows every slug containing an "a".
eq("a one-character id never matches", ls.resolveInternalHref("/about", ["a"]), "#");

console.log("\n== 5. the rewrite, on the reported page ==");
const fixed = ls.makeGeneratedLinksSafe(CAMPING_SITE);
const escapingAfter = ls.findEscapingLinks(fixed.html);
check(`no link leaves the site any more (${escapingAfter.length})`, escapingAfter.length === 0, JSON.stringify(escapingAfter));
check('the nav\'s /about became #about', /href="#about"/.test(fixed.html));
check("/facilities became #facilities", /href="#facilities"/.test(fixed.html));
check("prices.html became #prices", /href="#prices"/.test(fixed.html));
check("./contact became #contact-us", /href="#contact-us"/.test(fixed.html));
check("the logo's / became #", /class="logo"/.test(fixed.html) && /href="#"[^>]*class="logo"/.test(fixed.html));
check("/#gallery became a real in-page anchor", /href="#gallery"/.test(fixed.html));
check(
  `all six internal links were rewritten (${fixed.rewrites.length} rewrites in total, including the form action)`,
  fixed.rewrites.filter((r) => r.reason === "internal-path").length === 6
);

console.log("\n== 6. what must NOT be touched ==");
// Rewriting these would break the site in the other direction — the owner
// genuinely wants them.
check("the Google Maps link survives intact", /href="https:\/\/maps\.google\.com\/\?q=camping"/.test(fixed.html));
check("the phone link survives", /href="tel:\+302371012345"/.test(fixed.html));
check("the email link survives", /href="mailto:info@camping\.gr"/.test(fixed.html));
check("an anchor that was already an anchor is untouched", /href="#booking"/.test(fixed.html));
check("external hosts are reported rather than guessed at", fixed.externalHosts.includes("maps.google.com"));
eq("and only the ones actually present", fixed.externalHosts.length, 1);
check(
  "target=_blank is kept on the EXTERNAL link",
  /maps\.google\.com[^>]*target="_blank"/.test(fixed.html)
);
check("the page's own content is unchanged", fixed.html.includes("<h2>Εγκαταστάσεις</h2>"));

console.log("\n== 7. the other ways out of the page ==");
// A <base> re-points every relative URL at once. The CSP already blocks
// it, so in a served page it is dead markup — but a DOWNLOADED file has no
// CSP, and download is a supported way to use these sites.
const withBase = ls.makeGeneratedLinksSafe('<html><head><base href="https://elsewhere.com/"></head><body><a href="/x">x</a></body></html>');
check("a <base> tag is removed", !/<base/i.test(withBase.html));
check("and recorded as a rewrite", withBase.rewrites.some((r) => r.reason === "base-tag"));

const withJs = ls.makeGeneratedLinksSafe('<a href="javascript:fetch(\'//evil\')">Click</a>');
eq("a javascript: href becomes inert", withJs.html.includes('href="#"'), true);
check("and is recorded as what it was", withJs.rewrites.some((r) => r.reason === "dangerous-scheme"));

// A form action that is a path posts to /s/<subdomain>, which serves GET
// only — a 405 on the visitor's enquiry.
check("a path form action is dropped", !/action="\/submit"/.test(fixed.html));
check("and recorded", fixed.rewrites.some((r) => r.reason === "form-action"));
const extForm = ls.makeGeneratedLinksSafe('<form action="https://formspree.io/f/abc"><input name="e"></form>');
check(
  "an absolute form action the owner chose is left alone",
  /action="https:\/\/formspree\.io\/f\/abc"/.test(extForm.html)
);

console.log("\n== 8. an in-page anchor must not open a second tab ==");
// target="_blank" on an internal link, once it becomes #section, opens a
// duplicate copy of the same page — worse than the link it replaced.
const blank = ls.makeGeneratedLinksSafe(
  '<a href="/about" target="_blank" rel="noopener noreferrer">About</a><section id="about"></section>'
);
check("the anchor points into the page", /href="#about"/.test(blank.html));
check("and no longer opens a new tab", !/target=/.test(blank.html));

console.log("\n== 9. quoting and casing the model actually produces ==");
const singles = ls.makeGeneratedLinksSafe("<a href='/about'>x</a><section id='about'></section>");
check("single-quoted hrefs are handled", /href='#about'/.test(singles.html));
const upper = ls.makeGeneratedLinksSafe('<A HREF="/about">x</A><section id="about"></section>');
check("uppercase tags and attributes are handled", /#about/.test(upper.html));
const idempotent = ls.makeGeneratedLinksSafe(fixed.html);
eq("running it twice changes nothing more", idempotent.rewrites.filter((r) => r.reason === "internal-path").length, 0);
eq("and produces identical bytes", idempotent.html, fixed.html);

console.log("\n== 10. it is wired into every path that stores HTML ==");
// A pure function nobody calls is not a fix.
const genRoute = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
const editRoute = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
const publishRoute = readFileSync("src/app/api/websites/[id]/publish/route.ts", "utf8");
for (const [label, src] of [["generation", genRoute], ["edit", editRoute], ["publish", publishRoute]]) {
  check(`${label} imports the enforcement pass`, /from "@\/lib\/website-link-safety"/.test(src));
  check(`${label} calls it`, /makeGeneratedLinksSafe\(/.test(src));
}

// My first version of this asserted `call < first html_content:` and it
// failed on the generation route for a reason worth keeping. The FIRST
// html_content write there is the throttled live-preview save inside
// onDelta — a partial document, written every 1.5s so the polling client
// can watch the page being typed. Sanitising a half-finished document
// would be pointless (the next tick overwrites it) and the assertion was
// simply measuring the wrong write.
//
// The real invariant is about the FINISHED document, so that is what is
// checked: the preview write stores the streaming buffer, every other
// write stores the sanitised variable, and the sanitiser runs before them.
const previewWrites = [...genRoute.matchAll(/html_content:\s*(\w+)/g)].map((m) => m[1]);
check(
  `the generation route writes html_content ${previewWrites.length} times: ${previewWrites.join(", ")}`,
  previewWrites.length >= 2
);
check(
  "the only unsanitised write is the streaming live-preview buffer",
  previewWrites.filter((v) => v !== "htmlContent").every((v) => v === "accumulatedText"),
  previewWrites.join(", ")
);
check(
  "and that write is inside the throttled onDelta preview handler",
  /const onDelta = \([\s\S]{0,400}html_content: accumulatedText/.test(genRoute)
);
const sanitiseAt = genRoute.indexOf("makeGeneratedLinksSafe(");
const finalWriteAt = genRoute.lastIndexOf("html_content: htmlContent");
check("the sanitiser runs before the finished document is stored", sanitiseAt > 0 && sanitiseAt < finalWriteAt);

// Publish is the boundary that matters most: it is where HTML becomes a
// public page, and it is the only place that can repair a site generated
// before this fix existed.
// FOLLOWED TO WHAT IS ACTUALLY STORED. Publishing gained a stage — the
// address-dependent SEO pass — between sanitising and writing, so an
// assertion that stopped at the sanitiser would go on passing while the
// stored value came from somewhere else entirely.
check(
  "publish sanitises the home document",
  /const html = makeGeneratedLinksSafe\(\s*stripDisallowedExternalScripts\(website\.html_content\),\s*siteContext\s*\)\.html;/.test(publishRoute)
);
check(
  "...and the value it stores is derived from it",
  /const publishedHtml = seoFor\(html, siteBaseUrl, \[\]\);/.test(publishRoute) &&
    (publishRoute.match(/html_content: publishedHtml,/g) ?? []).length === 3
);
check(
  "...and every sub-page is sanitised the same way",
  /html: makeGeneratedLinksSafe\(stripDisallowedExternalScripts\(pg\.html\), siteContext\)\.html,/.test(publishRoute)
);
// THE SITE CONTEXT IS WHAT MAKES A NAV LINK SURVIVABLE. Without it every
// link to another page of the site was rewritten to "#".
check(
  "...knowing the site's own pages and where it is served",
  /pageSlugs: draftPages\.map\(\(pg\) => pg\.slug\),/.test(publishRoute) &&
    /basePath: publishedSiteBasePath\(subdomain\),/.test(publishRoute)
);
check("and a partial generation can never be published at all", /website\.status !== "completed"/.test(publishRoute));

console.log("\n== 11. the prompt asks for it too ==");
// Enforcement is the guarantee; the prompt is what stops the model
// producing a nav whose every item has to be rewritten.
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
check("the system prompt forbids root-relative internal links", /INTERNAL LINKS/.test(builder));
// TWO FORMS NOW, and naming only one is how the prompt came to
// contradict itself: it told the model "there is no /about page" in this
// section while asking for a nav linking to every page in another.
check("and says what to use for a section of the page", /href="#/.test(builder));
check("and what to use for another page of the site",
  /bare slug of a page you actually wrote/.test(builder) && /href="about"/.test(builder));
check("and no longer claims one file is the whole site",
  !/single file is the whole site/i.test(builder) && !/THIS PAGE IS THE WHOLE SITE/.test(builder));
check("while still naming the form that breaks", /NEVER href="\/about"/.test(builder));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
