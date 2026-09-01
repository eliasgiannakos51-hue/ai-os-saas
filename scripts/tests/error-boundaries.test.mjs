#!/usr/bin/env node
/*
 * WHAT A PERSON SEES WHEN SOMETHING BREAKS.
 *
 * THE DEFECT. A React error #310 was observed on /dashboard/overview in a
 * production build — two runs in seven — and the screen it would have
 * fallen back to had three faults, all of which only show when somebody
 * actually hits it:
 *
 *   * IT WAS IN ENGLISH. "something went wrong", "retry()", hard-coded,
 *     in a product that ships in ten languages.
 *   * IT PRINTED error.message, which in a production build reads
 *     "Minified React error #310; visit https://react.dev/…" — useless to
 *     the reader, and a raw error string on a page is what
 *     lib/scrub-secrets.ts exists to prevent. A Postgres error carrying a
 *     connection string would have rendered here verbatim.
 *   * IT REPORTED NOWHERE. console.error only, while /api/client-error
 *     and components/ui/widget-boundary.tsx already existed for exactly
 *     this — and WidgetBoundary was used on NO page at all.
 *
 * Run: node scripts/tests/error-boundaries.test.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => readFileSync(p, "utf8");

const BOUNDARIES = ["src/app/dashboard/error.tsx", "src/app/dashboard/overview/error.tsx"];

console.log("== 1. the screens exist, and the Home has its own ==");
for (const f of BOUNDARIES) {
  check(`${f.replace("src/app/", "")} exists`, existsSync(f),
    "without one, a render error blanks the segment");
}

console.log("== 2. none of them prints the raw error ==");
for (const f of BOUNDARIES) {
  const src = read(f);
  check(`${path.basename(path.dirname(f))}: does not render error.message`,
    !/\{\s*error\.message/.test(src) && !/error\.message \|\|/.test(src),
    "'Minified React error #310' is not something a reader can act on, and a raw message is a string nobody scrubbed");
  check(`  ...and shows the digest instead, which matches the server log`,
    /error\.digest/.test(src),
    "the digest is the one value support can ask for");
}

console.log("== 3. all of them are translated ==");
{
  const el = JSON.parse(read("messages/el.json"));
  const KEYS = ["title", "body", "reload", "section", "sectionBody"];
  for (const k of KEYS) {
    const v = el.errors?.boundary?.[k];
    check(`errors.boundary.${k} exists in Greek`, typeof v === "string" && v.length > 0, String(v));
    // AND IS ACTUALLY GREEK, not the English copied across. The i18n
    // ratchet counts literals; it does not read them.
    check(`  ...and is written in Greek`, /[Ͱ-Ͽἀ-῿]/.test(String(v)), String(v));
  }
  // Every locale, including the two the language gates always name.
  for (const loc of ["en", "el", "de", "es", "fr", "it", "ja", "pt", "zh", "ar"]) {
    const b = JSON.parse(read(`messages/${loc}.json`)).errors?.boundary;
    check(`${loc}: all ${KEYS.length} boundary strings present`,
      KEYS.every((k) => typeof b?.[k] === "string" && b[k].length > 0),
      JSON.stringify(b));
  }
  const ar = JSON.parse(read("messages/ar.json")).errors.boundary.title;
  check("ar is written in Arabic script", /[؀-ۿ]/.test(ar), ar);
  const zh = JSON.parse(read("messages/zh.json")).errors.boundary.title;
  check("zh is written in Han characters", /[一-鿿]/.test(zh), zh);
  for (const f of BOUNDARIES) {
    check(`${path.basename(path.dirname(f))}: resolves its strings through next-intl`,
      /useTranslations\("errors\.boundary"\)/.test(read(f)));
  }
}

console.log("== 4. every one of them reports where the owner will see it ==");
for (const f of [...BOUNDARIES, "src/components/ui/widget-boundary.tsx"]) {
  const src = read(f);
  check(`${f.split("/").pop()} posts to /api/client-error`,
    /fetch\("\/api\/client-error"/.test(src),
    "a dashboard crashing for every user must not be invisible to /dashboard/system-health");
  check(`  ...and swallows a failed report rather than cascading`,
    /\.catch\(\(\) => \{/.test(src),
    "a second failure on the screen whose job is to stay standing");
}

console.log("== 5. the widget boundary is actually USED ==");
{
  // It existed, was correct, reported properly — and was imported by
  // nothing. The same shape as the scrubber wired to one caller.
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(p)) files.push(p);
    }
  })("src");
  check(`the tree was scanned (${files.length} files)`, files.length >= 200);
  const users = files.filter(
    (f) => f !== "src/components/ui/widget-boundary.tsx" && /WidgetBoundary/.test(read(f))
  );
  check(`WidgetBoundary is used by at least one page (${users.length})`, users.length >= 1,
    "a boundary nothing wraps is a file, not a boundary");
  const home = "src/app/dashboard/overview/page.tsx";
  const wraps = (read(home).match(/<WidgetBoundary\b/g) ?? []).length;
  check(`the Home wraps its client widgets individually (${wraps})`, wraps >= 3,
    "one card failing must not take the first screen after signing in");
  check("...and hands the boundary its translated strings",
    /tErr\("boundary\.section"\)/.test(read(home)),
    "the boundary is a class component and cannot call useTranslations itself");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
