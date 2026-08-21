// GUIDELINE 2, TESTED BY COUNTING REQUESTS — not by grepping the source.
//
// Unsplash requires a GET to links.download_location for every photo an
// application actually USES. It is the guideline most often missed,
// because nothing visibly breaks without it: the pages look right, the
// photos load, no test goes red, and the only consequence is a rejected
// production-access application or a suspended account.
//
// Everything asserting on it so far was a regex over source text. Two of
// those regexes were wrong in ways only a running system could show, and
// both are re-asserted here behaviourally, against the REAL
// resolveWebsiteImagePlaceholders driving the REAL searchUnsplashPhoto
// and the REAL triggerUnsplashDownload, with only `fetch` replaced — so
// what is counted is what Unsplash would receive.
//
// ---------------------------------------------------------------------
// THE TWO DEFECTS THIS FILE EXISTS FOR.
// ---------------------------------------------------------------------
//
// 1. THE CEILING WAS SILENTLY CANCELLING EVERY DOWNLOAD TRIGGER.
//
//    lib/unsplash.ts states the intent in full — "OBEYS THE BREAKER BUT
//    NOT THE CEILING" — and explains why: charging the mandatory trigger
//    against the per-generation search ceiling would let a photo-heavy
//    site "silently ship UNCREDITED photos".
//
//    It did exactly that, because canSpend() was not a query. It MUTATED:
//
//        canSpend() {
//          if (halted) return false;
//          if (spent >= limit) {
//            halted = "budget-exhausted";   // <-- the SAME flag as a 403
//            return false;
//          }
//          return true;
//        }
//
//    So the search that reached the ceiling tripped the breaker with the
//    Unsplash API perfectly healthy. triggerUnsplashDownload's own
//    `if (budget?.halted) return false;` — the line written to obey the
//    breaker and ignore the ceiling — then refused every trigger, and the
//    resolver's `if (budget.halted) break;` did not even reach the loop.
//    The photos still shipped, credited on the page and unregistered with
//    Unsplash. The ceiling and the breaker were one flag, and the comment
//    describing them as separate was the only place they were.
//
// 2. THE TRIGGER FIRED BEFORE THE DOCUMENT WAS ACCEPTED.
//
//    A use is a photo a visitor can see. Triggering at resolution time
//    counted photos on documents that were then thrown away: an edit
//    rejected by the safety review (api/websites/edit returns without
//    storing anything), and a generation flagged by it (the preview is
//    replaced by a warning panel and publish/download are disabled). Both
//    inflated a photographer's download count with uses that never
//    happened — the opposite of what the guideline is for.
//
// Run: node scripts/tests/unsplash-download-registration.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

process.env.UNSPLASH_ACCESS_KEY = "test-access-key";

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

const resolver = await loadTs("src/lib/website-image-resolver.ts");
const budgetLib = await loadTs("src/lib/unsplash-budget.ts");

// ---------------------------------------------------------------------
// A stand-in for Unsplash that RECORDS. Only fetch is replaced; every
// line of ours between the placeholder and the request is the real one.
// ---------------------------------------------------------------------
const SEARCH = "https://api.unsplash.com/search/photos";

function installUnsplash({ hit = () => true, searchStatus = () => 200, downloadStatus = () => 200 } = {}) {
  const log = { searches: [], downloads: [], authHeaders: [] };
  let searchCount = 0;

  globalThis.fetch = async (url, init) => {
    const href = String(url);
    log.authHeaders.push(init?.headers?.Authorization ?? null);

    if (href.startsWith(SEARCH)) {
      const query = decodeURIComponent(new URL(href).searchParams.get("query") || "");
      searchCount += 1;
      const status = searchStatus(searchCount, query);
      log.searches.push({ query, status });
      if (status !== 200) {
        return {
          ok: false,
          status,
          headers: { get: (n) => (n.toLowerCase() === "x-ratelimit-remaining" ? "0" : null) },
        };
      }
      if (!hit(query)) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [] }) };
      // The real /search/photos shape — nested exactly as documented, so
      // photoFromSearchResult's four different depths are exercised.
      const id = `photo-${log.searches.length}`;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          results: [
            {
              id,
              urls: { regular: `https://images.unsplash.com/${id}?w=1080` },
              user: { name: `Photographer ${id}`, links: { html: `https://unsplash.com/@${id}` } },
              links: { download_location: `https://api.unsplash.com/photos/${id}/download` },
            },
          ],
        }),
      };
    }

    if (href.includes("/download")) {
      const status = downloadStatus(log.downloads.length + 1);
      log.downloads.push({ url: href, status });
      return { ok: status === 200, status, headers: { get: () => null } };
    }

    throw new Error(`unexpected fetch to ${href}`);
  };
  return log;
}

/** A page with N photo placeholders, in the shape the model emits. */
const pageWith = (queries) =>
  `<!doctype html><html><body>` +
  queries
    .map(
      (q, i) =>
        `<img src="PLACEHOLDER:p${i}" alt="${q}" data-image-query="${q}" />`
    )
    .join("") +
  `</body></html>`;

/** Every photo that ends up on the page, by its CDN url. */
const shippedPhotos = (html) => [...html.matchAll(/src="(https:\/\/images\.unsplash\.com\/[^"]*)"/g)].map((m) => m[1]);

/**
 * What a ROUTE does, in the order it does it: resolve, keep the document,
 * then register the uses. Written out here rather than hidden in a helper
 * inside the library, because the ORDER is the thing under test — the
 * registration has to happen after the document is kept, and only a
 * caller knows whether it was.
 */
async function resolveThenStore(input, { stored = true } = {}) {
  const resolution = await resolver.resolveWebsiteImagePlaceholders(input);
  if (!stored) return { ...resolution, registered: 0, attempted: 0 };
  const receipt = await resolver.registerUnsplashUses(resolution.used, resolution.halted);
  return { ...resolution, ...receipt };
}

// =====================================================================
console.log("== The ceiling is OUR limit; the breaker is UNSPLASH saying no ==");
// A pure query. The previous version set halted as a side effect of being
// asked, which is what made the ceiling indistinguishable from a 403.
{
  const b = budgetLib.createUnsplashBudget(2);
  b.spend();
  b.spend();
  check("canSpend() is false at the ceiling", b.canSpend(), false);
  check("asking does NOT trip the breaker", b.halted, null);
  check("the ceiling is reported separately", b.ceilingReached, true);
  check("asking twice still does not trip it", (b.canSpend(), b.halted), null);
}
{
  const b = budgetLib.createUnsplashBudget(5);
  b.halt("rate-limited");
  check("a real halt is still reported", b.halted, "rate-limited");
  check("and stops spending", b.canSpend(), false);
  check("without claiming the ceiling was reached", b.ceilingReached, false);
}

// =====================================================================
console.log("\n== Every photo that ships is registered — the ordinary case ==");
{
  const log = installUnsplash();
  const { html, used } = await resolveThenStore(
    pageWith(["sourdough bread bakery", "coffee cup wooden table", "shop front street"])
  );
  const shipped = shippedPhotos(html);
  check("three photos reached the page", shipped.length, 3);
  check("three searches were made", log.searches.length, 3);
  check("three downloads were registered", log.downloads.length, 3);
  check("the resolver reports what it used", used.length, 3);
  ok(
    "each registered download belongs to a shipped photo",
    log.downloads.every((d) => shipped.some((s) => d.url.includes(s.split("/").pop().split("?")[0])))
  );
  ok("every request carried the key", log.authHeaders.every((h) => h === "Client-ID test-access-key"));
}

// =====================================================================
console.log("\n== THE DEFECT: hitting our own ceiling must not cancel registration ==");
{
  // Eight photos whose most specific query misses forces one round of
  // broadening, and sixteen searches walks straight past the ceiling of
  // twelve. Every photo then resolves on the broader query and SHIPS —
  // which is the case that matters: with the old shared flag, the search
  // that crossed the ceiling set halted="budget-exhausted" and every one
  // of these eight photos went out unregistered.
  const missOnlyTheLongest = (q) => q.split(/\s+/).length <= 3;
  const log = installUnsplash({ hit: missOnlyTheLongest });
  const queries = Array.from({ length: 8 }, (_, i) => `subject${i} style setting extra`);
  const { html, used } = await resolveThenStore(pageWith(queries));

  const shipped = shippedPhotos(html);
  // The exact state that matters is MIXED: the ceiling stopped some
  // photos, and the ones that got through are on the page. Asserted
  // rather than assumed, because if either half were untrue this
  // scenario would prove nothing.
  ok("the ceiling was actually reached", log.searches.length >= 12);
  ok("some photos still shipped", shipped.length > 0);
  ok("and the ceiling did cost some photos", shipped.length < 8);
  check("every shipped photo was registered with Unsplash", log.downloads.length, shipped.length);
  check("the resolver's own tally matches the page", used.length, shipped.length);
}

// =====================================================================
console.log("\n== A photo that did NOT ship is never registered ==");
{
  // A logo-like query is stripped outright, and an unresolvable one is
  // removed rather than substituted. Neither was displayed, so counting
  // either would report a use that never happened.
  const log = installUnsplash({ hit: (q) => q.startsWith("real") });
  const { html, used } = await resolveThenStore(
    pageWith(["real bakery interior", "company logo mark", "nothing matches this query at all"])
  );
  const shipped = shippedPhotos(html);
  check("only the resolvable photo shipped", shipped.length, 1);
  check("only one download was registered", log.downloads.length, 1);
  check("the tally matches", used.length, 1);
  ok("the logo placeholder was never searched for", !log.searches.some((s) => /logo/i.test(s.query)));
  ok("no PLACEHOLDER token was left behind", !html.includes("PLACEHOLDER:"));
}

// =====================================================================
console.log("\n== Unsplash saying no DOES stop everything ==");
{
  // 403 with x-ratelimit-remaining: 0 is how Unsplash reports quota
  // exhaustion. Once it has, further requests buy nothing but latency —
  // including the triggers, which would also be refused.
  const log = installUnsplash({ searchStatus: (n) => (n >= 2 ? 403 : 200) });
  const { html, used } = await resolveThenStore(
    pageWith(["one bakery interior", "two coffee cups", "three shop fronts", "four bread loaves"])
  );
  const shipped = shippedPhotos(html);
  check("the first photo shipped", shipped.length, 1);
  ok("the breaker stopped the searches", log.searches.length <= 4);
  check("no download was attempted once Unsplash refused", log.downloads.length, 0);
  check("the resolver still reports the photo it used", used.length, 1);
  ok("the photo it shipped is still credited on the page", html.includes("unsplash-credit"));
}

// =====================================================================
console.log("\n== A failing trigger is reported, never silently swallowed ==");
{
  const log = installUnsplash({ downloadStatus: (n) => (n === 2 ? 500 : 200) });
  const { html, used, registered } = await resolveThenStore(
    pageWith(["one bakery interior", "two coffee cups", "three shop fronts"])
  );
  check("three downloads were attempted", log.downloads.length, 3);
  check("two were accepted", registered, 2);
  check("all three photos still shipped", shippedPhotos(html).length, 3);
  check("and all three are reported as used", used.length, 3);
}

// =====================================================================
console.log("\n== A document that is THROWN AWAY registers nothing ==");
{
  // A safety-rejected edit returns without storing anything, and a
  // flagged generation is stored but never rendered. Neither displayed a
  // photo, so neither may add to a photographer's download count.
  const log = installUnsplash();
  const { html, used } = await resolveThenStore(
    pageWith(["one bakery interior", "two coffee cups"]),
    { stored: false }
  );
  check("the photos were resolved", used.length, 2);
  check("they are on the candidate page", shippedPhotos(html).length, 2);
  check("nothing was registered with Unsplash", log.downloads.length, 0);
}

// =====================================================================
console.log("\n== Registration happens where the document is KEPT ==");
//
// The routes are the only place that knows whether a document survived
// the safety review. A trigger inside the resolver cannot know, which is
// how a rejected edit came to register photos nobody ever saw.
const editRoute = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
const genRoute = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");

for (const [label, src, storedMarker, guard] of [
  // The guard is asserted verbatim, and that is not pedantry. The
  // mutation run flipped each of these conditions to something always
  // false — and to something that ignores the flagged case — and a test
  // that only checked ORDER stayed green both times. Position says the
  // call is in the right place; the guard says it only runs when the
  // document was actually kept and is actually shown.
  ["edit", editRoute, "html_content: updatedHtml", "if (!updateError && updatedRecord) {"],
  ["generation", genRoute, "html_content: htmlContent", "if (!updateError && updatedRecord && !isFlagged) {"],
]) {
  const registerAt = src.indexOf("registerUnsplashUses(");
  const storeAt = src.indexOf(storedMarker);
  const guardAt = src.indexOf(guard);
  ok(`${label} registers the uses`, registerAt !== -1);
  ok(`${label} stores the document`, storeAt !== -1);
  ok(`${label} registers AFTER the document is stored`, registerAt > storeAt);
  ok(`${label} registers only when the store succeeded`, guardAt !== -1 && guardAt < registerAt);
  // …and nothing between the guard and the call can re-open it.
  // registerAt points at the identifier, so everything between the guard
  // and it must be exactly the `await` — no branch, no early return, no
  // second condition that could re-open the path.
  ok(
    `${label}'s guard is the immediately enclosing condition`,
    src.slice(guardAt + guard.length, registerAt).trim() === "await"
  );
}

// A flagged generation is stored but never displayed — its preview is
// replaced by a warning panel and publish and download are disabled — so
// its photos were never used by anyone.
ok(
  "generation excludes a flagged document explicitly",
  /registerUnsplashUses/.test(genRoute) && /&& !isFlagged\) \{\n\s*await registerUnsplashUses/.test(genRoute)
);
const workspace = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
ok(
  "…and the workspace really does refuse to show a flagged site",
  /flagged/i.test(workspace) && /disabledFlagged|status === "flagged"/.test(workspace)
);

// The rejection paths must return without registering. Both routes bail
// out before the store when the safety review objects.
const editRejection = editRoute.slice(
  editRoute.indexOf("if (allIssueDescriptions.length > 0) {"),
  editRoute.indexOf("html_content: updatedHtml")
);
ok(
  "a safety-rejected edit returns before anything is registered",
  editRejection.includes("return NextResponse.json") && !editRejection.includes("registerUnsplashUses(")
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
