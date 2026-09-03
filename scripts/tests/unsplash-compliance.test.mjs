// Unsplash API guidelines — the three conditions for production access.
//
// Unsplash raises an application from the Demo tier (50 requests/hour) to
// Production (5,000/hour) only if it does all three of these. Before this
// test, this app did ONE:
//
//   1. HOTLINK — photos served from Unsplash's CDN, never re-hosted.
//      Was already true, and is easy to break by "optimising" the image
//      into our own storage, so it is asserted here rather than assumed.
//   2. TRIGGER A DOWNLOAD when a photo is used. Was NOT done. Nothing in
//      the app ever read `links.download_location`, because
//      lib/unsplash.ts discarded every field except the URL before it
//      reached any caller.
//   3. ATTRIBUTION — "Photo by <name> on Unsplash" with utm_source and
//      utm_medium on both links. Was NOT done, and could not be: the
//      photographer was discarded in the same place.
//
// (2) and (3) share one root cause, which is why they were both missing:
// the search returned a bare string. Nothing downstream could credit a
// photographer it had never been told about.
//
// WHY A BUILD GATE. All three failures are invisible from the product.
// The pages look right, the photos load, nothing errors, no test goes
// red — the only observable consequence is an application rejected weeks
// later, or an account suspended for ToS breach.
//
// Run: node scripts/tests/unsplash-compliance.test.mjs
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
function ok(name, cond) {
  check(name, Boolean(cond), true);
}

/**
 * The source of ONE function, brace-matched from its declaration.
 *
 * Needed because these assertions are regexes over source, and a regex
 * anchored on a function NAME also matches that name in a comment — which
 * is how "it authenticates with the access key" came to be asserting
 * something about a different function entirely. Returns "" if the
 * declaration is not found, so a rename fails the test loudly instead of
 * matching the whole file.
 */
function functionBody(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) return "";
  const open = source.indexOf("{", start + declaration.length);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return "";
}

const ph = await loadTs("src/lib/website-image-placeholders.ts");
const uns = await loadTs("src/lib/unsplash.ts");

// A search response in the REAL shape Unsplash returns — nested exactly
// as the API documents it, not flattened for convenience. The nesting IS
// the thing under test: photoFromSearchResult reads four values from four
// different depths, and a hand-flattened fixture would assert nothing.
const REAL_SEARCH_RESULT = {
  id: "Dwu85P9SOIk",
  urls: {
    raw: "https://images.unsplash.com/photo-1417325384643?ixid=abc",
    full: "https://images.unsplash.com/photo-1417325384643?ixid=abc&q=85",
    regular: "https://images.unsplash.com/photo-1417325384643?ixid=abc&w=1080",
    small: "https://images.unsplash.com/photo-1417325384643?ixid=abc&w=400",
  },
  links: {
    self: "https://api.unsplash.com/photos/Dwu85P9SOIk",
    html: "https://unsplash.com/photos/Dwu85P9SOIk",
    download: "https://unsplash.com/photos/Dwu85P9SOIk/download",
    download_location: "https://api.unsplash.com/photos/Dwu85P9SOIk/download?ixid=abc",
  },
  user: {
    id: "QPxL2MGqfrw",
    username: "poorkane",
    name: "Gilbert Kane",
    links: {
      self: "https://api.unsplash.com/users/poorkane",
      html: "https://unsplash.com/@poorkane",
      photos: "https://api.unsplash.com/users/poorkane/photos",
    },
  },
};

// =====================================================================
console.log("\n== Requirement 1: HOTLINK ==");
const unsplashSrc = readFileSync("src/lib/unsplash.ts", "utf8");
const resolverSrc = readFileSync("src/lib/website-image-resolver.ts", "utf8");
const placeholderSrc = readFileSync("src/lib/website-image-placeholders.ts", "utf8");

// Deliberately tolerant of the functions being ABSENT rather than wrong.
// A version of this module that never carried the photographer at all
// should make these assertions go red one by one — not crash the run on
// the first undefined, which would say "something is broken" instead of
// naming which guideline is unmet.
const NOT_BUILT = { url: null, photographerName: null, photographerUrl: null, downloadLocation: null };
const photo =
  (typeof uns.photoFromSearchResult === "function"
    ? uns.photoFromSearchResult(REAL_SEARCH_RESULT)
    : null) ?? NOT_BUILT;
ok("a real search result yields a usable photo", photo !== NOT_BUILT);
// THE HOTLINK IS urls.regular, WITH ONE PARAMETER REWRITTEN.
//
// This was `check(photo.url, urls.regular)` — exact equality. That is
// the right SHAPE of assertion for a compliance rule and it became
// wrong the moment the URL started asking Unsplash's CDN for WebP,
// which is a format request on their own address rather than a
// different image.
//
// Relaxing it to "contains the host" would have been weaker than what
// it replaced, and the rule it guards is the one Unsplash can withdraw
// the API key over. So it is decomposed instead, and every part of the
// original equality is still asserted: same origin, same path, every
// original parameter still present with its original value, and `fm`
// the ONLY key that differs. An image proxied through our own domain,
// resized to a different `w`, or stripped of `ixid`, all still fail.
{
  const wanted = new URL(REAL_SEARCH_RESULT.urls.regular);
  const got = photo.url ? new URL(photo.url) : null;
  ok("the hotlink URL was built at all", got !== null);
  if (got) {
    ok("...from Unsplash's own origin, unchanged", got.origin === wanted.origin, `${got.origin} vs ${wanted.origin}`);
    ok("...the same photo path, unchanged", got.pathname === wanted.pathname, `${got.pathname} vs ${wanted.pathname}`);
    const changed = [];
    for (const [k, v] of wanted.searchParams) {
      if (got.searchParams.get(k) !== v) changed.push(`${k}: ${v} -> ${got.searchParams.get(k)}`);
    }
    const added = [...got.searchParams.keys()].filter((k) => !wanted.searchParams.has(k));
    ok("...with fm the only parameter altered", changed.every((c) => c.startsWith("fm:")), changed.join(", "));
    ok("...and nothing added except fm", added.every((k) => k === "fm"), added.join(", "));
    ok("...and it asks for webp", got.searchParams.get("fm") === "webp", String(got.searchParams.get("fm")));
  }
}
ok("the URL points at Unsplash's own CDN", String(photo.url).startsWith("https://images.unsplash.com/"));

// The compliance risk is someone "optimising" the photo into our storage.
// Nothing in the image path may upload image bytes anywhere.
for (const [label, src] of [
  ["lib/unsplash.ts", unsplashSrc],
  ["the resolver", resolverSrc],
  ["the placeholder module", placeholderSrc],
]) {
  ok(`${label} never uploads a photo to storage`, !/\.storage\b|\.upload\(/.test(src));
  ok(`${label} never reads the image body`, !/arrayBuffer\(\)|\.blob\(\)/.test(src));
}

// The three-file grep above cannot see the two ways this app could
// plausibly START re-hosting: Next's image optimiser (which proxies the
// bytes through /_next/image on OUR origin) and a service worker caching
// them. Both would be a licence breach that looks like a performance win,
// so they are asserted where they would be configured.
{
  const nextConfig = readFileSync("next.config.mjs", "utf8");
  ok(
    "next.config.mjs does not allow Unsplash through the image optimiser",
    !/unsplash/i.test(nextConfig)
  );
  ok("no remotePatterns entry exists at all", !/remotePatterns/.test(nextConfig));
  const sw = readFileSync("public/sw.js", "utf8");
  ok("the service worker never caches a cross-origin response", /url\.origin !== self\.location\.origin/.test(sw));
  ok("and it names no image CDN to cache", !/unsplash/i.test(sw));
}

// =====================================================================
console.log("\n== Requirement 2: TRIGGER DOWNLOAD ==");
check(
  "download_location is carried out of the response",
  photo.downloadLocation,
  REAL_SEARCH_RESULT.links.download_location
);
ok("a trigger function exists", typeof uns.triggerUnsplashDownload === "function");
// It must hit download_location — NOT links.download (the human page) and
// NOT the image URL. Those register nothing.
ok(
  "it requests the photo's downloadLocation",
  /fetch\(photo\.downloadLocation/.test(unsplashSrc)
);
// SCOPED TO THE FUNCTION BODY, and that is the whole point of this
// version. The previous assertion searched from the first occurrence of
// the string "triggerUnsplashDownload" — which is in the FILE HEADER
// COMMENT, twenty lines above searchUnsplashPhoto. A non-greedy match
// from there found searchUnsplashPhoto's Authorization header and passed,
// so removing the auth header from the trigger itself left the suite
// green. scripts/tests/unsplash-attribution.mutation.mjs re-introduced
// exactly that and the suite did not notice; this is the repair.
// An unauthenticated GET to download_location registers nothing with
// Unsplash, which is invisible from the product and fatal at review.
const triggerBody = functionBody(unsplashSrc, "export async function triggerUnsplashDownload");
ok("the trigger function body was located", triggerBody.length > 0);
ok(
  "it authenticates with the access key",
  /Authorization: `Client-ID \$\{accessKey\}`/.test(triggerBody)
);
ok(
  "it reads the key from the environment itself",
  /const accessKey = process\.env\.UNSPLASH_ACCESS_KEY;/.test(triggerBody)
);
// Only photos that SHIP get registered, and "ship" means the document was
// KEPT — which the resolver cannot know. So the trigger no longer lives
// inside it: resolveWebsiteImagePlaceholders reports the photos it used
// and the routes register them once the row is written. See
// scripts/tests/unsplash-download-registration.test.mjs, which counts the
// actual requests rather than reading the source.
ok(
  "the resolver reports the photos it used instead of registering them itself",
  /used: \[\.\.\.resolved\.values\(\)\]/.test(resolverSrc)
);
ok(
  "registration is its own exported step",
  /export async function registerUnsplashUses\(/.test(resolverSrc)
);
ok(
  "and it is what calls the trigger",
  /registerUnsplashUses[\s\S]*?triggerUnsplashDownload\(photo, budget\)/.test(resolverSrc)
);
ok(
  "resolution itself no longer triggers anything",
  !/for \(const photo of resolved\.values\(\)\)/.test(resolverSrc)
);
// The trigger must survive the per-generation search ceiling. Charging it
// against the same 12-request budget would let a photo-heavy site ship
// UNCREDITED photos once broadening searches ate the allowance.
ok(
  "the trigger is not blocked by the search ceiling",
  /if \(budget\?\.halted\) return false;/.test(triggerBody) &&
    !/budget && !budget\.canSpend\(\)/.test(triggerBody)
);
ok(
  "the search IS still bounded by the ceiling",
  /if \(budget && !budget\.canSpend\(\)\) return null;/.test(unsplashSrc)
);

// =====================================================================
console.log("\n== Requirement 3: ATTRIBUTION ==");
check("the photographer's name is carried through", photo.photographerName, "Gilbert Kane");
check("their profile link is carried through", photo.photographerUrl, "https://unsplash.com/@poorkane");

const credit =
  typeof ph.buildUnsplashCreditHtml === "function" ? ph.buildUnsplashCreditHtml(photo) : "";
ok('the credit reads "Photo by <name> on Unsplash"', /Photo by .*Gilbert Kane.*on .*Unsplash/.test(credit));
ok(
  "the photographer link carries both utm parameters",
  /href="https:\/\/unsplash\.com\/@poorkane\?utm_source=ionexa&amp;utm_medium=referral"/.test(credit)
);
ok(
  "the Unsplash link carries both utm parameters",
  /href="https:\/\/unsplash\.com\/\?utm_source=ionexa&amp;utm_medium=referral"/.test(credit)
);
check("utm_source is our application name", ph.UNSPLASH_UTM, "utm_source=ionexa&utm_medium=referral");
// A profile URL that already had a query string must keep it.
ok(
  "utm is appended with & when a query already exists",
  (ph.withUnsplashUtm?.("https://unsplash.com/@x?a=1") ?? "") ===
    "https://unsplash.com/@x?a=1&utm_source=ionexa&utm_medium=referral"
);

// The photographer's name is third-party text written into a document we
// publish for a paying customer. Unescaped, a crafted display name is
// stored XSS on every site that used that photo.
const buildCredit = ph.buildUnsplashCreditHtml ?? (() => "<script>NOT IMPLEMENTED</script>");
const hostile = buildCredit({
  url: "https://images.unsplash.com/x",
  photographerName: '</span><script>alert(1)</script><span>',
  photographerUrl: 'https://unsplash.com/@x"onmouseover="alert(1)',
});
ok("a hostile photographer name cannot inject a tag", !/<script>/.test(hostile));
ok("a hostile profile URL cannot break out of the attribute", !/"onmouseover="/.test(hostile));
ok("the escaped name is still displayed", hostile.includes("&lt;/span&gt;"));

// =====================================================================
console.log("\n== The credit reaches the page ==");
// Built through the real placeholder convention the generation prompt
// emits, so this exercises the same path a real site takes.
const HTML =
  '<main><img src="PLACEHOLDER:hero" alt="a bakery" data-image-query="artisan bakery bread">' +
  '<p>Fresh daily.</p></main>';
const applied = ph.applyResolvedImageUrls(HTML, new Map([["hero", photo]]));
ok("the placeholder token is gone", !applied.includes("PLACEHOLDER:hero"));
ok("the real photo URL is in the src", applied.includes(`src="${photo.url}"`));
ok("the credit is rendered into the page", applied.includes("Photo by"));
ok("the credit sits immediately after its own image", /<\/img>|alt="a bakery"[^>]*>\s*<span class="unsplash-credit"/.test(applied));
ok("the surrounding markup survives", applied.includes("<p>Fresh daily.</p>"));
// The credit is styled inline so a generated stylesheet cannot hide it.
ok("the credit is styled inline, not by class alone", /<span class="unsplash-credit" style="[^"]+"/.test(applied));
ok("links open safely", applied.includes('rel="noopener noreferrer"'));

// Two photos, two credits — a page does not get one credit for all.
const TWO =
  '<img src="PLACEHOLDER:a" alt="one"><img src="PLACEHOLDER:b" alt="two">';
const second = { ...photo, photographerName: "Ada Lovelace", photographerUrl: "https://unsplash.com/@ada" };
const both = ph.applyResolvedImageUrls(TWO, new Map([["a", photo], ["b", second]]));
check("each photo gets its own credit", (both.match(/Photo by/g) ?? []).length, 2);
ok("the second photographer is named", both.includes("Ada Lovelace"));

// =====================================================================
console.log("\n== A hostile photo URL cannot write markup into the page ==");
// urls.regular is third-party text. String.replace() expands $&, $`, $'
// and $1-$99 inside a replacement STRING, so passing the url as one let a
// url containing "$`" paste everything before the match — the rest of the
// <img> tag — into the attribute, closing src and injecting markup onto a
// customer's published page. Demonstrated rather than described: this
// exact url produced `<img src="…<img src="evil'…` before the fix.
{
  const hostile = {
    url: "https://images.unsplash.com/photo-x?a=$`evil$'&b=$&x",
    photographerName: "Ada",
    photographerUrl: "https://unsplash.com/@ada",
  };
  const out = ph.applyResolvedImageUrls(
    `<img src="PLACEHOLDER:hero" alt="a photo">`,
    new Map([["hero", hostile]])
  );
  check("the url is written verbatim, unexpanded", out.includes(`src="${hostile.url}"`), true);
  ok("no second <img> was conjured", (out.match(/<img\b/g) || []).length === 1);
  ok("the placeholder token did not survive the expansion", !out.includes("PLACEHOLDER:hero"));
  ok("the credit still follows it", /<span[^>]*class="unsplash-credit"/.test(out));
}

console.log("\n== A photo we cannot credit is not used ==");
// Displaying an uncreditable photo is the breach this guards. Each of the
// four fields is load-bearing, so each is removed in turn — a single
// "incomplete object" case would pass even if three of the four checks
// were dropped.
const readPhoto = uns.photoFromSearchResult ?? (() => "photoFromSearchResult is missing");
for (const missing of ["urls", "user", "links"]) {
  const broken = { ...REAL_SEARCH_RESULT };
  delete broken[missing];
  check(`a result with no ${missing} is unusable`, readPhoto(broken), null);
}
check(
  "a result with no photographer name is unusable",
  readPhoto({ ...REAL_SEARCH_RESULT, user: { ...REAL_SEARCH_RESULT.user, name: "" } }),
  null
);
check(
  "a result with no download_location is unusable",
  readPhoto({ ...REAL_SEARCH_RESULT, links: { ...REAL_SEARCH_RESULT.links, download_location: null } }),
  null
);
check("an empty result set is unusable", readPhoto(undefined), null);

console.log("\n== the photo is asked for as WebP, and it is still a hotlink ==");
{
  // WebP is 25-35% smaller than the JPEG at the same quality, and a
  // generated site is mostly photographs — the cheapest weight this
  // product can shed, on pages a customer's own visitors load.
  //
  // THE COMPLIANCE LINE IS THE POINT. Unsplash requires the image to be
  // served from THEIR CDN, never re-hosted. Rewriting an existing query
  // parameter on their own URL is a format request, not a copy: the
  // bytes still come from images.unsplash.com and nothing here fetches
  // them. Proxying the image to convert it would break the licence.
  const u = await loadTs("src/lib/unsplash.ts");
  ok("asWebp is exported", typeof u.asWebp === "function");
  // urls.regular really does arrive carrying fm=jpg, which is why this
  // SETS rather than appends — two fm parameters leaves the CDN to pick.
  const real = "https://images.unsplash.com/photo-1?ixlib=rb-4.0&w=1080&q=80&fm=jpg&fit=max";
  const got = u.asWebp(real);
  ok("fm=jpg becomes fm=webp", /[?&]fm=webp(&|$)/.test(got), got);
  ok("...and there is only ONE fm parameter", (got.match(/[?&]fm=/g) || []).length === 1, got);
  ok("...on the same Unsplash host, not proxied", new URL(got).host === "images.unsplash.com", got);
  ok("...with the other parameters untouched", /w=1080/.test(got) && /q=80/.test(got) && /fit=max/.test(got), got);
  ok("a URL without fm gets one", /fm=webp/.test(u.asWebp("https://images.unsplash.com/photo-2?w=1080")));
  // A photo is worth far more than an optimised photo.
  ok("a value that will not parse is returned untouched", u.asWebp("not a url") === "not a url");
  ok("...and empty stays empty", u.asWebp("") === "");
  ok("null survives", u.asWebp(null) === null);
  // It has to be APPLIED, not merely available.
  const src = readFileSync("src/lib/unsplash.ts", "utf8");
  ok("photoFromSearchResult applies it", /asWebp\(nonEmptyString\(raw\?\.urls\?\.regular\)\)/.test(src));
}

console.log("\n== webp uploads are accepted, because the model reads them ==");
{
  // Anthropic's vision API takes image/webp alongside jpeg, png and gif,
  // so nothing downstream needed to change — and webp is what a phone
  // screenshot or an exported design most often IS now. Refusing it made
  // the upload fail for a file the model could have read perfectly well.
  const ref = await loadTs("src/lib/website-reference-image.ts");
  ok("the accept list carries webp", ref.ACCEPTED_REFERENCE_IMAGE_TYPES.includes("image/webp"),
    String(ref.ACCEPTED_REFERENCE_IMAGE_TYPES));
  ok("...and jpeg and png are still there",
    ref.ACCEPTED_REFERENCE_IMAGE_TYPES.includes("image/jpeg") && ref.ACCEPTED_REFERENCE_IMAGE_TYPES.includes("image/png"));
  const builder = readFileSync("src/lib/website-builder.ts", "utf8");
  ok("the SERVER guard agrees with the client list", /contentType === "image\/webp"/.test(builder),
    "the download path re-checks the stored type; a client-only change lets a webp upload fail after it has been stored");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
