// IS IT STRAIGHT? — which is not the same question as "does it overflow".
//
// routes-smoke and layout-stress both measure OVERFLOW and OVERLAP. An
// element can be visibly crooked without doing either, and pass green.
// That is exactly what happened on the landing page — the first thing
// every visitor sees, logged in or not:
//
//   375px   Log In / Sign Up   16px on the left,  39px on the right
//   414px                      16px on the left,  78px on the right
//   1280px                    480px on the left, 596px on the right
//
// Nothing overflowed. Nothing overlapped. It was simply off-centre at
// every width, for two different reasons, for as long as the page has
// existed.
//
// Run: node scripts/tests/landing-alignment.prodtest.mjs
import { startProdHarness } from "../lib/prod-harness.mjs";
import { chromium } from "playwright";
import { chromiumPath } from "./lib/chromium.mjs";

const WIDTHS = [375, 414, 768, 1280, 1920];
// How far the left and right margins of a centred element may differ.
// Not zero: a scrollbar, a sub-pixel layout and a rounded rect all move a
// box by a pixel or two, and a test that fails on that gets deleted.
const TOLERANCE = 4;

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

const harness = await startProdHarness({ tableRows: {}, supaPort: 54391 });
const browser = await chromium.launch({
  executablePath: chromiumPath(),
});
try {
  for (const width of WIDTHS) {
    console.log(`\n== ${width}px ==`);
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${harness.origin}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(700);

    const m = await page.evaluate(() => {
      const vw = window.innerWidth;
      // The two auth CTAs, found by their href rather than their text, so
      // this keeps working in any of the ten locales.
      const login = document.querySelector('a[href="/login"]');
      const signup = document.querySelector('a[href="/signup"]');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      };
      const group = login && signup ? login.parentElement : null;
      return {
        vw,
        login: box(login),
        signup: box(signup),
        group: box(group),
        // The hero copy, which was always centred — the control that says
        // "the page centres things, this one element did not".
        heading: box(document.querySelector("h1")),
      };
    });

    const centred = (name, b) => {
      if (!b) { check(`${name} is on the page`, false); return; }
      const gapLeft = b.left;
      const gapRight = m.vw - b.right;
      check(
        `${name} is centred (left ${gapLeft}, right ${gapRight})`,
        Math.abs(gapLeft - gapRight) <= TOLERANCE,
        `off by ${Math.abs(gapLeft - gapRight)}px, tolerance ${TOLERANCE}`
      );
    };
    centred("the hero heading", m.heading);
    centred("the Log In / Sign Up group", m.group);
    // Below `sm` the two stack and must be the same width as each other,
    // or one reads as the "real" button and the other as an afterthought.
    if (width < 640 && m.login && m.signup) {
      check(
        `stacked, the two buttons are the same width (${m.login.width} / ${m.signup.width})`,
        Math.abs(m.login.width - m.signup.width) <= TOLERANCE
      );
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await harness.cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
