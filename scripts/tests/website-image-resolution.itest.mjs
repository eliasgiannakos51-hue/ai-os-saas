// Does every photo on the page actually get searched for?
//
// "Οι εικόνες δεν είναι σχετικές." Three things produce that symptom and
// they are indistinguishable on screen: no key configured, the hourly quota
// spent, or — the one nobody was looking for — the photo never being
// searched for at all.
//
// THE STARVATION. The budget was a flat 12 requests shared by every photo,
// and every photo walked a ladder of up to four broadening searches
// CONCURRENTLY through Promise.all. So the ladders competed: at 14 photos
// two of them reached picsum without the library ever being asked about
// them, and at 20 photos eight did. A `gallery` page — the archetype whose
// own rule is "IMAGES: the maximum" — is exactly the page that asks for
// twenty photographs, so the shape most dependent on photography was the
// shape most likely to be starved.
//
// This exercises the REAL resolver — the same module the generate and edit
// routes call, through the real broadenImageQuery, the real budget and the
// real searchUnsplashPhoto. The only thing replaced is `fetch`, i.e. the
// network boundary itself, which is also the thing being counted. Nothing
// about the logic under test is substituted.
//
// Run: node scripts/tests/website-image-resolution.itest.mjs
import { loadTsWithDeps } from "./load-ts.mjs";

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

// A key must be present or lib/unsplash.ts short-circuits before it ever
// reaches the network — which would make every assertion below vacuously
// true. This is a fake key aimed at a fake fetch; nothing leaves the process.
process.env.UNSPLASH_ACCESS_KEY = "itest-key-not-a-real-credential";

const { resolveWebsiteImagePlaceholders } = await loadTsWithDeps("src/lib/website-image-resolver.ts");
const { unsplashBudgetForPlaceholders, UNSPLASH_MAX_REQUESTS_PER_GENERATION } =
  await loadTsWithDeps("src/lib/unsplash-budget.ts");

const realFetch = globalThis.fetch;

/**
 * Stands in for api.unsplash.com. Records every query it is asked and
 * answers according to `respond(query)`.
 */
function installFetch(respond) {
  const queries = [];
  globalThis.fetch = async (url) => {
    const query = decodeURIComponent(new URL(url).searchParams.get("query") ?? "");
    queries.push(query);
    const answer = respond(query, queries.length);
    if (answer && answer.status && answer.status !== 200) {
      return {
        ok: false,
        status: answer.status,
        headers: { get: (h) => (answer.headers ?? {})[h.toLowerCase()] ?? null },
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => (answer?.hit ? { results: [{ urls: { regular: `https://images.example/${queries.length}.jpg` } }] } : { results: [] }),
    };
  };
  return queries;
}

function pageWith(photoCount) {
  const imgs = Array.from(
    { length: photoCount },
    (_, i) =>
      `<img src="PLACEHOLDER:p${i}" data-image-query="subject ${i} setting detail extra" alt="photo ${i}">`
  ).join("\n");
  return `<!DOCTYPE html><html><body><main>${imgs}</main></body></html>`;
}

/** Every distinct photo the resolver actually asked the library about. */
function photosAsked(queries) {
  return new Set(queries.map((q) => q.match(/subject (\d+)/)?.[1]).filter((x) => x !== undefined)).size;
}

try {
  // -------------------------------------------------------------------
  console.log("== 1. the budget scales, so no photo is starved ==");
  eq("a 3-photo page gets 3 + the broadening allowance", unsplashBudgetForPlaceholders(3), 15);
  eq("a 20-photo page gets 20 + the allowance", unsplashBudgetForPlaceholders(20), 32);
  check(
    "and it is still capped, so one page cannot eat the whole hour",
    unsplashBudgetForPlaceholders(200) === UNSPLASH_MAX_REQUESTS_PER_GENERATION,
    String(unsplashBudgetForPlaceholders(200))
  );
  // The property that matters: whatever the photo count, the budget is
  // never smaller than the number of photos, so a first search each always
  // fits. This is the arithmetic the old flat 12 could not satisfy.
  let alwaysRoom = true;
  for (let n = 1; n <= UNSPLASH_MAX_REQUESTS_PER_GENERATION; n++) {
    if (unsplashBudgetForPlaceholders(n) < n) alwaysRoom = false;
  }
  check("the budget is never smaller than the photo count", alwaysRoom);

  // -------------------------------------------------------------------
  console.log("\n== 2. the real resolver, with every query missing ==");
  // Worst case, and the case that produced the report: nothing matches, so
  // every photo walks its whole ladder. Under the old design this is where
  // later photos got nothing at all.
  for (const photoCount of [6, 14, 20]) {
    const queries = installFetch(() => ({ hit: false }));
    const { html, report } = await resolveWebsiteImagePlaceholders(pageWith(photoCount));
    const asked = photosAsked(queries);
    check(
      `${photoCount} photos: every single one was searched for (${asked}/${photoCount})`,
      asked === photoCount,
      `${photoCount - asked} photo(s) reached the fallback without the library ever being asked`
    );
    eq(`${photoCount} photos: the report counts them all`, report.total, photoCount);
    eq(`${photoCount} photos: and reports every one as a placeholder`, report.fromPlaceholder, photoCount);
    check(
      `${photoCount} photos: no PLACEHOLDER token survives into the page`,
      !html.includes("PLACEHOLDER:"),
      html.slice(0, 200)
    );
    check(
      `${photoCount} photos: the spend stayed inside the budget`,
      queries.length <= unsplashBudgetForPlaceholders(photoCount),
      `spent ${queries.length}, budget ${unsplashBudgetForPlaceholders(photoCount)}`
    );
  }

  // -------------------------------------------------------------------
  console.log("\n== 3. a hit is not broadened, so the common case is cheap ==");
  {
    const queries = installFetch(() => ({ hit: true }));
    const { report } = await resolveWebsiteImagePlaceholders(pageWith(6));
    eq("six photos, six requests", queries.length, 6);
    eq("all six are real", report.fromLibrary, 6);
    eq("and none is a placeholder", report.fromPlaceholder, 0);
    check("the most specific query is the one that was sent", queries[0].split(" ").length === 5, queries[0]);
  }

  // -------------------------------------------------------------------
  console.log("\n== 4. broadening still happens, after everyone has had a turn ==");
  {
    // Only the SHORTEST form of each query matches. That can only be reached
    // by broadening, so a page that resolves here proves phase 2 runs.
    const queries = installFetch((q) => ({ hit: q.split(" ").length === 2 }));
    const { report } = await resolveWebsiteImagePlaceholders(pageWith(4));
    eq("every photo eventually found its photo", report.fromLibrary, 4);
    check("which took more than one request each", queries.length > 4, `${queries.length} requests`);
    // ...and the first pass genuinely came first: the first four requests
    // must be four DIFFERENT photos, not one photo's ladder.
    const firstFour = new Set(queries.slice(0, 4).map((q) => q.match(/subject (\d+)/)?.[1]));
    eq("the first four requests were four different photos", firstFour.size, 4);
  }

  // -------------------------------------------------------------------
  console.log("\n== 5. the breaker still trips, and is reported ==");
  {
    // Unsplash answers 403 + "0 remaining" for an exhausted quota, not 429.
    const queries = installFetch((_q, n) =>
      n <= 2 ? { hit: false } : { status: 403, headers: { "x-ratelimit-remaining": "0" } }
    );
    const { report } = await resolveWebsiteImagePlaceholders(pageWith(10));
    eq("the halt reason is the quota, not the credentials", report.halted, "rate-limited");
    check(
      "and the remaining photos stopped asking",
      queries.length < unsplashBudgetForPlaceholders(10),
      `${queries.length} requests`
    );
    eq("every photo is reported as a placeholder", report.fromPlaceholder, 10);
  }
  {
    const queries = installFetch(() => ({ status: 401 }));
    const { report } = await resolveWebsiteImagePlaceholders(pageWith(5));
    eq("a bad key is reported as a bad key", report.halted, "unauthorised");
    // One BATCH, not one request. Searches run concurrently so that twenty
    // photos do not become twenty sequential round trips, and a response
    // cannot stop requests that are already in flight beside it. Bounding
    // the batch is what keeps a dead key from costing one request per photo:
    // before batching, this page spent 5 of 5.
    check(
      `a dead key costs one batch, not one request per photo (${queries.length} for 5 photos)`,
      queries.length <= 4,
      `${queries.length} requests`
    );
  }

  // -------------------------------------------------------------------
  console.log("\n== 6. the report is honest about what it did ==");
  {
    installFetch((q) => ({ hit: /subject [01] /.test(q) }));
    const { report } = await resolveWebsiteImagePlaceholders(pageWith(5), { requestedRealPhotos: true });
    eq("two real", report.fromLibrary, 2);
    eq("three placeholders", report.fromPlaceholder, 3);
    eq("and they add up to the total", report.fromLibrary + report.fromPlaceholder, report.total);
    eq("the explicit request is carried into the report", report.requestedRealPhotos, true);
    eq("no halt is claimed when none happened", report.halted, null);
  }
  {
    installFetch(() => ({ hit: true }));
    const { report } = await resolveWebsiteImagePlaceholders("<html><body><p>no photos here</p></body></html>");
    eq("a page with no stock photos reports zero, not a failure", report.total, 0);
    eq("and no placeholders", report.fromPlaceholder, 0);
  }
} finally {
  globalThis.fetch = realFetch;
  delete process.env.UNSPLASH_ACCESS_KEY;
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.map((f) => "  - " + f).join("\n"));
}
process.exit(failures.length === 0 ? 0 : 1);
