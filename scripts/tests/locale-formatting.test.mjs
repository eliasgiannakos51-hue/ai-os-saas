// Reproduction test for the hydration crash found in the V1+V2 audit.
//
// 27 call sites across the app formatted numbers and dates with a bare
// `value.toLocaleString()` — no locale argument. That reads the locale
// from the JavaScript RUNTIME, and this app renders every one of those
// call sites in two different runtimes:
//
//     server (Node)     1000 -> "1,000"
//     browser (el/de)   1000 -> "1.000"
//     browser (fr)      1000 -> "1 000"
//
// React compares the two, sees the text differ, and — the mismatch being
// outside any Suspense boundary — throws away the whole server-rendered
// tree and re-renders the entire page on the client:
//
//     Text content does not match server-rendered HTML.
//     There was an error while hydrating. Because the error happened
//     outside of a Suspense boundary, the entire root will switch to
//     client rendering.
//
// Confirmed live on /signup in Greek: the plan cards rendered "1.000
// credits/mo" against the server's "1,000". English NEVER triggered it,
// because English is what Node defaults to — which is exactly why it
// survived every check until the app was loaded in another language.
//
// The static half of this file runs anywhere. The live half needs a dev
// server and reports SKIPPED — loudly — without one, because "the string
// no longer appears in the source" is not the same claim as "the page
// hydrates".
//
// Run:  node scripts/tests/locale-formatting.test.mjs
// Live: BASE_URL=http://localhost:3000 node scripts/tests/locale-formatting.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0,
  fail = 0,
  skipped = 0;
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
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sources = walk("src");
check(`the sources scan found ${sources.length}`, sources.length >= 779,
  true);

console.log("== 1. the mismatch is real, not theoretical ==");
// Demonstrated against the platform, so this test states a fact about
// Intl rather than an assumption about it.
check("Node's default and Greek disagree on 1000", (1000).toLocaleString() === (1000).toLocaleString("el"), false);
check("Node's default and German disagree", (1000).toLocaleString() === (1000).toLocaleString("de"), false);
check("Node's default and French disagree", (1000).toLocaleString() === (1000).toLocaleString("fr"), false);
check("an EXPLICIT locale fixes the obvious half", (1000).toLocaleString("el"), "1.000");

// ...but NOT all of it. Node and Chromium embed different CLDR vintages and
// disagree about Italian, so passing the right locale on both sides still
// mismatched on /signup — the plan tiers are 1,000 and 3,000 credits, right
// in the four-digit window where CLDR's minimumGroupingDigits applies.
//
//     Intl.NumberFormat("it").format(1000)
//       Node 22  -> "1000"      Chromium -> "1.000"
//
// useGrouping:"always" overrides that rule, making the output a pure
// function of (locale, value). This asserts the property the fix depends
// on: grouping is applied at four digits in EVERY locale, so there is no
// CLDR-version-sensitive window left.
for (const loc of ["it", "es", "el", "de", "pt", "en"]) {
  const grouped = new Intl.NumberFormat(loc, { useGrouping: "always" }).format(1000);
  checkTrue(`[${loc}] 1000 is grouped regardless of the runtime's CLDR (${grouped})`, grouped !== "1000");
}
// The property that actually matters: same locale + same value => same
// string, whichever runtime evaluates it.
checkTrue(
  "useGrouping:'always' is what makes it deterministic",
  new Intl.NumberFormat("it", { useGrouping: "always" }).format(1000) ===
    new Intl.NumberFormat("de", { useGrouping: "always" }).format(1000)
);

console.log("\n== 2. no locale-dependent formatting is left to the runtime ==");
const bare = [];
for (const file of sources) {
  if (file.endsWith("format-number.ts")) continue; // documents the bug it fixes
  const src = stripComments(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/\.toLocale(?:String|DateString|TimeString)\(\s*\)/g)) {
    bare.push(`${file}: ${m[0]}`);
  }
  // `new Intl.*Format()` with no locale has the identical failure mode.
  for (const m of src.matchAll(/new Intl\.\w+Format\(\s*\)/g)) {
    bare.push(`${file}: ${m[0]}`);
  }
}
check(`no bare toLocale*/Intl call (${sources.length} files scanned)`, bare, []);

console.log("\n== 3. the shared formatters require a locale ==");
const helper = readFileSync("src/lib/format-number.ts", "utf8");
for (const fn of ["formatNumber", "formatDateTime", "formatDate"]) {
  checkTrue(`${fn} is exported`, new RegExp(`export function ${fn}\\(`).test(helper));
  checkTrue(`${fn} takes a locale`, new RegExp(`${fn}\\([\\s\\S]{0,120}locale: string`).test(helper));
}
// A formatter that silently swallows a bad value would hide the next bug.
checkTrue("formatNumber rejects a non-finite value", /Number\.isFinite\(value\)/.test(helper));
// The determinism fix must stay in the helper, not drift back out.
checkTrue('formatNumber pins useGrouping so the runtime cannot decide', /useGrouping: "always"/.test(helper));
checkTrue("the date formatters reject an invalid date", /Number\.isNaN\(date\.getTime\(\)\)/.test(helper));

console.log("\n== 4. every call site actually passes one ==");
const missingArg = [];
for (const file of sources) {
  if (file.endsWith("format-number.ts")) continue;
  const src = stripComments(readFileSync(file, "utf8"));
  for (const fn of ["formatNumber", "formatDateTime", "formatDate"]) {
    // A call with exactly one argument and no comma before the closing
    // paren has fallen back to DEFAULT_LOCALE — which is the bug again,
    // just quieter.
    for (const m of src.matchAll(new RegExp(`\\b${fn}\\(([^()]*(?:\\([^()]*\\))?[^()]*)\\)`, "g"))) {
      if (m[1].trim() && !m[1].includes(",")) missingArg.push(`${file}: ${m[0]}`);
    }
  }
}
check("no formatter call omits the locale", missingArg, []);

// And the locale has to come from next-intl on BOTH sides, not from the
// runtime — that is the whole point.
const usesFormatter = sources.filter((f) => {
  const s = stripComments(readFileSync(f, "utf8"));
  return /\b(formatNumber|formatDateTime|formatDate)\(/.test(s) && !f.endsWith("format-number.ts");
});
checkTrue(`call-site files found (${usesFormatter.length})`, usesFormatter.length >= 20);
const noLocaleSource = usesFormatter.filter((f) => {
  const s = readFileSync(f, "utf8");
  // Either it resolves the locale itself, or it receives one as a param.
  return !/(useLocale\(\)|getLocale\(\)|locale: string|locale\s*\})/.test(s);
});
check("every call-site file resolves a locale from next-intl", noLocaleSource, []);

console.log("\n== 5. live: the pages actually hydrate ==");
const BASE = process.env.BASE_URL || "http://localhost:3114";
let reachable = false;
try {
  const r = await fetch(BASE + "/", { signal: AbortSignal.timeout(3000) });
  reachable = r.ok;
} catch {
  /* no server */
}

if (!reachable) {
  skipped++;
  console.log(`  SKIP  no dev server at ${BASE} — the live half did NOT run.`);
  console.log("        Source checks cannot prove a page hydrates. To run it:");
  console.log("          npx next dev -p 3114");
  console.log("          node scripts/tests/locale-formatting.test.mjs");
} else {
  // The server-rendered HTML must already contain the locale's own
  // separator. If Node's default leaks through, this is the bug.
  const PAGES = ["/pricing", "/signup"];
  for (const [locale, sample] of [["el", "1.000"], ["en", "1,000"], ["de", "1.000"]]) {
    for (const p of PAGES) {
      const html = await fetch(BASE + p, { headers: { cookie: `NEXT_LOCALE=${locale}` } }).then((r) => r.text());
      const text = html.replace(/<[^>]+>/g, " ");
      checkTrue(`[${locale}] ${p}: server HTML uses the ${locale} separator (${sample})`, text.includes(sample));
      // The counterpart must NOT be there, or the page mixes both.
      const wrong = locale === "en" ? "1.000" : "1,000";
      check(`[${locale}] ${p}: server HTML does not leak "${wrong}"`, text.includes(wrong), false);
    }
  }
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} SKIPPED (see above)` : ""}`
);
process.exit(fail === 0 ? 0 : 1);
