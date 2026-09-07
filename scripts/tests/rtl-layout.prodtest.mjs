#!/usr/bin/env node
/*
 * THE APPLICATION, IN ARABIC, IN A REAL BROWSER.
 *
 * WHY THIS FILE EXISTS AT ALL. src/lib/website-builder.ts carries a
 * section called WRITING DIRECTION. It tells every model this product
 * calls: put dir="rtl" on <html>, lay out with logical properties, never
 * hide with a negative offset, mirror the icons that point and only
 * those, and do not scroll sideways in EITHER direction. That section was
 * written because a real Arabic site came back with ~10,000px of
 * horizontal scroll.
 *
 * The application shipped `<html lang="ar">` with no dir at all while
 * demanding all of that from others. src/i18n/constants.ts said so in a
 * comment, honestly, for weeks — which is better than hiding it and still
 * not the same as it working.
 *
 * THE RULES ARE READ OUT OF THE PROMPT, not retyped here. honeypot-rtl
 * .prodtest.mjs already established the reason: a copy passes forever
 * while the real instruction drifts. scripts/tests/rtl.test.mjs is the
 * static half of the same idea and does the reading; this file measures
 * the BEHAVIOUR those rules decide, which is a different claim.
 *
 * WHY 390 AND 1440. 390 is the iPhone the app is most used on (375 is
 * measured by layout-stress.prodtest.mjs; 390 is the newer default and is
 * the width the owner named). 1440 is the laptop it is designed on. A
 * mirrored layout breaks at both, for different reasons: at 390 because
 * a sidebar overlays, at 1440 because a fixed-width rail sits on the
 * physical side it was pinned to.
 *
 * WHY ENGLISH IS MEASURED TOO, AND IS NOT DECORATION. The honeypot defect
 * measured 0px in every Latin-script page and 9,975px in Arabic from
 * IDENTICAL markup. A check that only runs in Arabic cannot tell a fix
 * from a regression in the other nine locales; a check that only runs in
 * English is the check that missed the bug. Both, or neither is worth
 * anything.
 *
 *   --before   capture screenshots and PRINT the numbers without
 *              asserting them. This is how the "before" column of the
 *              report is produced: from this same harness, not from a
 *              second one that might differ.
 *   --out DIR  where the screenshots go (default rtl-shots/).
 *
 * Run: node scripts/tests/rtl-layout.prodtest.mjs
 */
import path from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { chromiumPath } from "./lib/chromium.mjs";
import { startProdHarness } from "../lib/prod-harness.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (SHOTS_ONLY) return;
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const SHOTS_ONLY = process.argv.includes("--before");
const phase = SHOTS_ONLY ? "before" : "after";
const outDir = path.resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "rtl-shots"
);
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------
// The catalogue, read out of the prompt rather than restated.
// ---------------------------------------------------------------------
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
const section = (builder.match(/const WRITING_DIRECTION_SECTION = `([\s\S]*?)`;/) ?? [])[1];
if (!section) {
  console.log("  FAIL  WRITING_DIRECTION_SECTION could not be read out of website-builder.ts");
  process.exit(1);
}
// The prompt names the right-to-left languages in prose. This is the app
// reading its own instruction back, so that adding Hebrew to one list and
// not the other is caught by rtl.test.mjs rather than by a Hebrew user.
const PROMPT_NAMES_RTL = /Arabic, Hebrew, Persian\/Farsi, Urdu/.test(section);

// 390 and 1440, both locales, is 4 renders per route. Two routes public,
// three behind auth: the dashboard is where the sidebar, the icon rail
// and the composer all sit on a physical side.
const WIDTHS = [
  { width: 390, height: 844, label: "390" },
  { width: 1440, height: 900, label: "1440" },
];
// ENGLISH FIRST, DELIBERATELY. The Arabic off-screen check compares
// against the English render of the same route at the same width, so the
// baseline has to be in `measured` before Arabic is asked about it.
const LOCALES = [
  { code: "en", dir: "ltr", label: "en" },
  { code: "ar", dir: "rtl", label: "ar" },
];
// /help is here for one reason: it is the route that reliably renders an
// ArrowRight. The first run of this file measured five routes, found no
// pointing icon on any of them, and the icon checks would have passed
// vacuously had they not been written to fail when there is nothing to
// measure. A check that cannot find its subject is not a passing check.
const ROUTES = ["/", "/pricing", "/help", "/dashboard", "/dashboard/chat", "/dashboard/overview"];

// ---------------------------------------------------------------------
// The measurement, run inside the page.
// ---------------------------------------------------------------------
const PROBE = () => {
  const de = document.documentElement;
  const vw = window.innerWidth;

  // HORIZONTAL SCROLL, AND WHY scrollWidth IS THE RIGHT INSTRUMENT.
  //
  // A browser does not make overflow to the LEFT of the origin scrollable
  // in a left-to-right page: content at x=-9999 adds nothing to
  // scrollWidth and cannot be reached. Flip the page to rtl and the same
  // content becomes 9,999px of reachable, empty scroll. So scrollWidth -
  // clientWidth measured in BOTH directions is exactly the pair of
  // numbers the prompt's last rule asks for; either one alone is the
  // measurement that missed the original defect.
  const overflow = Math.max(0, de.scrollWidth - de.clientWidth);

  // NOTHING OFF-SCREEN. Every rendered element must have its box inside
  // the viewport on the horizontal axis. 1px of slack for subpixel
  // rounding; anything past that is a real escape.
  //
  // Deliberately skips elements that are clipped by an ancestor: a
  // collapsed accordion keeps a full-size rect (getBoundingClientRect
  // does not know about overflow:hidden), and counting those produced 90
  // phantom findings the first time layout-stress.prodtest.mjs ran.
  const isRendered = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    if (Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflow === "visible" && ps.overflowX === "visible" && ps.overflowY === "visible")
        continue;
      const pr = p.getBoundingClientRect();
      if (r.right <= pr.left || r.left >= pr.right) return false;
      if (r.bottom <= pr.top || r.top >= pr.bottom) return false;
    }
    return true;
  };

  const escapes = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!isRendered(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1) {
      escapes.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className ?? "").slice(0, 70),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }

  // NINE POINTS. A 3x3 grid inset from the edges. elementFromPoint
  // returning null means the point is not over the document at all —
  // which is what a container pushed off its axis looks like from the
  // outside. Recording WHAT was hit (not just that something was) is what
  // makes the before/after pair readable: if the same nine points hit
  // nine different things after the change, the layout moved.
  const points = [];
  for (const fy of [0.15, 0.5, 0.85]) {
    for (const fx of [0.1, 0.5, 0.9]) {
      const x = Math.round(vw * fx);
      const y = Math.round(window.innerHeight * fy);
      const el = document.elementFromPoint(x, y);
      points.push({
        x,
        y,
        hit: el ? el.tagName.toLowerCase() : null,
      });
    }
  }

  // THE ICONS. Read off the computed transform, not off the source: the
  // question is whether the rule actually applied to this element in this
  // document, and a class list cannot answer that.
  //
  // scaleX(-1) computes to matrix(-1, 0, 0, 1, 0, 0).
  const MIRRORED = /matrix\(\s*-1,\s*0,\s*0,\s*1,/;
  const iconState = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return "absent";
    return MIRRORED.test(getComputedStyle(el).transform) ? "mirrored" : "upright";
  };

  return {
    dir: de.getAttribute("dir"),
    lang: de.getAttribute("lang"),
    overflow,
    escapes: escapes.slice(0, 8),
    escapeCount: escapes.length,
    points,
    nullPoints: points.filter((p) => p.hit === null).length,
    // A pointer and a non-pointer, on whatever page carries them.
    arrowRight: iconState(".lucide-arrow-right"),
    chevronRight: iconState(".lucide-chevron-right"),
    chevronLeft: iconState(".lucide-chevron-left"),
    trendingUp: iconState(".lucide-trending-up"),
  };
};

// ---------------------------------------------------------------------
const harness = await startProdHarness({
  supaPort: 54346,
  userMetadata: { preferred_locale: "ar", onboarding_completed_at: "2026-01-01T00:00:00Z" },
});
const browser = await chromium.launch({ executablePath: chromiumPath() });

/** The results table, keyed "route @ width @ locale". */
const measured = new Map();

try {
  for (const locale of LOCALES) {
    // The account is what middleware.ts reads to decide the locale, and
    // changing it needs no second `next build` — the build inlines the
    // Supabase URL, not its answers.
    harness.setUserMetadata({
      preferred_locale: locale.code,
      onboarding_completed_at: "2026-01-01T00:00:00Z",
    });

    for (const w of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: w.width, height: w.height },
        storageState: {
          cookies: [{ ...harness.AUTH_COOKIE, domain: "127.0.0.1", path: "/" }],
          origins: [],
        },
      });
      const page = await context.newPage();

      for (const route of ROUTES) {
        const key = `${route} @ ${w.label} @ ${locale.label}`;
        try {
          await page.goto(`${harness.origin}${route}`, {
            waitUntil: "networkidle",
            timeout: 45_000,
          });
        } catch {
          // networkidle can never arrive on a page holding a poll open.
          // domcontentloaded plus a settle is enough to measure layout.
          await page.goto(`${harness.origin}${route}`, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
        }
        await page.waitForTimeout(700);

        const r = await page.evaluate(PROBE);
        measured.set(key, r);
        console.log(
          `  ${key.padEnd(42)} dir=${String(r.dir).padEnd(5)} overflow=${String(r.overflow).padStart(5)}px  offscreen=${String(r.escapeCount).padStart(3)}  nullpts=${r.nullPoints}  arrow=${r.arrowRight}`
        );
        if (r.escapeCount > 0) {
          for (const e of r.escapes)
            console.log(`        off-screen  <${e.tag} class="${e.cls}">  ${e.left}..${e.right}`);
        }

        const shot = `${phase}-${route.replace(/\//g, "_") || "_root"}-${w.label}-${locale.label}.png`;
        await page.screenshot({ path: path.join(outDir, shot) });
      }
      await context.close();
    }
  }

  // -------------------------------------------------------------------
  // The assertions. Skipped entirely under --before, which is the point
  // of that flag: the same harness produces the "before" numbers without
  // a wall of red that says nothing anybody did not already know.
  // -------------------------------------------------------------------
  check("the prompt still names the four right-to-left languages", PROMPT_NAMES_RTL);

  for (const [key, r] of measured) {
    const isAr = key.endsWith("@ ar");
    check(
      `dir is ${isAr ? "rtl" : "not set"} — ${key}`,
      isAr ? r.dir === "rtl" : r.dir === null || r.dir === "ltr",
      `dir="${r.dir}" lang="${r.lang}"`
    );
    check(`no horizontal scroll — ${key}`, r.overflow === 0, `${r.overflow}px`);

    // NOTHING OFF-SCREEN, MEASURED AGAINST ENGLISH RATHER THAN AGAINST
    // ZERO — and the first draft of this file got that wrong.
    //
    // Zero is not the right number and never was. A closed mobile drawer
    // is SUPPOSED to sit off-canvas; so is the ambient glow that bleeds
    // past the edge inside its own overflow-hidden parent. The before-run
    // measured 113 such elements on /dashboard at 390 — in ENGLISH, on a
    // page nobody claims is broken. An absolute check would have gone red
    // on all of them and said nothing about direction.
    //
    // The question this file exists to answer is whether MIRRORING the
    // page pushes anything out that was not already out, so the English
    // render at the same route and width is the baseline. Equal counts is
    // what a direction-agnostic layout looks like; more in Arabic than in
    // English is the defect, and it is invisible to every absolute
    // threshold.
    if (isAr) {
      const en = measured.get(key.replace(/@ ar$/, "@ en"));
      check(
        `nothing off-screen that is not also off-screen in English — ${key}`,
        en !== undefined && r.escapeCount <= en.escapeCount,
        en === undefined
          ? "no English render to compare against"
          : `ar=${r.escapeCount} en=${en.escapeCount}\n        ` +
            r.escapes.map((e) => `<${e.tag} class="${e.cls}"> ${e.left}..${e.right}`).join("\n        ")
      );
    }
    check(
      `all nine points are over the document — ${key}`,
      r.nullPoints === 0,
      `${r.nullPoints} of 9 returned null`
    );
  }

  // THE ICONS, AND THE HALF OF THE RULE THAT IS EASY TO FORGET. Flipping
  // the arrows is the obvious half; NOT flipping the things that do not
  // point is the half a blanket `[dir="rtl"] svg { transform: scaleX(-1) }`
  // gets wrong, and it is the half the owner named: το τηλέφωνο δεν
  // αναστρέφεται.
  const arSeen = [...measured].filter(([k]) => k.endsWith("@ ar")).map(([, v]) => v);
  const enSeen = [...measured].filter(([k]) => k.endsWith("@ en")).map(([, v]) => v);

  const anyAr = (field, value) => arSeen.some((r) => r[field] === value);
  const noneEn = (field, value) => enSeen.every((r) => r[field] !== value);

  // AT LEAST ONE POINTER, MEASURED — not three named ones.
  //
  // The first run demanded arrowRight, chevronRight and chevronLeft
  // individually and two of the three were simply not rendered on any of
  // these six routes. Failing because an icon is not on a page is not a
  // finding about direction; it is a finding about which pages were
  // chosen, and turning it into a red line would have taught the next
  // reader to ignore this file.
  //
  // What matters is that the MECHANISM works and is not blanket: some
  // pointer is mirrored in Arabic and upright in English, and a
  // non-pointer is upright in both. The completeness of the LIST — that
  // every pointing icon the app imports is named — is a source question
  // and rtl.test.mjs answers it against all 200-odd of them, which no
  // browser run over six routes ever could.
  const POINTERS = ["arrowRight", "chevronRight", "chevronLeft"];
  const measurable = POINTERS.filter((p) => arSeen.some((r) => r[p] !== "absent"));
  check(
    "at least one pointing icon was on screen to measure",
    measurable.length > 0,
    `none of ${POINTERS.join(", ")} rendered on any measured route — every icon check below would be vacuous`
  );
  for (const pointer of measurable) {
    check(`${pointer} is mirrored in Arabic`, anyAr(pointer, "mirrored"));
    check(`${pointer} is upright in English`, noneEn(pointer, "mirrored"));
  }

  const trendPresent = arSeen.some((r) => r.trendingUp !== "absent");
  check(
    "a non-pointer (trending-up) was actually on screen to measure",
    trendPresent,
    "not present on any measured route"
  );
  if (trendPresent) {
    check("trending-up is NOT mirrored in Arabic", noneEn("trendingUp", "mirrored") && !anyAr("trendingUp", "mirrored"));
  }
} finally {
  await browser.close();
  await harness.cleanup();
}

console.log(`\n  screenshots: ${outDir}`);
if (SHOTS_ONLY) {
  console.log("\n--before: numbers printed, assertions skipped.");
  process.exit(0);
}
console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
