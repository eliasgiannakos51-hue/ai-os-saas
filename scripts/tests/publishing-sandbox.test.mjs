#!/usr/bin/env node
/*
 * A PUBLISHED PAGE RUNS IN AN ORIGIN OF ITS OWN, NOT OURS.
 *
 * Published sites are served at {origin}/s/{subdomain}, the same origin as
 * the signed-in app. On 2026-10-02, before the CSP `sandbox` directive,
 * scripts/tests/published-origin.prodtest.mjs watched a published page's
 * script read a signed-in visitor's whole session cookie and read
 * /api/credits/balance as them (200, their balance). With the directive the
 * page's origin is "null" and both are gone.
 *
 * That prodtest needs a production build and a browser, so it is not in
 * the build. This is the half that is: it EXECUTES the headers function the
 * routes call (lib/publishing/public-serving.ts) and reads the directive the
 * browser will receive — not the comment above it.
 *
 *   1  the directive is there, WITHOUT allow-same-origin, which next to
 *      allow-scripts would hand the page our origin back
 *   2  it grants only what a generated page needs, by name — a token added
 *      later must be added here with its reason, or this is red
 *   3  every route that returns published HTML sends these headers: the
 *      population is every route.ts under src/app/s/ that returns
 *      html_content, derived, so a new page type cannot skip it
 *
 * Run: node scripts/tests/publishing-sandbox.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const serving = await loadTs("src/lib/publishing/public-serving.ts");
const csp = String(serving.publishedSiteHeaders()["Content-Security-Policy"] ?? "");
const directives = csp.split(";").map((d) => d.trim()).filter(Boolean);
const sandbox = directives.find((d) => d === "sandbox" || d.startsWith("sandbox "));
const tokens = sandbox ? sandbox.split(/\s+/).slice(1) : [];

console.log("== 1. the page is not our origin ==");
check("the published page's CSP has a sandbox directive", Boolean(sandbox), csp);
check("...and exactly one — two would be intersected, and nobody reads the second", directives.filter((d) => d.startsWith("sandbox")).length === 1);
check("...WITHOUT allow-same-origin", !tokens.includes("allow-same-origin"), tokens.join(" "));
check("...and without allow-top-navigation, so it cannot steer the tab that opened it", !tokens.some((t) => t.startsWith("allow-top-navigation")));

console.log("\n== 2. only what a generated page needs, each for a reason ==");
// The reasons are the ones lib/publishing/public-serving.ts gives. A token
// that is not here is red until somebody writes down why the page needs it.
const NEEDED = {
  "allow-scripts": "scroll-reveal and the contact-form handler (lib/website-builder.ts allows exactly those two)",
  "allow-forms": "the contact form",
  "allow-popups": 'target="_blank" links to Instagram, a map, a booking site',
  "allow-popups-to-escape-sandbox": "so the site a link opens is a normal page, not a sandboxed copy",
};
for (const t of tokens) check(`${t} is one the page needs`, Object.hasOwn(NEEDED, t), "add it to NEEDED with its reason, or remove it");
for (const t of Object.keys(NEEDED)) check(`${t} is granted (${NEEDED[t]})`, tokens.includes(t));

console.log("\n== 3. every route that serves published HTML sends it ==");
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}
const servingRoutes = walk("src/app")
  .map((f) => ({ f, code: stripComments(readFileSync(f, "utf8")) }))
  .filter(({ code }) => /html_content/.test(code) && /new Response\(/.test(code));
console.log(`        routes that answer with a Response built from html_content: ${servingRoutes.map((r) => r.f).join(", ")}`);
check("the walk found the public site routes — an empty list would pass the check below", servingRoutes.length >= 2);
for (const { f, code } of servingRoutes) {
  check(`${f} sends publishedSiteHeaders()`, /\.\.\.publishedSiteHeaders\(\)/.test(code));
}

console.log(
  failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`,
);
process.exit(failures.length ? 1 : 0);
