// BOTH V4.6 LINES SURVIVED THE MERGE, IN ALL TEN LANGUAGES.
//
// Two branches implemented parts of V4.6 independently and neither had
// the other's work. main had #10's "what changed"; claude/ten-test-issues
// had #1/#2's first screen — the one sentence and the three runnable
// examples — and sat unmerged for days while production showed neither
// the sentence nor the examples.
//
// A merge that keeps one of two features looks exactly like a merge that
// keeps both, until somebody opens the page. This asserts the pair, and
// it asserts it per LOCALE, because the loss that actually happens is
// "English kept it, Greek did not".
//
// Run: node scripts/tests/both-v46-lines.test.mjs
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const LOCALES = ["ar", "de", "el", "en", "es", "fr", "it", "ja", "pt", "zh"];
const msg = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

console.log("== 1. the first screen — from claude/ten-test-issues-281zpo ==");
const noPromise = LOCALES.filter((l) => typeof msg[l].promise?.oneSentence !== "string" || msg[l].promise.oneSentence.length < 10);
check(`promise.oneSentence in all ten locales (${LOCALES.length - noPromise.length}/10)`, noPromise.length === 0, noPromise.join(", "));
const noExamples = LOCALES.filter((l) => !msg[l].dashboard?.firstScreen);
check(`dashboard.firstScreen in all ten locales (${LOCALES.length - noExamples.length}/10)`, noExamples.length === 0, noExamples.join(", "));
// THE THREE, NAMED. "firstScreen exists" would pass on an empty object.
for (const k of ["build", "understand", "repeat"]) {
  const missing = LOCALES.filter((l) => !msg[l].dashboard?.firstScreen?.[k]?.example);
  check(`  …the "${k}" example, in all ten (${LOCALES.length - missing.length}/10)`, missing.length === 0, missing.join(", "));
}

console.log("\n== 2. what changed — from main ==");
const noWhat = LOCALES.filter((l) => {
  const d = msg[l].dashboard ?? {};
  return !(d.whatChanged || d.overview?.whatChanged);
});
check(`whatChanged in all ten locales (${LOCALES.length - noWhat.length}/10)`, noWhat.length === 0, noWhat.join(", "));

console.log("\n== 3. both are RENDERED, not merely translated ==");
// The merge dropped <FirstScreenExamples/> from the page while every
// string survived, and only a gate that reads the page could tell.
//
// THE STRIP LEFT HOME ON 2026-10-04, by the owner's design (docs/
// CONTEXT.md, «ΑΡΧΙΚΗ»): four quick actions in its place, and the cards —
// what changed among them — on /dashboard/activity. The examples
// themselves live on as deep links (src/lib/overview/first-screen-
// examples.ts), which first-screen.test.mjs holds. So what is asserted
// here is where each line is rendered NOW, read from the pages.
const overview = readFileSync("src/app/dashboard/overview/page.tsx", "utf8");
const activity = readFileSync("src/app/dashboard/activity/page.tsx", "utf8");
check("Home renders the quick actions where the strip was", /<QuickActions\s*\/>/.test(overview),
  "every string can be present and the component still absent — that is what happened");
check("the examples strip is gone from the tree, not merely unrendered",
  !existsSync("src/components/overview/first-screen-examples.tsx") && !/FirstScreenExamples/.test(overview));
check("...and the what-changed card is rendered on Activity", /<WhatChangedCard\b/.test(activity));
check("the greeting header greets from the promise namespace",
  /useTranslations\("promise"\)|getTranslations\("promise"\)/.test(readFileSync("src/components/overview/greeting-header.tsx", "utf8")));

console.log("\n== 4. and the strings they replaced are gone ==");
// Leaving the old ones in the catalogue is how the wrong sentence comes
// back: something renders it and nothing says which is current.
for (const [label, path] of [["landing.hero", ["landing", "hero"]], ["dashboard.overview.heroQuestion", ["dashboard", "overview", "heroQuestion"]]]) {
  const stray = LOCALES.filter((l) => {
    let node = msg[l];
    for (const k of path) { node = node?.[k]; if (node === undefined) return false; }
    return true;
  });
  check(`${label} is gone from every locale (${stray.length} left)`, stray.length === 0, stray.join(", "));
}

console.log("\n== 5. the client is actually sent the namespace ==");
// promise.oneSentence in the catalogue is not the same as promise
// reaching the browser — message-slices decides what ships.
const slices = readFileSync("src/lib/i18n/message-slices.ts", "utf8");
check("the dashboard group ships `promise`", /"promise"/.test(slices),
  "the sentence would render as a raw key on the client");
check("...and still ships `sampleData`", /"sampleData"/.test(slices),
  "the other line's namespace must not have been dropped to make room");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
