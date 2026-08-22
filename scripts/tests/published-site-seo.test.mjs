// FINDABLE ON THE WEB — and honest about what it claims.
//
// The dangerous failure here is not "the tags are missing", which any
// crawler reports. It is a tag that is PRESENT and WRONG: a canonical
// pointing at a previous address, a LocalBusiness schema asserting an
// address the page never showed, an alt attribute reading "Image", a
// description that is the site's CSS. Every one of those passes an
// automated "has SEO" check and every one is worse than nothing.
//
// So this executes the real functions over real documents rather than
// reading the source for patterns. The one thing it CANNOT do is prove
// what the model writes — see section 8 for what is asserted about the
// prompt and what is deliberately not claimed.
//
// Run: node scripts/tests/published-site-seo.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const facts = await loadTs("src/lib/seo/facts.ts");
const head = await loadTs("src/lib/seo/head.ts");
const alt = await loadTs("src/lib/seo/alt-text.ts");
const sd = await loadTs("src/lib/seo/structured-data.ts");
const nap = await loadTs("src/lib/seo/nap.ts");
const sitemap = await loadTs("src/lib/seo/sitemap.ts");

const jsonLdOf = (html) => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
};
const metaOf = (html, key) => {
  const re = new RegExp(`<meta (?:name|property)="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" content="([^"]*)"`, "i");
  const m = re.exec(html);
  return m ? m[1] : null;
};

// A realistic generated page: the shape the prompt asks for.
const BAKERY = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Φούρνος Αστέρι</title>
<meta name="description" content="Παραδοσιακός φούρνος στην Καλαμαριά με προζύμι, ζυμώνουμε κάθε πρωί από τις πέντε.">
<style>body{margin:0;font-family:system-ui}</style></head>
<body><header><h1 data-seo-name="Φούρνος Αστέρι" data-seo-type="Bakery">Φούρνος Αστέρι</h1></header>
<p>Ζυμώνουμε με προζύμι κάθε πρωί από τις πέντε, στην ίδια γωνία της Καλαμαριάς εδώ και τριάντα χρόνια.</p>
<img src="https://images.unsplash.com/photo-a" data-image-query="sourdough loaves cooling on a rack">
<img src="https://images.unsplash.com/photo-b">
<address data-seo-address="Κομνηνών 8" data-seo-locality="Καλαμαριά">Κομνηνών 8, Καλαμαριά</address>
<p data-seo-hours>Mo-Fr 06:00-20:00</p><p data-seo-hours>Sa 07:00-15:00</p>
<span data-seo-price-range="€"></span><span data-seo-geo="40.5800,22.9500"></span>
<a href="tel:+302310444555">2310 444 555</a><a href="mailto:hi@asteri.gr">hi@asteri.gr</a>
<a href="https://facebook.com/asteri">Facebook</a>
<details><summary>Έχετε χωρίς γλουτένη;</summary><p>Κάθε Πέμπτη.</p></details>
</body></html>`;

console.log("== 1. facts come off the PAGE, and only off the page ==");
{
  const f = facts.extractSeoFacts(BAKERY);
  ok("the title is read", f.title === "Φούρνος Αστέρι", f.title);
  ok("the business name is read", f.businessName === "Φούρνος Αστέρι", f.businessName);
  ok("the declared type is read", f.businessType === "Bakery", f.businessType);
  ok("the address is read", f.address === "Κομνηνών 8", f.address);
  ok("the locality is read", f.locality === "Καλαμαριά", f.locality);
  ok("the phone comes from the tel: link", f.phone === "+302310444555", f.phone);
  ok("the email comes from the mailto: link", f.email === "hi@asteri.gr", f.email);
  // THE BUG THIS CAUGHT FOR REAL: two identical <p data-seo-hours> tags
  // both resolved to the FIRST one, so a bakery's Saturday hours were
  // published as its weekday hours.
  ok("BOTH hours lines are read, distinctly",
    f.openingHours.join(" | ") === "Mo-Fr 06:00-20:00 | Sa 07:00-15:00", f.openingHours.join(" | "));
  ok("the price range is read", f.priceRange === "€", f.priceRange);
  ok("the coordinates are read", f.geo?.lat === 40.58 && f.geo?.lng === 22.95, JSON.stringify(f.geo));
  ok("the social profile is read", f.sameAs.join() === "https://facebook.com/asteri", f.sameAs.join());
  ok("the FAQ is read", f.faqs.length === 1 && f.faqs[0].answer === "Κάθε Πέμπτη.", JSON.stringify(f.faqs));
  // CSS IS NOT PROSE — asserted on the reader itself.
  //
  // The fixture below never proved this: CSS contains no <p> elements,
  // so the paragraph list was clean whether or not <style> was stripped.
  // The property is real and belongs to textOf, which reads WHOLE
  // fragments, so it is checked there.
  const text = await loadTs("src/lib/seo/html-text.ts");
  const styled = `<html><head><style>body{margin:0;font-family:system-ui}</style></head><body><h1>Hi</h1></body></html>`;
  ok("textOf does not return a document's CSS",
    text.textOf(styled) === "Hi", JSON.stringify(text.textOf(styled)));
  const scripted = `<html><body><script>const x = "hello from a script";</script><p>Real copy.</p></body></html>`;
  ok("...nor its JavaScript", !text.textOf(scripted).includes("hello from a script"), text.textOf(scripted));
  ok("the CSS is not mistaken for prose", !f.paragraphs.some((p) => /font-family|margin:0/.test(p)),
    f.paragraphs.join(" | ").slice(0, 120));
  ok("the real paragraph IS read", f.paragraphs.some((p) => p.startsWith("Ζυμώνουμε")));

  // NOTHING IS INVENTED. A page that says none of this must produce none.
  const bare = facts.extractSeoFacts(`<!DOCTYPE html><html><head><title>x</title></head><body><h1>Hi</h1></body></html>`);
  for (const field of ["address", "phone", "email", "priceRange", "geo", "businessType", "locality", "published"]) {
    ok(`a silent page invents no ${field}`, bare[field] === null, JSON.stringify(bare[field]));
  }
  ok("...and no hours", bare.openingHours.length === 0);
  ok("...and no FAQ", bare.faqs.length === 0);
  ok("...and no social links", bare.sameAs.length === 0);
  // A NUMBER IN THE COPY IS NOT A PHONE NUMBER. It is a year, a price or
  // a street number about as often — and a schema publishing one as the
  // business's phone sends somebody to ring it.
  const numeric = facts.extractSeoFacts(
    `<html><body><h1>Acme</h1><p>Στην ίδια γωνία 1992 - 2026, τριάντα τέσσερα χρόνια στην ίδια γειτονιά.</p></body></html>`
  );
  ok("a page with numbers but no tel: link has no phone", numeric.phone === null, numeric.phone);
}

console.log("\n== 2. every attribute-quoting style a model writes ==");
{
  // Reading only double quotes means a page written with single quotes
  // silently has no facts, no schema and no alt — while looking fine.
  const forms = [
    ['double', `<img src="a.jpg" data-image-query="a red door">`],
    ['single', `<img src='a.jpg' data-image-query='a red door'>`],
    ['unquoted', `<img src=a.jpg data-image-query="a red door">`],
  ];
  for (const [label, tag] of forms) {
    const f = facts.extractSeoFacts(`<html><body>${tag}</body></html>`);
    ok(`${label} quotes: the image is seen`, f.images.length === 1, JSON.stringify(f.images));
    ok(`${label} quotes: its query is read`, f.images[0]?.query === "a red door", f.images[0]?.query);
  }
}

console.log("\n== 3. alt text: real where there is a source, empty where there is not ==");
{
  const r = alt.enforceImageAltText(`<html><body>
<img src="https://x/1" data-image-query="sourdough loaves cooling">
<img src="https://x/2" alt="Already described">
<img src="https://x/3" alt="">
<figure><img src="https://x/4"><figcaption>The counter at opening time</figcaption></figure>
<img src="/photos/stone-oven-interior.jpg">
<img src="https://images.unsplash.com/photo-1521302200538.jpg">
</body></html>`);
  const alts = [...r.html.matchAll(/<img[^>]*\balt="([^"]*)"/g)].map((m) => m[1]);
  ok("the search phrase becomes the alt", alts[0] === "Sourdough loaves cooling", alts[0]);
  ok("an existing alt is untouched", alts[1] === "Already described", alts[1]);
  ok("an explicitly decorative alt stays empty", alts[2] === "", JSON.stringify(alts[2]));
  ok("a figcaption becomes the alt", alts[3] === "The counter at opening time", alts[3]);
  ok("a descriptive filename becomes the alt", alts[4] === "Stone oven interior", alts[4]);
  // THE LINE THIS PASS WILL NOT CROSS. A stock-library id is not a
  // description, and "Photo 1521302200538" is worse to hear than silence.
  ok("a meaningless filename becomes alt=\"\", not a guess", alts[5] === "", JSON.stringify(alts[5]));
  // AND A FILENAME MADE ONLY OF GENERIC WORDS IS ALSO NOT A DESCRIPTION.
  // "Image photo large" clears any word-count check and tells a listener
  // nothing they did not already know from the word "image".
  const generic = alt.enforceImageAltText(`<html><body><img src="/img/image-photo-large.png"></body></html>`);
  ok("a filename of only generic words becomes alt=\"\"",
    /<img alt=""/.test(generic.html), generic.html);
  ok("EVERY image ends up with an alt attribute",
    (r.html.match(/<img\b/g) ?? []).length === alts.length, `${(r.html.match(/<img\b/g) ?? []).length} imgs, ${alts.length} alts`);
  ok("...and nothing is described that was not on the page",
    !alts.some((a) => /^(image|photo|picture)$/i.test(a)), alts.join(" | "));
  ok("the counts add up", r.filled === 3 && r.untouched === 2 && r.markedDecorative === 1,
    JSON.stringify({ filled: r.filled, untouched: r.untouched, decorative: r.markedDecorative }));
}

console.log("\n== 4. the head, built and then rebuilt identically ==");
{
  const ctx = {
    canonicalUrl: "https://ionexa.app/s/asteri",
    siteUrl: "https://ionexa.app/s/asteri",
    siteName: "Φούρνος Αστέρι",
    breadcrumb: [],
    nap: null,
  };
  const once = head.enforceSeoHead(alt.enforceImageAltText(BAKERY).html, ctx);
  const html = once.html;
  ok("a canonical is emitted", /<link rel="canonical" href="https:\/\/ionexa\.app\/s\/asteri">/.test(html));
  ok("og:url matches the canonical", metaOf(html, "og:url") === ctx.canonicalUrl, metaOf(html, "og:url"));
  ok("og:title is the page's own title", metaOf(html, "og:title") === "Φούρνος Αστέρι", metaOf(html, "og:title"));
  ok("og:description is the page's own description",
    (metaOf(html, "og:description") ?? "").startsWith("Παραδοσιακός φούρνος"), metaOf(html, "og:description"));
  ok("og:image is an ABSOLUTE url", /^https:\/\//.test(metaOf(html, "og:image") ?? ""), metaOf(html, "og:image"));
  ok("og:locale comes from the document's lang", metaOf(html, "og:locale") === "el", metaOf(html, "og:locale"));
  ok("the twitter card is the large one when there IS an image",
    metaOf(html, "twitter:card") === "summary_large_image", metaOf(html, "twitter:card"));
  ok("keywords are phrases the page uses",
    (metaOf(html, "keywords") ?? "").includes("Καλαμαριά"), metaOf(html, "keywords"));
  ok("og:type is website for a page that is not an article",
    metaOf(html, "og:type") === "website", metaOf(html, "og:type"));

  // EXACTLY ONE OF EACH. A model that wrote its own description plus
  // ours is two descriptions, and a crawler picks one at random.
  for (const key of ["description", "og:title", "og:description", "twitter:card"]) {
    const count = (html.match(new RegExp(`(?:name|property)="${key}"`, "g")) ?? []).length;
    ok(`exactly one ${key}`, count === 1, String(count));
  }
  ok("exactly one <title>", (html.match(/<title>/g) ?? []).length === 1);
  ok("exactly one JSON-LD block", (html.match(/application\/ld\+json/g) ?? []).length === 1);

  // IDEMPOTENT. This runs again on EVERY publish; a pass that appends
  // grows a document without bound and duplicates every tag.
  const twice = head.enforceSeoHead(once.html, ctx);
  ok("re-running produces a byte-identical document", twice.html === once.html,
    `${once.html.length} vs ${twice.html.length} chars`);
  const thrice = head.enforceSeoHead(twice.html, ctx);
  ok("...and a third time too", thrice.html === once.html);

  // A PAGE WITH NOTHING TO SAY SAYS NOTHING.
  const bare = head.enforceSeoHead(`<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>`, {});
  ok("no canonical without an address", !/rel="canonical"/.test(bare.html));
  ok("no og:url without an address", metaOf(bare.html, "og:url") === null);
  ok("no og:image without an image", metaOf(bare.html, "og:image") === null);
  // A RELATIVE src IS NOT AN og:image. The crawler fetching the card has
  // no page context, so a relative path resolves against nothing and the
  // preview is a broken box.
  const relativeOnly = head.enforceSeoHead(
    `<html><head><title>Acme</title></head><body><h1>Acme</h1><img src="/photos/a.jpg" alt="A"></body></html>`,
    { canonicalUrl: "https://x.test/s/a" }
  ).html;
  ok("a page whose only image is relative gets no og:image",
    metaOf(relativeOnly, "og:image") === null, metaOf(relativeOnly, "og:image"));
  ok("...and the small twitter card", metaOf(relativeOnly, "twitter:card") === "summary");
  ok("the small twitter card without an image", metaOf(bare.html, "twitter:card") === "summary");
}

console.log("\n== 5. structured data: supported, valid, and impossible to break out of ==");
{
  const ctx = {
    canonicalUrl: "https://ionexa.app/s/asteri",
    siteUrl: "https://ionexa.app/s/asteri",
    siteName: "Φούρνος Αστέρι",
    breadcrumb: [],
    nap: null,
  };
  const html = head.enforceSeoHead(alt.enforceImageAltText(BAKERY).html, ctx).html;
  const ld = jsonLdOf(html);
  ok("the block is valid JSON", ld !== null);
  const nodes = ld["@graph"] ?? [ld];
  const byType = Object.fromEntries(nodes.map((n) => [n["@type"], n]));
  ok("the schema context is schema.org", ld["@context"] === "https://schema.org");

  const biz = byType.Bakery;
  ok("the declared type is used", Boolean(biz), Object.keys(byType).join(","));
  ok("...with the name off the page", biz?.name === "Φούρνος Αστέρι");
  ok("...the address off the page", biz?.address?.streetAddress === "Κομνηνών 8");
  ok("...the locality off the page", biz?.address?.addressLocality === "Καλαμαριά");
  ok("...the phone off the page", biz?.telephone === "+302310444555");
  ok("...both hours lines, distinctly",
    Array.isArray(biz?.openingHours) && biz.openingHours.join("|") === "Mo-Fr 06:00-20:00|Sa 07:00-15:00",
    JSON.stringify(biz?.openingHours));
  ok("...the coordinates as numbers", biz?.geo?.latitude === 40.58 && biz?.geo?.longitude === 22.95);
  ok("...and the social profile", biz?.sameAs?.[0] === "https://facebook.com/asteri");
  ok("the FAQ becomes a FAQPage", byType.FAQPage?.mainEntity?.length === 1);
  ok("...with the answer as an Answer", byType.FAQPage?.mainEntity?.[0]?.acceptedAnswer?.text === "Κάθε Πέμπτη.");

  // AN INVENTED @type IS AN UNPARSEABLE NODE.
  ok("a made-up type falls back to LocalBusiness",
    sd.normaliseBusinessType("Coffee Shop") === "LocalBusiness");
  ok("a real type is kept", sd.normaliseBusinessType("Bakery") === "Bakery");
  ok("...case-insensitively", sd.normaliseBusinessType("restaurant") === "Restaurant");
  ok("nothing declared is LocalBusiness", sd.normaliseBusinessType(null) === "LocalBusiness");

  // A CLAIM WE CANNOT SUPPORT IS NOT MADE.
  const noContact = head.enforceSeoHead(
    `<html><head><title>Acme</title></head><body><h1>Acme</h1><p>${"x".repeat(60)}</p></body></html>`,
    { canonicalUrl: "https://x.test/s/a", siteUrl: "https://x.test/s/a", siteName: "Acme" }
  ).html;
  const noContactLd = jsonLdOf(noContact);
  const noContactTypes = (noContactLd?.["@graph"] ?? [noContactLd]).map((n) => n?.["@type"]);
  ok("a business with no address and no phone emits no LocalBusiness",
    !noContactTypes.includes("LocalBusiness"), noContactTypes.join(","));

  // AN OFFER NEEDS BOTH HALVES.
  const priced = facts.extractSeoFacts(`<html><body><div data-seo-product="Καρβέλι" data-seo-price="3.50" data-seo-currency="EUR">x</div><div data-seo-product="Τσουρέκι">y</div></body></html>`);
  const products = sd.buildStructuredData(priced, { url: null, siteUrl: null, siteName: null, imageUrl: null, breadcrumb: [], nap: null })
    .filter((n) => n["@type"] === "Product");
  ok("a product with a price gets an Offer", products[0]?.offers?.price === "3.50", JSON.stringify(products[0]));
  ok("...in the stated currency", products[0]?.offers?.priceCurrency === "EUR");
  ok("a product with no price gets no Offer", products[1] && products[1].offers === undefined, JSON.stringify(products[1]));
  // HALF AN OFFER IS NOT AN OFFER. "12.50" with no currency is not a
  // price, and a currency with no price is nothing at all — Google
  // rejects the offer rather than assuming euros, so emitting one is
  // strictly worse than leaving it out.
  const halfOffers = facts.extractSeoFacts(
    `<html><body><div data-seo-product="A" data-seo-price="9.90">x</div><div data-seo-product="B" data-seo-currency="EUR">y</div></body></html>`
  );
  const halves = sd.buildStructuredData(halfOffers, { url: null, siteUrl: null, siteName: null, imageUrl: null, breadcrumb: [], nap: null })
    .filter((n) => n["@type"] === "Product");
  ok("a price with no currency gets no Offer", halves[0]?.offers === undefined, JSON.stringify(halves[0]));
  ok("a currency with no price gets no Offer", halves[1]?.offers === undefined, JSON.stringify(halves[1]));

  // THE BREAKOUT. This is the one place model-written text goes inside a
  // <script> served to the public from our origin.
  const evil = sd.serialiseJsonLd([{ "@type": "LocalBusiness", name: 'X</script><script>alert(1)</script>' }]);
  ok("a </script> in a business name cannot close our block",
    (evil.match(/<script/gi) ?? []).length === 1, evil.slice(0, 160));
  ok("...and it still parses back to the identical string",
    JSON.parse(evil.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")).name === 'X</script><script>alert(1)</script>');
  ok("...and no raw < survives anywhere in the payload", !/[<]/.test(evil.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")));
}

console.log("\n== 6. one business, one name/address/phone, across every page ==");
{
  const home = `<html><body><h1 data-seo-name="Φούρνος Αστέρι">Φούρνος Αστέρι</h1><address>Κομνηνών 8</address><a href="tel:+302310444555">x</a></body></html>`;
  const agrees = `<html><body><h1 data-seo-name="Φούρνος Αστέρι">Φούρνος Αστέρι</h1><address>Κομνηνών  8</address><a href="tel:2310444555">x</a></body></html>`;
  const differs = `<html><body><h1 data-seo-name="Φούρνος Αστέρι">Φούρνος Αστέρι</h1><address>Κομνηνών 8Α</address><a href="tel:+302310444999">x</a></body></html>`;
  const silent = `<html><body><h1 data-seo-name="Φούρνος Αστέρι">Φούρνος Αστέρι</h1><p>Τίποτα εδώ.</p></body></html>`;

  const clean = nap.siteNap([{ label: "home", html: home }, { label: "about", html: agrees }]);
  ok("whitespace differences are not a disagreement", clean.disagreements.length === 0, JSON.stringify(clean.disagreements));
  ok("a phone written with and without a country code is one number",
    !clean.disagreements.some((d) => d.field === "phone"), JSON.stringify(clean.disagreements));

  const dirty = nap.siteNap([{ label: "home", html: home }, { label: "contact", html: differs }]);
  ok("a genuinely different address IS reported",
    dirty.disagreements.some((d) => d.field === "address" && d.page === "contact"), JSON.stringify(dirty.disagreements));
  ok("a genuinely different phone IS reported",
    dirty.disagreements.some((d) => d.field === "phone"), JSON.stringify(dirty.disagreements));
  ok("the home page's answer is the one used", dirty.nap.address === "Κομνηνών 8", dirty.nap.address);

  const quiet = nap.siteNap([{ label: "home", html: home }, { label: "services", html: silent }]);
  ok("a page that simply does not state the address is not a disagreement",
    quiet.disagreements.length === 0, JSON.stringify(quiet.disagreements));

  // AND THE SCHEMA USES IT. A sub-page whose own footer is wrong still
  // publishes the site's one answer.
  const subPage = head.enforceSeoHead(differs, {
    canonicalUrl: "https://x.test/s/a/contact",
    siteUrl: "https://x.test/s/a",
    siteName: "Φούρνος Αστέρι",
    nap: dirty.nap,
  }).html;
  const ld = jsonLdOf(subPage);
  const biz = (ld["@graph"] ?? [ld]).find((n) => String(n["@type"]).includes("Business") || n["@type"] === "Bakery");
  ok("the sub-page's schema carries the SITE's address, not its own",
    biz?.address?.streetAddress === "Κομνηνών 8", JSON.stringify(biz?.address));
  ok("...and the site's phone", biz?.telephone === "+302310444555", biz?.telephone);
}

console.log("\n== 7. sitemap and robots ==");
{
  const entries = sitemap.siteSitemapEntries("https://ionexa.app/s/asteri/", ["about", "menu"], "2026-08-22T10:00:00.000Z");
  const xml = sitemap.buildSitemapXml(entries);
  ok("the home page is listed once, without a trailing slash",
    (xml.match(/<loc>https:\/\/ionexa\.app\/s\/asteri<\/loc>/g) ?? []).length === 1, xml);
  ok("every page is listed", /<loc>https:\/\/ionexa\.app\/s\/asteri\/about<\/loc>/.test(xml) && /<loc>https:\/\/ionexa\.app\/s\/asteri\/menu<\/loc>/.test(xml));
  ok("the home page ranks above the rest", /asteri<\/loc>\s*<lastmod>[^<]*<\/lastmod>\s*<priority>1\.0<\/priority>/.test(xml), xml);
  ok("lastmod is a valid ISO timestamp", /<lastmod>2026-08-22T10:00:00\.000Z<\/lastmod>/.test(xml));
  ok("it declares the sitemaps.org namespace", xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  ok("it starts with an XML declaration", xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));

  // AN INVALID DATE MUST NOT INVALIDATE THE WHOLE DOCUMENT.
  const badDate = sitemap.buildSitemapXml([{ loc: "https://x.test/a", lastModified: "not a date" }]);
  ok("an unparseable date is omitted, not written as Invalid Date",
    !/Invalid/.test(badDate) && !/<lastmod>/.test(badDate), badDate);
  // A RELATIVE URL IS NOT A SITEMAP ENTRY.
  const relative = sitemap.buildSitemapXml([{ loc: "/about" }, { loc: "https://x.test/a" }]);
  ok("a non-absolute loc is dropped", (relative.match(/<loc>/g) ?? []).length === 1, relative);
  // XML ESCAPING.
  const amp = sitemap.buildSitemapXml([{ loc: "https://x.test/a?x=1&y=2" }]);
  ok("an ampersand is escaped", amp.includes("&amp;") && !/&(?!amp;)/.test(amp), amp);

  const robots = sitemap.buildRobotsTxt("https://ionexa.app/s/asteri");
  ok("robots points at the site's own sitemap", robots.includes("Sitemap: https://ionexa.app/s/asteri/sitemap.xml"), robots);
  ok("...and allows the site's own path", robots.includes("Allow: /s/asteri"), robots);
  const rootRobots = sitemap.buildRobotsTxt("https://acme.example.com");
  ok("a site on its own host allows /", rootRobots.includes("Allow: /"), rootRobots);

  // THE ROBOTS FILE A CRAWLER ACTUALLY READS.
  const appRobots = readFileSync("src/app/robots.ts", "utf8");
  ok("the app's own robots.txt names /s/ explicitly", /allow:\s*\[[^\]]*"\/s\/"/.test(appRobots), appRobots.match(/allow:[^\n]*/)?.[0]);
  ok("...and does not disallow it", !/disallow:\s*\[[^\]]*"\/s/.test(appRobots));
  const appSitemap = readFileSync("src/app/sitemap.ts", "utf8");
  ok("the app's sitemap lists published sites", /from\("published_sites"\)/.test(appSitemap));
  ok("...only the live ones", /\.eq\("status", "live"\)/.test(appSitemap) && /\.eq\("is_active", true\)/.test(appSitemap));
  ok("...and their sub-pages", /normalisePages\(site\.pages\)/.test(appSitemap));
  // FAILS OPEN: an empty sitemap tells a crawler there is nothing here.
  // BOTH catches, and specifically the outer one. A `return []` in the
  // inner handler is satisfied by the outer handler anyway, so a check
  // that finds "a catch that returns []" stays green while the function
  // as a whole has been made able to throw.
  ok("a database error degrades to the app's own pages",
    /logApiError\("sitemap\.xml", error, \{ stage: "load_published_sites" \}\);\s*\n\s*return \[\];/.test(appSitemap));
  ok("...and so does an unexpected one",
    /logApiError\("sitemap\.xml", err, \{ stage: "published_sites_unhandled" \}\);\s*\n\s*return \[\];/.test(appSitemap));
  ok("...so the sitemap function itself cannot throw",
    !/^\s*throw /m.test(appSitemap), appSitemap.match(/^\s*throw [^\n]*/m)?.[0]);
}

console.log("\n== 8. the prompt asks for what the extractors read ==");
// SOURCE-LEVEL, AND SAID SO. Nothing here proves the MODEL obeys — only
// that what is asked for and what is parsed are the same vocabulary. A
// drift between them is silent: the model writes data-seo-hours and the
// reader looks for data-seo-opening-hours, and every site ships without
// opening hours while both halves look correct on their own.
{
  const prompt = (await loadTs("src/lib/seo/prompt.ts")).seoInstruction();
  const factsSrc = readFileSync("src/lib/seo/facts.ts", "utf8");
  const HOOKS = ["type", "name", "address", "locality", "hours", "price-range", "geo"];
  for (const hook of HOOKS) {
    ok(`the prompt asks for data-seo-${hook}`, prompt.includes(`data-seo-${hook}`), hook);
    ok(`...and the reader looks for it`, factsSrc.includes(`dataSeo`) && new RegExp(`"${hook}"`).test(factsSrc), hook);
  }
  ok("the prompt asks for the product hooks", prompt.includes("data-seo-product") && prompt.includes("data-seo-price"));
  ok("the prompt asks for <details>/<summary> FAQs", /<details><summary>/.test(prompt));
  ok("the prompt asks for an <address> element", /<address>/.test(prompt));
  ok("the prompt asks for per-page title and description",
    /OWN <title>[\s\S]{0,140}meta name="description"/i.test(prompt));
  // AND FORBIDS THE THINGS WE BUILD, or we get two of each.
  ok("the prompt forbids the model writing JSON-LD", /NO <script>[\s\S]{0,120}JSON-LD/i.test(prompt));
  ok("the prompt forbids the model writing og:/canonical", /og:\/twitter: meta, canonical/i.test(prompt));
  // THE ONE THING THAT MATTERS MOST, and the reason for the emphasis.
  ok("the prompt demands identical NAP on every page",
    /SAME name, address and phone[\s\S]{0,120}EVERY page/i.test(prompt));
  ok("...and forbids inventing any of it", /NEVER invented/.test(prompt));

  // A schema type the prompt suggests must be one the builder accepts,
  // or the model is being told to write something that falls back.
  // The list ends with a trailing clause ("— omit if none fits"), which
  // the first version of this parser handed to the builder as a type
  // name. Cut at the dash: what follows it is prose, not a type.
  const suggested = (/schema\.org kind: ([^)]+)\)/.exec(prompt)?.[1] ?? "")
    .split("—")[0]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  ok("the prompt suggests some types", suggested.length >= 5, suggested.join(","));
  for (const type of suggested) {
    ok(`"${type}" is a type the builder keeps`, sd.normaliseBusinessType(type) === type, sd.normaliseBusinessType(type));
  }
}

console.log("\n== 9. it is wired into every path a document takes ==");
{
  const gen = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
  const edit = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
  const publish = readFileSync("src/app/api/websites/[id]/publish/route.ts", "utf8");

  ok("generation runs it on EVERY document",
    /const optimised = stripped\.map\(\(doc\) => \{[\s\S]{0,200}enforceImageAltText\(doc\)[\s\S]{0,120}enforceSeoHead\(withAlt\.html\)/.test(gen));
  ok("...and stores the optimised documents, not the raw ones",
    /htmlContent = optimised\[0\];/.test(gen) && /html: optimised\[i \+ 1\]/.test(gen));
  // ALT BEFORE HEAD: og:image:alt is read off the alt attribute, so the
  // other order silently produces a card with no image description.
  ok("...alt text first, so og:image:alt has something to read",
    gen.indexOf("enforceImageAltText") < gen.indexOf("enforceSeoHead(withAlt"));
  // The security scan must read the MODEL's document, not ours.
  ok("the security scan still reads the model's own output",
    /securityIssues = stripped\.flatMap/.test(gen));

  ok("an edit re-establishes it", /enforceSeoHead\(withAlt\.html\)\.html;/.test(edit));
  // THE CALL SITE, not the import. indexOf("enforceSeoHead") finds the
  // import statement at the top of the file, which is before everything
  // and made this assertion unfailable.
  ok("...after the safety review, so a rejected edit is never optimised",
    edit.indexOf("edited HTML flagged by AI Output Protection Layer") <
      edit.indexOf("enforceSeoHead(withAlt.html)"));

  ok("publishing resolves the canonical", /canonicalUrl: pageUrl/.test(publish));
  ok("...for the home page at the site root", /seoFor\(html, siteBaseUrl, \[\]\)/.test(publish));
  ok("...and for each sub-page at its own URL", /seoFor\(pg\.html, `\$\{siteBaseUrl[\s\S]{0,60}\/\$\{pg\.slug\}`/.test(publish));
  ok("...with a breadcrumb on the sub-pages only", /breadcrumb: crumbs/.test(publish) && /homeCrumb,/.test(publish));
  ok("...and ONE name/address/phone for the whole site", /siteNap\(\[/.test(publish) && /nap: napReport\.nap/.test(publish));
  // THE CONDITION, not the message. The message string survives inside a
  // branch that can never be taken, which is exactly how this assertion
  // stayed green with the reporting switched off.
  ok("a NAP disagreement is reported, never silently rewritten",
    /if \(napReport\.disagreements\.length > 0\) \{[\s\S]{0,400}state a different name, address or phone/.test(publish));
  ok("what is STORED is the seo-resolved document",
    (publish.match(/html_content: publishedHtml,/g) ?? []).length === 3,
    String((publish.match(/html_content: publishedHtml,/g) ?? []).length));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
