#!/usr/bin/env node
/*
 * CAN cinematic-hero.test.mjs SEE THE DEPTH ATTRIBUTE LANDING ON THE
 * WRONG TAG, A SECOND PASS DOUBLING UP, THE WRONG LANGUAGE SHIPPING, OR
 * THE HOME-PAGE GATE ON THE EDIT ROUTE DROPPING SO EVERY PAGE GETS A
 * PARALLAXED LOGO?
 *
 * Run: node scripts/tests/cinematic-hero.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/cinematic-hero.test.mjs";
const HERO = "src/lib/cinematic/hero-storyboard.ts";
const GENERATE_ROUTE = "src/app/api/websites/generate/process/route.ts";
const EDIT_ROUTE = "src/app/api/websites/edit/route.ts";

const MUTANTS = [
  {
    name: "existing data-ix-depth guard dropped — this is ALSO the idempotency check (a second pass's first <img> already carries one): drop it and BOTH a re-run and an image with its own depth get overwritten",
    file: HERO,
    from: 'if (/\\bdata-ix-depth=/.test(tag)) return { html, applied: false };',
    to: "",
    expect: "does not apply a second depth over an existing one",
  },
  {
    name: "language lookup stops reading <html lang> — every caption ships in English regardless of the page's own language",
    file: HERO,
    from: "const lang = (HTML_LANG.exec(html)?.[1] ?? \"en\").toLowerCase().slice(0, 2);",
    to: 'const lang = "en";',
    expect: "Greek <html lang=\"el\"> gets the Greek caption",
  },
  {
    name: "caption no longer escaped before interpolation",
    file: HERO,
    from: "escapeHtml(caption)",
    to: "caption",
    expect: "escapeHtml wraps the caption before it is interpolated into the span",
  },
  {
    name: "generate route: cinematic-sites flag gate dropped — EVERY generation gets the parallax, even with the switch off",
    file: GENERATE_ROUTE,
    from: "if (cinematicSitesEnabled && cleaned.length > 0) {",
    to: "if (cleaned.length > 0) {",
    expect: "generate route gates it behind cinematicSitesEnabled",
  },
  {
    name: "generate route: hero step moved after stripped is computed — strip reads cleaned[0] before the hero step ever touches it",
    file: GENERATE_ROUTE,
    from:
      "      if (cinematicSitesEnabled && cleaned.length > 0) {\n" +
      "        cleaned[0] = applyCinematicHeroParallax(cleaned[0]).html;\n" +
      "      }\n" +
      "      const stripped = cleaned.map((doc) => stripDisallowedExternalScripts(doc, cinematicSitesEnabled));",
    to:
      "      const stripped = cleaned.map((doc) => stripDisallowedExternalScripts(doc, cinematicSitesEnabled));\n" +
      "      if (cinematicSitesEnabled && cleaned.length > 0) {\n" +
      "        cleaned[0] = applyCinematicHeroParallax(cleaned[0]).html;\n" +
      "      }",
    expect: "the hero step runs BEFORE stripped is computed from cleaned",
  },
  {
    name: "edit route: HOME_INDEX guard dropped — editing ANY page (About, Contact) parallaxes that page's own first image",
    file: EDIT_ROUTE,
    from: "if (cinematicSitesEnabled && targetIndex === HOME_INDEX) {",
    to: "if (cinematicSitesEnabled) {",
    expect: "edit route gates it behind BOTH cinematicSitesEnabled AND targetIndex === HOME_INDEX",
  },
];

runMutations({
  name: "cinematic-hero",
  gate: GATE,
  targets: [HERO, GENERATE_ROUTE, EDIT_ROUTE],
  mutants: MUTANTS,
});
