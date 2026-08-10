// Two reports from a real test run:
//
//   "I only see Publish. I want the SAME button to become Unpublish when
//    the site is published — a toggle, not a second hidden button."
//
//   "The generated site has no real photos and no contact details."
//
// They are unrelated bugs and share a file only because they came from the
// same session.
//
// THE BUTTON. Unpublish was rendered the whole time, last in a wrapping
// row of four. It had already been moved and restyled once after the same
// complaint, and the complaint came back — which is the signal that the
// problem was never where it sat. Publishing a site and taking it down are
// one decision shown as two controls. So it is one control now.
//
// THE PHOTOS. Unsplash IS wired (lib/unsplash.ts, called from
// lib/website-image-resolver.ts). What was missing is arithmetic: each
// photo walks broadenImageQuery's ladder of up to FOUR searches, so ten
// photos can spend forty requests, and a free Unsplash application allows
// FIFTY PER HOUR. Two photo-heavy generations exhaust the quota; after
// that every search 403s and every photo silently becomes an unrelated
// picsum image — which is indistinguishable from the integration not
// existing, and is how it was reported.
//
// Run: node scripts/tests/publish-toggle-and-images.test.mjs
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

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const control = readFileSync("src/components/publishing/publish-control.tsx", "utf8");

// ---------------------------------------------------------------------
console.log("== 1. one button, two states ==");
// The whole point: a SINGLE element whose label and action depend on
// isLive. Two buttons in two branches would pass a naive "is there an
// Unpublish" check and fail the actual request.
check(
  "the label is chosen by the live state, not by which branch rendered",
  /\{isLive \? t\("unpublish"\) : site \? t\("republish"\) : t\("publish"\)\}/.test(control)
);
check(
  "and so is what pressing it does",
  /onClick=\{isLive \? \(\) => void unpublish\(\) : \(\) => setOpen\(\(v\) => !v\)\}/.test(control)
);
check(
  "it announces itself as a toggle to a screen reader",
  /aria-pressed=\{isLive\}/.test(control)
);
check(
  "the icon flips too, so it does not read as the same action",
  /isLive \? \(\s*<EyeOff/.test(control) && /\) : \(\s*<Globe/.test(control)
);

console.log("\n== 2. there is no second unpublish button left behind ==");
// The failure mode of a half-done toggle: the old button still there,
// now next to a toggle that does the same thing.
const unpublishButtons = (control.match(/void unpublish\(\)/g) ?? []).length;
eq("exactly one control calls unpublish", unpublishButtons, 1);
const publishLabels = (control.match(/t\("unpublish"\)/g) ?? []).length;
eq("and the Unpublish label appears exactly once", publishLabels, 1);

console.log("\n== 3. the toggle sits in the same place in both states ==");
// If the toggle were rendered after the conditional block, it would jump
// position the moment a site went live — which is the thing that made the
// old button unfindable.
const toggleAt = control.indexOf("aria-pressed={isLive}");
const conditionalAt = control.indexOf("{isLive && (");
check("the toggle is rendered BEFORE the live-only controls", toggleAt > 0 && toggleAt < conditionalAt);
check(
  "the live-only controls are consequences of the state, not alternatives",
  /\{isLive && \(\s*<>/.test(control)
);
// View live / Copy link / Publish changes only make sense with a live
// site, so they may come and go. The toggle may not.
for (const key of ["viewLive", "copyLink", "publishChanges"]) {
  const at = control.indexOf(`t("${key}")`);
  check(`${key} lives inside the live-only block`, at > conditionalAt);
}

console.log("\n== 4. both labels exist in all ten locales ==");
for (const locale of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const p = m.dashboard.publishing;
  check(`${locale}: has a Publish label`, Boolean(p.publish));
  check(`${locale}: has an Unpublish label`, Boolean(p.unpublish));
  check(`${locale}: has the confirmation`, Boolean(p.confirmUnpublish));
  // A toggle whose two states share a word is not a toggle a user can read.
  check(`${locale}: the two labels are different strings`, p.publish !== p.unpublish);
}

// =====================================================================
console.log("\n== 5. Unsplash IS wired — showing the call path ==");
const unsplash = readFileSync("src/lib/unsplash.ts", "utf8");
const resolver = readFileSync("src/lib/website-image-resolver.ts", "utf8");
const genRoute = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
check("lib/unsplash.ts calls the real search API", /https:\/\/api\.unsplash\.com\/search\/photos/.test(unsplash));
check("the resolver calls it", /searchUnsplashPhoto\(/.test(resolver));
check("generation calls the resolver", /resolveWebsiteImagePlaceholders\(/.test(genRoute));
check(
  "and it degrades to a real, working photo rather than a broken link",
  /picsumFallbackUrl/.test(resolver)
);
check(
  "with no key configured it makes no request at all",
  /if \(!accessKey \|\| !query\.trim\(\)\) return null;/.test(unsplash)
);

console.log("\n== 6. the quota arithmetic that made photos generic ==");
const { loadTs } = await import("./load-ts.mjs");
const ph = await loadTs("src/lib/website-image-placeholders.ts");
const ub = await loadTs("src/lib/unsplash-budget.ts");

// Measured from the real broadening ladder, not asserted by hand.
const worstCasePerPhoto = ph.broadenImageQuery("handmade sourdough loaves cooling rack bakery").length;
eq(`one photo can cost ${worstCasePerPhoto} searches`, worstCasePerPhoto, 4);
const DEMO_HOURLY = 50;
const photosToExhaust = Math.ceil(DEMO_HOURLY / worstCasePerPhoto);
check(
  `so ${photosToExhaust} missed photos exhaust a demo application's ${DEMO_HOURLY}/hour`,
  photosToExhaust <= 13
);
check(
  `the per-generation ceiling (${ub.UNSPLASH_REQUESTS_PER_GENERATION}) is below the hourly quota`,
  ub.UNSPLASH_REQUESTS_PER_GENERATION < DEMO_HOURLY
);
check(
  "so one generation can never spend the whole hour",
  Math.floor(DEMO_HOURLY / ub.UNSPLASH_REQUESTS_PER_GENERATION) >= 4
);

console.log("\n== 7. the ceiling actually stops spending ==");
const budget = ub.createUnsplashBudget(3);
let allowed = 0;
for (let i = 0; i < 10; i++) {
  if (!budget.canSpend()) break;
  budget.spend();
  allowed++;
}
eq("a budget of 3 permits exactly 3 requests", allowed, 3);
eq("and then reports why it stopped", budget.halted, "budget-exhausted");

console.log("\n== 8. the breaker tells apart 'wait an hour' from 'fix your key' ==");
// Unsplash does NOT answer 429 for quota. It answers 403 with
// X-Ratelimit-Remaining: 0, which reads exactly like a bad key — and the
// two need completely different fixes from whoever reads the log.
const headers = (obj) => ({ get: (k) => obj[k.toLowerCase()] ?? null });
eq(
  "403 with no quota left is the quota",
  ub.classifyUnsplashResponse(403, headers({ "x-ratelimit-remaining": "0" })),
  "rate-limited"
);
eq(
  "403 with quota remaining is the key",
  ub.classifyUnsplashResponse(403, headers({ "x-ratelimit-remaining": "37" })),
  "unauthorised"
);
eq("403 with no header at all is treated as the key", ub.classifyUnsplashResponse(403, headers({})), "unauthorised");
eq("401 is the key", ub.classifyUnsplashResponse(401, headers({})), "unauthorised");
eq("429 is the quota", ub.classifyUnsplashResponse(429, headers({})), "rate-limited");
// One bad query or one bad minute must not stop the other nine photos.
eq("404 is not fatal", ub.classifyUnsplashResponse(404, headers({})), null);
eq("500 is not fatal", ub.classifyUnsplashResponse(500, headers({})), null);
eq("200 is obviously not fatal", ub.classifyUnsplashResponse(200, headers({})), null);

const tripped = ub.createUnsplashBudget(50);
tripped.spend();
tripped.halt("rate-limited");
eq("once tripped, nothing more is spent", tripped.canSpend(), false);
eq("and the FIRST reason is kept, not the last", (tripped.halt("unauthorised"), tripped.halted), "rate-limited");

console.log("\n== 9. the breaker is shared across the photos, not per photo ==");
// A per-photo budget would be no breaker at all: photo two would start
// again from zero and fire its own four doomed requests.
check(
  "one budget is created per document",
  /const budget = createUnsplashBudget\(\);/.test(resolver)
);
check(
  "it is created OUTSIDE the per-photo loop",
  resolver.indexOf("createUnsplashBudget()") < resolver.indexOf("placeholders.map(")
);
check("every search is charged against it", /searchUnsplashPhoto\(attempt, budget\)/.test(resolver));
check(
  "and broadening stops the moment it trips",
  /if \(budget\.halted\) break;/.test(resolver)
);
check("the fetch itself refuses to run when it cannot spend", /if \(budget && !budget\.canSpend\(\)\) return null;/.test(unsplash));
check("a fatal status trips it", /budget\.halt\(fatal\)/.test(unsplash));

console.log("\n== 10. 'why are the photos generic' has a written answer ==");
// Three different causes produce the identical symptom on the page. A log
// line that does not distinguish them is worth nothing.
check("the halt is logged", /logApiError\("website-image-resolver"/.test(resolver));
check("with how many photos fell back", /fellBackToPicsum: fellBack/.test(resolver));
check(
  "a plain 'found nothing' is reported too, but only when a key exists",
  /isUnsplashConfigured\(\)/.test(resolver)
);
for (const reason of ["rate-limited", "unauthorised", "budget-exhausted"]) {
  const text = ub.describeUnsplashHalt(reason, 12);
  check(`${reason}: the message names the cause`, text.length > 40);
  check(`${reason}: and says what to do about it`, /picsum|check UNSPLASH_ACCESS_KEY|production access|ceiling/.test(text));
}
check(
  "the quota message states the real demo limit",
  /50 requests\/hour/.test(ub.describeUnsplashHalt("rate-limited", 12))
);

console.log("\n== 11. missing contact details become a visible gap, never a fake ==");
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
check("the prompt has a rule for details that were not given", /CONTACT DETAILS THAT WERE NOT GIVEN/.test(builder));
check("a missing phone gets a bracketed placeholder", /\[Your phone number\]/.test(builder));
check("inventing a phone number is forbidden outright", /NEVER invent a phone number/.test(builder));
check(
  "and a placeholder is not wrapped in tel:, so it cannot look real",
  /Do not wrap a placeholder in tel:\/mailto:/.test(builder)
);
check("the section is not silently dropped instead", /never a section quietly dropped/.test(builder));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
