// CINEMATIC SITES, PHASE 1a (docs/v6-cinematic-sites-2026-10-03.md).
//
// The research round picked a style library of scroll-driven, looping and
// turning product pages — and a single rule for how any of it may run on
// a published site: "the model writes no JavaScript", one shared script
// configured only by data attributes. This is the first slice that
// actually ships: the script itself, served, and the one path a generated
// page is allowed to reference it by — everything the next slice (wiring
// an actual style into generation) will stand on.
//
// No cinematic STYLE is wired into generation yet. This file is about
// whether the DOOR exists and is the right width — not about whether
// anything walks through it, which is why every test here is either about
// the shipped script's own shape or about the scanner/flag gate, never
// about website-builder.ts's prompt (it asks for none of this yet).
//
// Run: node scripts/tests/cinematic-players.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const PLAYERS_PATH = "public/ionexa-players.js";
const SCAN = "src/lib/website-html-security-scan.ts";

// ---------------------------------------------------------------------
console.log("== 1. the shipped script exists, and holds the shape the research round decided ==");
check("public/ionexa-players.js exists", existsSync(PLAYERS_PATH));
const script = readFileSync(PLAYERS_PATH, "utf8");
check("it is an IIFE in strict mode (nothing it declares leaks onto the page)", /\(function \(\) \{\s*\n\s*"use strict";/.test(script));
check("it exposes window.IonexaPlayers, and nothing else global", /window\.IonexaPlayers\s*=\s*\{/.test(script));
check("it reads prefers-reduced-motion and goes still, never 'half motion'", /prefers-reduced-motion:\s*reduce/.test(script) && /ix-still/.test(script));
check("it treats Save-Data and 2G/3G the same as reduced motion", /saveData/.test(script) && /2g\|3g/.test(script));
check("every player kind the style library needs is implemented", ["loop", "sequence", "rotate", "parallax"].every((k) => script.includes(`"${k}"`) || new RegExp(`\\b${k}\\b`).test(script)));
check("the phone gets its own source via a -mobile data attribute, not a separate script", /data-.*-mobile/.test(script));
check("a player starts from the poster already in the HTML, never waits for motion to show something", /ix-live/.test(script) && /poster/.test(script));
check("rotation is draggable (pointerdown/pointermove), for the 360° product-turn style", /pointerdown/.test(script) && /pointermove/.test(script));

// ---------------------------------------------------------------------
console.log("\n== 2. the scanner's allowlist is exact, not a prefix or substring match ==");
const scan = await loadTs(SCAN);
check("the allowlist names exactly our own shipped path", scan.ALLOWED_OWN_SCRIPT_SRCS.length === 1 && scan.ALLOWED_OWN_SCRIPT_SRCS[0] === "/ionexa-players.js");
check("the exact path is allowed", scan.isAllowedOwnScriptSrc("/ionexa-players.js") === true);
check("a trailing slash is NOT the same path", scan.isAllowedOwnScriptSrc("/ionexa-players.js/") === false);
check("a query string is NOT the same path", scan.isAllowedOwnScriptSrc("/ionexa-players.js?x=1") === false);
check("path traversal after it is rejected", scan.isAllowedOwnScriptSrc("/ionexa-players.js/../../evil.js") === false);
check("a DIFFERENT file at the same name elsewhere is rejected", scan.isAllowedOwnScriptSrc("/scripts/ionexa-players.js") === false);
// THE SAME BUG SHAPE host-and-word-boundaries.test.mjs exists to keep
// closed for the iframe and form-action allowlists: a substring or
// startsWith check would wave these through.
check("protocol-relative (external host, same scheme) is rejected", scan.isAllowedOwnScriptSrc("//evil.example/ionexa-players.js") === false);
check("an absolute URL on OUR OWN real domain is still rejected — only a relative reference is ever needed", scan.isAllowedOwnScriptSrc("https://ionexa.ai/ionexa-players.js") === false);
check("an absolute URL with userinfo built to look like our path is rejected", scan.isAllowedOwnScriptSrc("https://ionexa.ai@evil.example/ionexa-players.js") === false);
check("a bare filename with no leading slash is rejected (not the declared path)", scan.isAllowedOwnScriptSrc("ionexa-players.js") === false);
check("an empty string is rejected", scan.isAllowedOwnScriptSrc("") === false);

// ---------------------------------------------------------------------
console.log("\n== 3. the scan and the strip agree, and both are gated by the same switch ==");
const page = (scripts) => `<!doctype html><html><head></head><body>${scripts}</body></html>`;
const OURS = `<script src="/ionexa-players.js"></script>`;
const EVIL = `<script src="https://evil.example/x.js"></script>`;

check("with the switch OFF, our own script is still flagged — fails closed",
  scan.scanWebsiteHtmlForSecurityIssues(page(OURS), { cinematicSitesEnabled: false }).some((i) => i.type === "external_script"));
check("...and stripped",
  !scan.stripDisallowedExternalScripts(page(OURS), false).includes("<script"));
check("with no options object at all (the old call shape), it is still flagged and stripped",
  scan.scanWebsiteHtmlForSecurityIssues(page(OURS)).some((i) => i.type === "external_script") &&
  !scan.stripDisallowedExternalScripts(page(OURS)).includes("<script"));
check("with the switch ON, our own script is NOT flagged",
  !scan.scanWebsiteHtmlForSecurityIssues(page(OURS), { cinematicSitesEnabled: true }).some((i) => i.type === "external_script"));
check("...and NOT stripped",
  scan.stripDisallowedExternalScripts(page(OURS), true).includes(OURS));
check("with the switch ON, a genuinely external script is STILL flagged",
  scan.scanWebsiteHtmlForSecurityIssues(page(EVIL), { cinematicSitesEnabled: true }).some((i) => i.type === "external_script"));
check("...and STILL stripped",
  !scan.stripDisallowedExternalScripts(page(EVIL), true).includes("<script"));
check("a page with BOTH keeps ours and loses the other, switch on",
  (() => {
    const out = scan.stripDisallowedExternalScripts(page(OURS + EVIL), true);
    return out.includes(OURS) && !out.includes("evil.example");
  })());

// ---------------------------------------------------------------------
console.log("\n== 4. the CSP already covers it, with no change needed there ==");
const serving = readFileSync("src/lib/publishing/public-serving.ts", "utf8");
check("script-src keeps 'self' (same-origin is how /ionexa-players.js loads at all)", /"script-src 'self' 'unsafe-inline'"/.test(serving));
// DOC, not behaviour — there is no CSP code change to execute here (the
// existing 'self' already covers /ionexa-players.js, a same-origin
// static asset); the guarantee is that the comment says so, instead of
// leaving the next reader to assume "generated sites never reference a
// file" and wonder why one suddenly works.
check("DOC, not behaviour: the comment explains the one exception, so the next reader is not told 'generated sites never reference a file'", /ionexa-players\.js/.test(serving) && /cinematic sites/.test(serving));

// ---------------------------------------------------------------------
console.log("\n== 5. wired into both routes, reading the SAME flag value for strip and scan ==");
for (const [name, file] of [
  ["generate", "src/app/api/websites/generate/process/route.ts"],
  ["edit", "src/app/api/websites/edit/route.ts"],
]) {
  const src = readFileSync(file, "utf8");
  check(`${name}: imports isFeatureOn`, /from "@\/lib\/flags\/flags"/.test(src));
  check(`${name}: reads the "cinematic-sites" switch`, /isFeatureOn\("cinematic-sites", user\)/.test(src));
  // [^;]*, not [^)]* — the scan call nests its own parens
  // (getSiteHostname()) before cinematicSitesEnabled, which a
  // paren-excluding class would stop at. (?!:) — the flag must be passed
  // as the variable itself (bare, or shorthand-property), never as
  // "cinematicSitesEnabled: true/false", which still contains the bare
  // name as a substring but hardcodes the value.
  check(`${name}: passes it to stripDisallowedExternalScripts`, /stripDisallowedExternalScripts\([^;]*cinematicSitesEnabled(?!:)/.test(src));
  check(`${name}: passes it to scanWebsiteHtmlForSecurityIssues`, /scanWebsiteHtmlForSecurityIssues\([^;]*cinematicSitesEnabled(?!:)/.test(src));
}
// ONE READ, NOT TWO — a second isFeatureOn call could read a different
// value than the first if the flag is flipped between them (readFlagAudiences
// hits the database every call), which would let the strip and the scan
// disagree on the same request.
for (const file of ["src/app/api/websites/generate/process/route.ts", "src/app/api/websites/edit/route.ts"]) {
  const src = readFileSync(file, "utf8");
  const count = (src.match(/isFeatureOn\("cinematic-sites", user\)/g) || []).length;
  check(`${file}: the switch is read exactly once per request`, count === 1, `found ${count}`);
}

// ---------------------------------------------------------------------
console.log("\n== 6. the flag is declared and starts closed, like every other switch ==");
const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");
check("\"cinematic-sites\" is a declared key", /"cinematic-sites":/.test(flagsSrc));
// flags.ts imports the admin Supabase client, which load-ts.mjs's bundler
// (no external-package resolution — see its own "Unsupported external
// import" guard) can't pull in. feature-flags.test.mjs's own fix is
// reused here rather than re-invented: strip to the half above
// readFlagAudiences, which is where FLAGS and defaultAudienceOf live,
// and load THAT from a temp file.
const pureFlags = flagsSrc
  .replace(/^import[^\n]*\n/gm, "")
  .split("export async function readFlagAudiences")[0]
  .replace("export { FLAG_AUDIENCES, type FlagAudience };", readFileSync("src/lib/flags/audience.ts", "utf8").replace(/\/\*\*[\s\S]*?\*\//, ""));
const { mkdtempSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const dir = mkdtempSync(join(tmpdir(), "cinematic-flags-"));
writeFileSync(join(dir, "flags.ts"), pureFlags);
const { FLAGS, defaultAudienceOf } = await loadTs(join(dir, "flags.ts"));
check("it is a real key on FLAGS", Object.prototype.hasOwnProperty.call(FLAGS, "cinematic-sites"));
check("it starts at the default (staff), not at everyone", defaultAudienceOf("cinematic-sites") === "staff");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
