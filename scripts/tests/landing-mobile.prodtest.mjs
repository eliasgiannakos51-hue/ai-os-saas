// THE WHOLE LANDING PAGE AT 375, IN ALL TEN LANGUAGES.
//
// landing-alignment.prodtest.mjs asks whether the CTA pair is CENTRED.
// That is not the same question as whether the page FITS, and the landing
// page has a specific reason to be asked the second one:
//
//   <main class="... min-h-screen justify-center overflow-hidden">
//
// justify-center plus overflow-hidden is a trapdoor. While the content is
// shorter than the viewport, nothing happens. The moment it is TALLER,
// the flex container centres it and the overflow is clipped at BOTH
// ends — and because overflow is hidden rather than auto, the clipped
// part cannot be scrolled to. It is not off-screen, it is gone.
//
// Whether that fires depends on the length of translated text, which is
// why this runs every locale rather than sampling English. A German or
// Greek hero is routinely 30-40% longer than the English one it was laid
// out against, and 375x667 (iPhone SE, iPhone 8 — the shortest screens
// still in use) is where it would land first.
//
// It also measures the footer's touch targets. Five links in a row of
// 12px text is a legitimate desktop footer and five 16px-tall tap targets
// on a phone; the 44px floor is the same one the rest of this codebase
// uses.
//
// Run: node scripts/tests/landing-mobile.prodtest.mjs
import { startProdHarness } from "../lib/prod-harness.mjs";
import { chromium } from "playwright";

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
// 667 is the iPhone SE/8 viewport height — the shortest still in use, and
// therefore the one that clips first. 812 is the modern phone.
const VIEWPORTS = [
  { width: 375, height: 667, label: "375x667 (SE/8)" },
  { width: 375, height: 812, label: "375x812" },
];
/** How far a centred block's left and right margins may differ. */
const TOLERANCE = 4;
/** The touch-target floor used across this codebase. */
const MIN_TAP_PX = 44;

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const main = document.querySelector("main");
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };

  const login = document.querySelector('a[href="/login"]');
  const signup = document.querySelector('a[href="/signup"]');
  // Found by href rather than by text, so this reads the same in all ten
  // locales.
  const footerLinks = ["/pricing", "/roadmap", "/terms", "/privacy", "/cookies"]
    .map((href) => document.querySelector(`footer a[href="${href}"]`))
    .filter(Boolean);

  // Every element that paints CONTENT, for the overflow and clipping
  // sweeps. Two exclusions, both narrow:
  //
  //   zero-size wrappers  a 0x0 box cannot be seen to overflow.
  //
  //   aria-hidden         the backdrop. AuthBackground's wireframe globe,
  //                       NetworkField's constellation and GlowOrb are all
  //                       DELIBERATELY larger than the viewport and are
  //                       clipped on purpose — a 512px orb positioned at
  //                       -translate-y-1/3 is meant to bleed off the top
  //                       edge, and the globe's circles are meant to run
  //                       past both sides. Measuring them reported five
  //                       "overflows" and one "clipped" element per locale
  //                       for art that is working exactly as drawn, which
  //                       would have made this gate the kind people delete.
  //                       Every one of those layers is aria-hidden="true"
  //                       and pointer-events-none, so the filter is the
  //                       same line a screen reader draws, not an ad-hoc
  //                       allowlist.
  //
  // Genuine overflow from ANY source, decoration included, is still caught
  // by the document-level scrollWidth check below — that is what says
  // whether the page can be dragged sideways, which is the thing a person
  // notices.
  const painted = Array.from(document.querySelectorAll("main *")).filter((el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });

  const beyondRight = painted
    .filter((el) => el.getBoundingClientRect().right > vw + 1)
    .slice(0, 5)
    .map((el) => ({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 60),
                    right: Math.round(el.getBoundingClientRect().right) }));

  // CLIPPED, not merely off-screen. main is overflow-hidden, so anything
  // whose box lies outside main's own padding box is unreachable — there
  // is no scroll that brings it back.
  const mainBox = main?.getBoundingClientRect();
  const clipped = !main
    ? []
    : painted
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < mainBox.top - 1 || r.bottom > mainBox.bottom + 1;
        })
        .slice(0, 6)
        .map((el) => ({ tag: el.tagName.toLowerCase(),
                        text: (el.textContent ?? "").trim().slice(0, 40),
                        top: Math.round(el.getBoundingClientRect().top),
                        bottom: Math.round(el.getBoundingClientRect().bottom) }));

  return {
    vw,
    vh,
    paintedCount: painted.length,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    mainOverflowY: main ? getComputedStyle(main).overflowY : null,
    main: box(main),
    h1: box(document.querySelector("h1")),
    logo: box(document.querySelector("main svg")),
    description: box(document.querySelector("h1 + p")),
    cta: box(login && signup ? login.parentElement : null),
    footer: box(document.querySelector("footer")),
    footerLinks: footerLinks.map((a) => ({
      href: a.getAttribute("href"),
      ...box(a),
    })),
    beyondRight,
    clipped,
  };
};

const harness = await startProdHarness({ tableRows: {}, supaPort: 54399 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

// Collected across the whole cross-product and reported once, so a single
// bad locale does not hide behind nine good ones.
const offCentre = [];
const overflowed = [];
const clippedAnywhere = [];
const smallTaps = [];
let measured = 0;
let minPainted = Infinity;

try {
  for (const vp of VIEWPORTS) {
    for (const locale of LOCALES) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await ctx.addCookies([
        { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      const page = await ctx.newPage();
      await page.goto(`${harness.origin}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(700);
      const m = await page.evaluate(MEASURE);
      measured++;
      minPainted = Math.min(minPainted, m.paintedCount);

      const where = `${vp.label} ${locale}`;

      // Centring, block by block. The CTA pair is already held at five
      // widths by landing-alignment; the logo, the hero, the paragraph
      // and the footer were never measured at all.
      for (const [name, b] of [
        ["logo", m.logo],
        ["h1", m.h1],
        ["description", m.description],
        ["cta", m.cta],
        ["footer", m.footer],
      ]) {
        if (!b) { offCentre.push(`${where}: ${name} MISSING`); continue; }
        const leftGap = b.left;
        const rightGap = m.vw - b.right;
        if (Math.abs(leftGap - rightGap) > TOLERANCE) {
          offCentre.push(`${where}: ${name} left=${leftGap} right=${rightGap}`);
        }
      }

      if (m.docScrollWidth > m.docClientWidth + 1) {
        overflowed.push(`${where}: document scrolls horizontally (${m.docScrollWidth} > ${m.docClientWidth})`);
      }
      for (const el of m.beyondRight) {
        overflowed.push(`${where}: <${el.tag}> right=${el.right} > vw=${m.vw} [${el.cls}]`);
      }
      for (const el of m.clipped) {
        clippedAnywhere.push(`${where}: <${el.tag}> "${el.text}" top=${el.top} bottom=${el.bottom} (main ${m.main.top}..${m.main.bottom}, overflowY=${m.mainOverflowY})`);
      }
      for (const a of m.footerLinks) {
        if (a.height < MIN_TAP_PX) smallTaps.push(`${where}: footer ${a.href} ${a.height}px`);
      }
      if (m.footerLinks.length !== 5) {
        smallTaps.push(`${where}: expected 5 footer links, found ${m.footerLinks.length}`);
      }

      console.log(
        `  ${where}: h1 ${m.h1?.left}/${m.vw - (m.h1?.right ?? 0)}  cta ${m.cta?.left}/${m.vw - (m.cta?.right ?? 0)}  ` +
          `footer ${m.footer?.left}/${m.vw - (m.footer?.right ?? 0)}  main ${m.main?.top}..${m.main?.bottom} (vh ${m.vh})`
      );

      await ctx.close();
    }
  }

  check(`the sweep ran the full cross-product (${VIEWPORTS.length}x${LOCALES.length})`,
    measured === VIEWPORTS.length * LOCALES.length, `measured ${measured}`);
  // The aria-hidden filter above must not have swallowed the page. A
  // sweep over nothing passes every check it makes.
  check("content elements were actually measured, not filtered away",
    minPainted >= 8, `fewest content elements on any run: ${minPainted}`);
  check("every block is horizontally centred in every locale", offCentre.length === 0,
    offCentre.slice(0, 12).join("\n        "));
  check("nothing overflows the viewport horizontally", overflowed.length === 0,
    overflowed.slice(0, 12).join("\n        "));
  check("nothing is clipped by the page's overflow-hidden", clippedAnywhere.length === 0,
    clippedAnywhere.slice(0, 12).join("\n        "));
  check(`every footer link is at least ${MIN_TAP_PX}px tall`, smallTaps.length === 0,
    smallTaps.slice(0, 12).join("\n        "));
} finally {
  await browser.close();
  harness.cleanup();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) console.log("FAILED: " + failures.join(" | "));
process.exit(failures.length === 0 ? 0 : 1);
