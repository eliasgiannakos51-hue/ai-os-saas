// GUARDS THAT NOTHING WAS WATCHING.
//
// scripts/tests/unguarded-guards.mjs removes one guard at a time and runs
// the whole unit suite. Nine were probed; SEVEN could be removed with the
// suite still green. A guard nothing catches is one of two things, and
// the experiment cannot tell them apart — redundant, or load-bearing and
// unguarded. This file is the second answer, written after reading each
// one: every guard below is load-bearing, and each check here provably
// fails without it.
//
// The question came from `stripped.length === ch.length` in
// lib/text/unicode-patterns.ts, which turned out to protect FIVE scripts
// with nothing in the file saying so. That one IS watched now — by the
// fold-collision pairs in host-and-word-boundaries.test.mjs — and the
// experiment confirmed it: removing BOTH folding guards goes red on Thai.
// It also showed why one-at-a-time was not enough: with either guard in
// place the other is a no-op, so each alone reported as unwatched.
//
// Run: node scripts/tests/guard-witnesses.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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

console.log("== 1. the constant-time compare rejects a length mismatch FIRST ==");
// node:crypto's timingSafeEqual THROWS a RangeError on buffers of
// different length. Without the guard, an OAuth state that simply does
// not match becomes a 500 instead of a clean rejection — on the callback
// path, where the user sees it.
//
// crypto.ts is `server-only`, so it cannot be loaded here. What can be
// tested is the CLAIM about node:crypto that the guard exists for, plus
// the guard's presence — and this file says which of the two it is doing
// rather than implying it exercised the app's function.
const { timingSafeEqual } = await import("node:crypto");
let threw = false;
try {
  timingSafeEqual(Buffer.from("ab"), Buffer.from("abc"));
} catch {
  threw = true;
}
check("timingSafeEqual throws on a length mismatch (the reason the guard exists)", threw);
check(
  "...and it never sees one: secretsMatch returns false first",
  /if \(bufA\.length !== bufB\.length\) return false;\s*\n\s*return timingSafeEqual/.test(
    stripComments(readFileSync("src/lib/integrations/crypto.ts", "utf8"))
  ),
  "SOURCE-SHAPE CHECK, not a behavioural one — the module is server-only. " +
    "Without the guard an OAuth state mismatch throws instead of returning false."
);

console.log("\n== 2. a file id that is not yours is refused, not silently dropped ==");
// Both routes SELECT the requested ids filtered by user_id, then insert
// the filtered list. So removing the guard is not a leak — nobody else's
// file is added. It is a silent partial success: ask for five files, get
// a collection with three and a 200, and nothing says which two vanished.
for (const file of [
  "src/app/api/files/collections/route.ts",
  "src/app/api/files/collections/[id]/route.ts",
]) {
  const src = stripComments(readFileSync(file, "utf8"));
  check(
    `${file.split("/").slice(-2).join("/")}: the count is compared`,
    /\.length !== requested\.length/.test(src),
    "without it a typo'd or foreign id disappears from the request and the response says nothing"
  );
  check(
    `...and the mismatch is a 404, not a shrug`,
    /status: 404/.test(src),
    "a partial success returned as 200 is a lie about what was created"
  );
  // AND THE INSERT USES THE FILTERED LIST. This is what makes the missing
  // guard a UX fault rather than an IDOR, and it is worth pinning: if the
  // insert ever switched to `requested`, the same missing guard WOULD be
  // an IDOR.
  check(
    `...and the insert uses the OWNED list, never the requested one`,
    /(owned|ownedIds)\.map\(\(fileId\) => \(\{/.test(src) && !/requested\.map\(/.test(src),
    "inserting `requested` would make the guard the only thing between a user and another user's files"
  );
}

console.log("\n== 3. a whitespace-only string is absent, not present ==");
const unsplash = await loadTs("src/lib/unsplash.ts");
// photoFromSearchResult is the exported path through nonEmptyString.
// EVERY FIELD WHITESPACE, NOT ONE OF THEM EMPTY. The first version of
// this passed "" for download_location — and `!downloadLocation` rejects
// "" whether or not the trim guard is there, so the test passed for a
// reason that had nothing to do with the guard it was written for. The
// experiment caught it: the guard came back UNWATCHED with this test
// already in place. Only a string that is non-empty AND blank isolates
// `.trim() !== ""`.
const blank = unsplash.photoFromSearchResult({
  urls: { regular: "   " },
  user: { name: "  ", links: { html: "\t" } },
  links: { download_location: " " },
});
check("a photo whose every field is only whitespace is not a photo", blank === null, JSON.stringify(blank));
const real = unsplash.photoFromSearchResult({
  urls: { regular: "https://images.example/p.jpg" },
  user: { name: "A Photographer", links: { html: "https://example/u" } },
  links: { download_location: "https://api.example/d" },
});
check("...and a real one still is", real !== null && real.url === "https://images.example/p.jpg", JSON.stringify(real));

const tradingSrc = stripComments(readFileSync("src/lib/trading/load.ts", "utf8"));
check(
  "trading/load: a whitespace-only field reads as absent",
  /value\.trim\(\) \? value : null/.test(tradingSrc),
  "SOURCE-SHAPE: without it a trade shows a symbol of three spaces as though it had one"
);

console.log("\n== 4. an unparseable date is dropped, not passed to the query ==");
const searchSrc = stripComments(readFileSync("src/app/api/search/route.ts", "utf8"));
check(
  "the date is parsed before it is used",
  /!Number\.isNaN\(Date\.parse\(sinceRaw\)\)/.test(searchSrc),
  "SOURCE-SHAPE: `?since=banana` would reach Postgres as a timestamp comparison"
);

console.log("\n== 5. a bad env number falls back instead of poisoning a threshold ==");
// NOT LOADED: production-errors.ts reaches lib/supabase/admin.ts, which
// load-ts.mjs refuses (an external node_modules import). The first
// version of this section loaded it anyway and asserted
// `typeof x === "function" || true` beside it — a check that cannot go
// red, which is the shape this repo's gate-vacuity gate exists to catch,
// written by hand in the file about unwatched guards.
const prodSrc = stripComments(readFileSync("src/lib/production-errors.ts", "utf8"));
check(
  "a non-finite or non-positive value falls back",
  /Number\.isFinite\(parsed\) && parsed > 0 \? parsed : fallback/.test(prodSrc),
  "SOURCE-SHAPE: without it ALERT_MIN_OCCURRENCES=0 or =abc makes every error an alert, or none"
);

console.log("\n== 6. and the pair that started this stays watched ==");
// Both folding guards removed TOGETHER is the mutation that goes red;
// either one alone is a no-op. host-and-word-boundaries.test.mjs holds
// the fifteen collision pairs that catch it.
const foldGate = readFileSync("scripts/tests/host-and-word-boundaries.test.mjs", "utf8");
check("the fold-collision pairs exist", /FOLD_PAIRS/.test(foldGate));
for (const script of ["Korean", "Thai", "Hebrew", "Devanagari", "Arabic", "Japanese", "Vietnamese"]) {
  check(`...covering ${script}`, foldGate.includes(script));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
