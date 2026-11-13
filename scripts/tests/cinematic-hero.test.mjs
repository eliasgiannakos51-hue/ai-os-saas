// CINEMATIC SITES — STYLE ΣΤ WIRED INTO GENERATION (the piece Task #22
// falsely claimed was already done; corrected 2026-11-09, docs/PROGRESS.md).
//
// Phase 1a (2026-11-08) shipped the player script and the scanner/CSP
// allowlist but wired NO style into generation — scripts/tests/
// cinematic-players.test.mjs's own file comment says so. This file is
// about the first style that actually IS wired: lib/cinematic/
// hero-storyboard.ts's deterministic, flag-gated parallax on the home
// page's hero image, plus its wiring into both routes that store HTML.
//
// Run: node scripts/tests/cinematic-hero.test.mjs
import { readFileSync } from "node:fs";
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

const HERO_PATH = "src/lib/cinematic/hero-storyboard.ts";
const GENERATE_ROUTE = "src/app/api/websites/generate/process/route.ts";
const EDIT_ROUTE = "src/app/api/websites/edit/route.ts";

const mod = await loadTs(HERO_PATH);
const { applyCinematicHeroParallax } = mod;

// ---------------------------------------------------------------------
console.log("== 1. the function exists and does the one real thing it claims ==");

{
  const html = '<html lang="en"><body><header><img src="/logo.png" alt="Logo"></header></body></html>';
  const out = applyCinematicHeroParallax(html);
  check("applies to the first <img> it finds", out.applied === true);
  check('writes data-ix-depth on that exact <img> tag, not somewhere else', /<img[^>]*\bdata-ix-depth="0\.06"[^>]*src="\/logo\.png"/.test(out.html));
  check("writes the idempotency marker data-ix-hero", /<img[^>]*\bdata-ix-hero=""/.test(out.html));
  check("adds a caption span right after the <img>", /<img[^>]*>\s*<span class="ix-hero-note"/.test(out.html));
  check("the original src and alt survive untouched", out.html.includes('src="/logo.png"') && out.html.includes('alt="Logo"'));
}

console.log("== 2. idempotent — a second pass is a no-op, not a doubled attribute ==");
{
  const html = '<html lang="en"><body><img src="/a.jpg" alt="A"></body></html>';
  const once = applyCinematicHeroParallax(html);
  const twice = applyCinematicHeroParallax(once.html);
  check("first pass applies", once.applied === true);
  check("second pass does NOT apply again", twice.applied === false);
  check("second pass returns the SAME bytes, not a new attribute", twice.html === once.html);
  check("only one data-ix-depth exists after two passes", (twice.html.match(/data-ix-depth=/g) ?? []).length === 1);
  check("only one caption span exists after two passes", (twice.html.match(/ix-hero-note/g) ?? []).length === 1);
}

console.log("== 3. leaves an image that already has its own data-ix-depth alone ==");
{
  const html = '<html lang="en"><body><img src="/a.jpg" data-ix-depth="0.2" alt="A"></body></html>';
  const out = applyCinematicHeroParallax(html);
  check("does not apply a second depth over an existing one", out.applied === false);
  check("the existing depth value is untouched (not overwritten to 0.06)", out.html.includes('data-ix-depth="0.2"'));
}

console.log("== 4. no <img> at all — a no-op, never a crash on a malformed/imageless page ==");
{
  const html = "<html><body><p>No pictures here.</p></body></html>";
  const out = applyCinematicHeroParallax(html);
  check("applied is false with no <img> anywhere", out.applied === false);
  check("the html comes back byte-identical", out.html === html);
}

console.log("== 5. the caption is in the PAGE's own language, not always English ==");
{
  const el = applyCinematicHeroParallax('<html lang="el"><body><img src="/a.jpg" alt="A"></body></html>');
  check('Greek <html lang="el"> gets the Greek caption', el.html.includes("Storyboard · το πλήρες βίντεο AI έρχεται σύντομα"));
  const de = applyCinematicHeroParallax('<html lang="de"><body><img src="/a.jpg" alt="A"></body></html>');
  check('German <html lang="de"> gets the German caption, not the Greek one', de.html.includes("das vollständige KI-Video kommt bald") && !de.html.includes("σύντομα"));
  const unknown = applyCinematicHeroParallax('<html lang="xx-not-a-real-locale"><body><img src="/a.jpg" alt="A"></body></html>');
  check("an unrecognised lang code falls back to English, not a crash or undefined text", unknown.html.includes("Storyboard · full AI video arriving soon"));
  const noLang = applyCinematicHeroParallax('<html><body><img src="/a.jpg" alt="A"></body></html>');
  check("no <html lang> at all also falls back to English", noLang.html.includes("Storyboard · full AI video arriving soon"));
}

console.log("== 6. the caption text is escaped, never raw-injected (this is OUR string, but the pattern must hold) ==");
{
  // Not attacker-controlled today (the ten strings are a fixed table),
  // but escapeHtml is called on the way in rather than trusted — this
  // locks that call in place so a future caller passing dynamic text
  // through the same path does not quietly lose it.
  const src = readFileSync(HERO_PATH, "utf8");
  check("escapeHtml wraps the caption before it is interpolated into the span", /escapeHtml\(caption\)/.test(src));
}

console.log("== 7. wired into BOTH routes that write stored HTML, behind the SAME flag already used for the scanner ==");
{
  const gen = readFileSync(GENERATE_ROUTE, "utf8");
  check("generate route imports applyCinematicHeroParallax", /import\s*\{\s*applyCinematicHeroParallax\s*\}\s*from "@\/lib\/cinematic\/hero-storyboard"/.test(gen));
  check(
    "generate route gates it behind cinematicSitesEnabled, applied to cleaned[0] only (the home document)",
    /if \(cinematicSitesEnabled && cleaned\.length > 0\) \{\s*cleaned\[0\] = applyCinematicHeroParallax\(cleaned\[0\]\)\.html;\s*\}/.test(gen)
  );
  // ORDER: must run before stripDisallowedExternalScripts is computed
  // from `cleaned`, or this step's own output on cleaned[0] is the thing
  // stripDisallowedExternalScripts reads — not a stale copy from before
  // it ran. Anchored on the two full statements in sequence, not "both
  // strings appear somewhere in the file", because every page already
  // calls stripDisallowedExternalScripts and a loose "appears after"
  // check would pass even if the hero step were deleted entirely.
  const heroIdx = gen.indexOf("cleaned[0] = applyCinematicHeroParallax(cleaned[0]).html;");
  const stripIdx = gen.indexOf("const stripped = cleaned.map((doc) => stripDisallowedExternalScripts(doc, cinematicSitesEnabled));");
  check("both statements are present", heroIdx !== -1 && stripIdx !== -1);
  check("the hero step runs BEFORE stripped is computed from cleaned", heroIdx !== -1 && stripIdx !== -1 && heroIdx < stripIdx);

  const edit = readFileSync(EDIT_ROUTE, "utf8");
  check("edit route imports applyCinematicHeroParallax", /import\s*\{\s*applyCinematicHeroParallax\s*\}\s*from "@\/lib\/cinematic\/hero-storyboard"/.test(edit));
  check(
    "edit route gates it behind BOTH cinematicSitesEnabled AND targetIndex === HOME_INDEX — not every edited page",
    /if \(cinematicSitesEnabled && targetIndex === HOME_INDEX\) \{\s*updatedHtml = applyCinematicHeroParallax\(updatedHtml\)\.html;\s*\}/.test(edit)
  );
  const editHeroIdx = edit.indexOf("updatedHtml = applyCinematicHeroParallax(updatedHtml).html;");
  const editStripIdx = edit.indexOf("updatedHtml = stripDisallowedExternalScripts(updatedHtml, cinematicSitesEnabled);");
  check("edit route: both statements present", editHeroIdx !== -1 && editStripIdx !== -1);
  check("edit route: hero step runs before the strip call", editHeroIdx !== -1 && editStripIdx !== -1 && editHeroIdx < editStripIdx);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("Failures:", failures.join(", "));
  process.exit(1);
}
