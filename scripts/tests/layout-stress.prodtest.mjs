/**
 * The layout checks that were never actually run.
 *
 * routes-smoke.prodtest.mjs measures horizontal overflow at 375px and
 * 768px, and it does it against an account with nothing in it. Both halves
 * of that are weaker than they look:
 *
 *   - AN EMPTY ACCOUNT CANNOT OVERFLOW. Every list on every dashboard route
 *     renders one centred "nothing here yet" box. Asserting that box fits
 *     on a phone is true, cheap and meaningless — it is not the page a
 *     paying user sees. This file runs the same measurements against
 *     lib/layout-fixture.mjs: 37 rows per table, every optional field
 *     populated, 68-character names, and Greek, which runs ~15% longer
 *     than English for the same sentence.
 *
 *   - OVERFLOW IS ONE FAILURE OF FOUR. A page can fit the viewport exactly
 *     while a button sits underneath a card, a heading is clipped to
 *     "Quarterly consolidated reven…" with no way to read the rest, or a
 *     control is 28px tall on a touch screen. None of those move
 *     scrollWidth. All three are measured here.
 *
 * WHY elementFromPoint AND NOT RECTANGLE INTERSECTION. Two boxes
 * overlapping is normal — every parent overlaps its children, every glow
 * and gradient overlaps what it decorates. The question a user cares about
 * is not "do these rectangles intersect" but "when I tap here, do I hit the
 * button". So each control is probed at its own centre: if the topmost
 * element at that point is neither the control nor part of it, the control
 * is covered, and that is reported. Very few false positives, and the ones
 * it does find are the real thing.
 *
 * BASELINES, NOT ZEROES. The tap-target and clipping censuses are pinned
 * to a recorded number that may not grow, the same ratchet
 * i18n-coverage.test.mjs uses for server-side English. A brand-new check
 * asserting zero on a codebase that has never been measured fails on
 * arrival and gets commented out within the week; a ratchet reports the
 * real number, stops it rising, and leaves the count visible in the log
 * every run.
 *
 * Run: node scripts/tests/layout-stress.prodtest.mjs
 */
import { startProdHarness } from "../lib/prod-harness.mjs";
import { buildFixture } from "../lib/layout-fixture.mjs";

let pass = 0,
  fail = 0;
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
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}

// The four widths, and what each one is for.
//   375  — the phone the app is most used on.
//   768  — the width where the sidebar appears while the header still
//          carries its full-width controls. This is the one that hid the
//          "Publish bar is squeezed to the left" bug for three reports.
//   1024 — a landscape tablet / a half-screen desktop window.
//   1440 — the laptop the app is designed on, where nothing is supposed to
//          break and occasionally does once a table has 37 rows in it.
const WIDTHS = [
  { width: 375, height: 812, label: "375" },
  { width: 768, height: 1024, label: "768" },
  { width: 1024, height: 768, label: "1024" },
  { width: 1440, height: 900, label: "1440" },
];

// Greek is not a spot-check here. It is the primary locale, and it is the
// longest of the ten for the same sentence, so it is the one that breaks a
// layout English fits into.
const LOCALES = ["en", "el"];

const PUBLIC_ROUTES = ["/", "/pricing", "/help", "/terms", "/privacy", "/login", "/signup", "/roadmap"];
const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/overview",
  "/dashboard/chat",
  "/dashboard/create",
  "/dashboard/website-builder",
  "/dashboard/mission",
  "/dashboard/documents",
  "/dashboard/favorites",
  "/dashboard/timeline",
  "/dashboard/memory",
  "/dashboard/marketplace",
  "/dashboard/settings",
  "/dashboard/reflection",
  "/dashboard/agents",
  "/dashboard/published",
  "/dashboard/integrations",
  "/dashboard/files",
  "/dashboard/deep-research",
  // NOT MEASURED HERE, both for the same reason — this fixture is one
  // account, and neither page is reachable from it:
  //   /onboarding       correctly redirects an account that has already
  //                     finished onboarding to the dashboard.
  //   /dashboard/team   redirects to Settings unless the account owns a
  //                     subscription whose plan has teamCollaboration.
  // Both need a second fixture with a different account shape. Recorded
  // here rather than left as two red lines that get skimmed past.
  "/dashboard/apps",
  "/dashboard/images",
  "/dashboard/videos",
  "/dashboard/coding",
  "/dashboard/campaigns",
  "/dashboard/data-analysis",
  "/dashboard/presentations",
  "/dashboard/websites",
  "/dashboard/product-workflow",
  "/dashboard/trading-workflow",
  // The twelve business modules all share /dashboard/[module]. One of them
  // is enough to exercise that route's layout, and `finance` is the widest:
  // it is the only module with two number columns, which right-align and
  // are what actually pushes a card past its container.
  "/dashboard/finance",
];

// ---------------------------------------------------------------------
// The measurement, run inside the page.
// ---------------------------------------------------------------------
const PROBE = () => {
  const MIN_TAP = 44;

  const INTERACTIVE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
    '[role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"]';

  const rectOf = (el) => el.getBoundingClientRect();

  function isRendered(el) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    const r = rectOf(el);
    if (r.width <= 0 || r.height <= 0) return false;

    // CLIPPED OUT BY AN ANCESTOR still has a box.
    //
    // A collapsed sidebar group is `max-height: 0; overflow: hidden`. Its
    // links keep a full-size rect — getBoundingClientRect does not care
    // about clipping — so they look rendered, and probing their centre
    // returns whatever is actually painted there, which is a different
    // link. The first run of this file reported 90 "covered" controls that
    // were entirely this: closed accordions in the nav.
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      const clips =
        ps.overflow !== "visible" || ps.overflowX !== "visible" || ps.overflowY !== "visible";
      if (!clips) continue;
      const pr = rectOf(p);
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) return false;
    }
    return true;
  }

  /**
   * The nearest positioned overlay an element belongs to.
   *
   * Two elements in DIFFERENT fixed layers overlapping is the normal way
   * layering works — a toast sits over the page, a cookie banner sits over
   * the footer, a dialog sits over everything. Reporting those is reporting
   * the design. Two elements in the SAME layer overlapping is a bug, and
   * that is what this lets the check distinguish.
   */
  function layerOf(el) {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.position === "fixed" || s.position === "sticky") return p;
    }
    return null;
  }

  /** Only what is currently on screen — an element scrolled out of view
   *  cannot be probed with elementFromPoint, and reporting it as covered
   *  would be an artefact of the scroll position, not a defect. */
  function inViewport(el) {
    const r = rectOf(el);
    return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  }

  function path(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += `#${n.id}`;
      else if (typeof n.className === "string" && n.className.trim()) {
        s += `.${n.className.trim().split(/\s+/).slice(0, 2).join(".")}`;
      }
      parts.unshift(s);
    }
    return parts.join(" > ");
  }

  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "")
      .trim()
      .slice(0, 60);

  // --- 1. tap targets -------------------------------------------------
  // WCAG 2.5.8 exempts a link sitting inline inside a sentence — its size
  // is set by the prose around it, and padding it to 44px would break the
  // paragraph. Everything else is a control someone has to hit.
  const smallTargets = [];
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!isRendered(el)) continue;
    const style = getComputedStyle(el);
    if (style.display === "inline" && el.closest("p, li, label")) continue;
    const r = rectOf(el);

    // A VISUALLY-HIDDEN INPUT IS NOT A TAP TARGET. The file pickers render
    // `<input class="sr-only">` at 1x1 and put a real, full-size button
    // next to it; the checkboxes sit inside a `<label>` that is the actual
    // hit area. Reporting either is reporting the technique, not a defect
    // — so the rule is: if something else is the hit area, measure THAT.
    if (r.width <= 2 && r.height <= 2) continue;
    if (el.tagName === "INPUT") {
      const label = el.closest("label");
      if (label) {
        const lr = rectOf(label);
        if (lr.width >= MIN_TAP && lr.height >= MIN_TAP) continue;
      }
    }

    if (r.width < MIN_TAP || r.height < MIN_TAP) {
      smallTargets.push({
        path: path(el),
        label: label(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }

  // --- 2. covered controls -------------------------------------------
  // Probe each control at its own centre. If the topmost element there is
  // neither the control nor inside it nor an ancestor of it, something is
  // sitting on top of it and the tap lands elsewhere.
  const covered = [];
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!isRendered(el) || !inViewport(el)) continue;
    const r = rectOf(el);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit) continue;
    if (hit === el || el.contains(hit) || hit.contains(el)) continue;
    // Different layers overlapping is layering, not breakage.
    if (layerOf(hit) !== layerOf(el)) continue;
    // A pointer-events:none decoration cannot be what elementFromPoint
    // returns, so anything left here genuinely intercepts the tap.
    covered.push({ path: path(el), label: label(el), by: path(hit) });
  }

  // --- 3. clipped text ------------------------------------------------
  // Text that is cut off AND cannot be recovered. An ellipsised card title
  // whose full text is in a title= or aria-label= attribute is a design
  // decision; one with neither has simply lost information.
  const clipped = [];
  const TEXT_HOLDERS = "h1, h2, h3, h4, h5, h6, p, span, div, a, button, label, td, th, li";
  for (const el of document.querySelectorAll(TEXT_HOLDERS)) {
    if (!isRendered(el)) continue;
    // Direct text only: a wrapper div "contains" all its children's text
    // and would be reported for every one of them.
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join("");
    if (own.length < 3) continue;

    const style = getComputedStyle(el);
    const hiddenX = style.overflowX === "hidden" || style.overflowX === "clip";
    const hiddenY = style.overflowY === "hidden" || style.overflowY === "clip";
    const clampsLines = style.webkitLineClamp && style.webkitLineClamp !== "none";

    const cutX = hiddenX && el.scrollWidth > el.clientWidth + 1;
    const cutY = (hiddenY || clampsLines) && el.scrollHeight > el.clientHeight + 1;
    if (!cutX && !cutY) continue;

    const recoverable =
      el.hasAttribute("title") ||
      el.hasAttribute("aria-label") ||
      el.closest("[title]") !== null;

    clipped.push({
      path: path(el),
      text: own.slice(0, 60),
      axis: cutX ? "x" : "y",
      recoverable,
      isHeadingOrControl: /^(H[1-6]|BUTTON|A|LABEL)$/.test(el.tagName),
    });
  }

  // --- 4. what is actually sticking out ------------------------------
  // "scrollWidth 1135 vs clientWidth 1024" tells you there is a problem
  // and nothing about where. The widest offender, named, is the whole
  // difference between a failing check and a fixable one.
  const clientWidth = document.documentElement.clientWidth;
  const overflowing = [];
  if (document.documentElement.scrollWidth > clientWidth + 1) {
    for (const el of document.querySelectorAll("body *")) {
      if (!isRendered(el)) continue;
      const r = rectOf(el);
      if (r.right <= clientWidth + 1) continue;
      // Report the DEEPEST offenders only: every ancestor of a too-wide
      // element is also too wide, and the leaf is the one to fix.
      if ([...el.children].some((c) => rectOf(c).right > clientWidth + 1)) continue;
      // A `position: fixed` element is OUT OF FLOW — it cannot extend
      // document.scrollWidth however wide it is. The decorative background
      // blobs are fixed and enormous, so they won the "widest" contest on
      // every overflowing page and pointed at themselves instead of at the
      // element actually causing the scroll. Naming an innocent element is
      // worse than naming none: it sends you to fix the wrong thing.
      if (layerOf(el)) continue;
      overflowing.push({ path: path(el), right: Math.round(r.right), text: label(el).slice(0, 40) });
    }
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth,
    smallTargets,
    covered,
    clipped,
    overflowing: overflowing.sort((a, b) => b.right - a.right).slice(0, 5),
  };
};

// ---------------------------------------------------------------------
const fixture = await buildFixture();
const harness = await startProdHarness({ tableRows: fixture, supaPort: 54331 });
const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// Census across everything measured, so the log carries the real numbers
// even on a run where nothing regressed.
const census = {
  smallTargets: new Map(), // "path|label" -> {w,h,where}
  covered: new Map(),
  clippedUnrecoverable: new Map(),
  overflow: [],
};

function record(map, key, value) {
  if (!map.has(key)) map.set(key, value);
}

async function sweep(context, route, locale) {
  const page = await context.newPage();
  try {
    await page.goto(`${harness.origin}${route}`, { waitUntil: "networkidle", timeout: 45000 });
  } catch (err) {
    await page.close();
    checkTrue(`${locale} ${route}: loaded`, false, err.message);
    return;
  }
  // THE ROUTE HAS TO BE THE ROUTE.
  //
  // Not "did not bounce to /login", which is what the older smoke test
  // asserts — that check passes happily when a page redirects somewhere
  // else, and one does: /dashboard/overview sends an account with no
  // onboarding row to /onboarding. Every layout measurement ever taken of
  // the app's busiest signed-in screen was actually taken of the
  // onboarding wizard, and nothing said so.
  const landedOn = new URL(page.url()).pathname;
  if (landedOn !== route) {
    await page.close();
    checkTrue(
      `${locale} ${route}: measured the route it asked for`,
      false,
      `redirected to ${landedOn} — whatever was measured, it was not ${route}`
    );
    return;
  }

  for (const vp of WIDTHS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // Let the layout settle: several surfaces switch between a card grid
    // and a table on a media query, and measuring mid-transition reports
    // sizes no user ever sees.
    await page.waitForTimeout(250);
    const r = await page.evaluate(PROBE);
    const where = `${locale} ${route} @${vp.label}`;

    if (r.scrollWidth > r.clientWidth + 1) {
      const worst = r.overflowing?.[0];
      census.overflow.push(
        `${where} (${r.scrollWidth}/${r.clientWidth})` +
          (worst ? ` — widest: ${worst.path} reaches ${worst.right}px "${worst.text}"` : "")
      );
    }
    for (const t of r.smallTargets) {
      record(census.smallTargets, `${t.path}|${t.label}`, { ...t, where });
    }
    for (const c of r.covered) {
      record(census.covered, `${c.path}|${c.label}|${c.by}`, { ...c, where });
    }
    for (const c of r.clipped) {
      if (c.recoverable) continue;
      record(census.clippedUnrecoverable, `${c.path}|${c.text}`, { ...c, where });
    }
  }
  await page.close();
}

console.log("\n== 1. every route, four widths, two locales, with real data in it ==");
for (const locale of LOCALES) {
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await anon.addCookies([
    { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
  ]);
  for (const route of PUBLIC_ROUTES) await sweep(anon, route, locale);
  await anon.close();

  const authed = await harness.signedIn(browser);
  await authed.addCookies([
    { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
  ]);
  for (const route of DASHBOARD_ROUTES) await sweep(authed, route, locale);
  await authed.close();
}

// ---------------------------------------------------------------------
// Modals. Only the publish dialog had ever been opened by a test.
// ---------------------------------------------------------------------
console.log("\n== 2. modals (the six nobody opened) ==");

const MODALS = [
  {
    name: "command palette",
    route: "/dashboard/overview",
    open: async (page) => {
      // The handler reads `(metaKey || ctrlKey) && key === "k"` and is
      // bound to document, so the press has to land on the page rather
      // than on whatever Playwright focused last.
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+KeyK");
    },
  },
  {
    name: "quick start",
    route: "/dashboard/overview",
    open: async (page) => {
      const trigger = page.locator('button:has-text("Quick Start")').first();
      if ((await trigger.count()) === 0) return false;
      await trigger.click();
    },
  },
  {
    // These two are per-record buttons whose only visible content is an
    // icon — the words are in `aria-label`, which is why matching on TEXT
    // found nothing and reported the dialogs as broken when they were
    // simply never opened. `^=` on the label's prefix, because the label
    // is "<action>: <record headline>" and the headline is fixture data.
    // BOTH OF THESE LIVE INSIDE THE CARD'S "..." MENU
    // (generic-record-card.tsx's `menuExtra`), not on the card face. That
    // is why the first version of this file reported all four dialogs as
    // "does not open" — it was clicking buttons that are not on screen
    // until the menu is. The menu has to be opened first, which is also
    // exactly what a user does.
    name: "ask AI",
    route: "/dashboard/finance",
    open: async (page) => {
      const menu = page.locator('button[aria-haspopup="menu"]').first();
      if ((await menu.count()) === 0) return false;
      await menu.click();
      const trigger = page.locator('button[aria-label*="AI"]').first();
      if ((await trigger.count()) === 0) return false;
      await trigger.click();
    },
  },
  {
    name: "link to",
    route: "/dashboard/finance",
    open: async (page) => {
      const menu = page.locator('button[aria-haspopup="menu"]').first();
      if ((await menu.count()) === 0) return false;
      await menu.click();
      const trigger = page
        .locator('button[aria-label*="Link to"], button[aria-label*="Σύνδεση με"]')
        .first();
      if ((await trigger.count()) === 0) return false;
      await trigger.click();
    },
  },
];

{
  const authed = await harness.signedIn(browser);
  for (const modal of MODALS) {
    const page = await authed.newPage();
    await page.goto(`${harness.origin}${modal.route}`, { waitUntil: "networkidle", timeout: 45000 });
    let opened = true;
    let why = "";
    try {
      const result = await modal.open(page);
      if (result === false) {
        opened = false;
        why = "the trigger was not on the page";
      }
      if (opened) await page.waitForSelector('[role="dialog"]', { timeout: 4000 });
    } catch (err) {
      opened = false;
      if (!why) why = err.message.split("\n")[0];
    }

    // "does not open" is not a finding, it is a question. When the trigger
    // cannot be found, say what IS on the page — the first version of this
    // section reported all four dialogs as broken when three of them were
    // fine and the selectors were looking in the wrong place.
    if (!opened) {
      const buttons = await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 12)
      );
      why += `; buttons present: ${JSON.stringify(buttons)}`;
    }

    checkTrue(`${modal.name}: opens`, opened, `on ${modal.route}: ${why}`);
    if (!opened) {
      await page.close();
      continue;
    }

    // A dialog has to fit and be reachable at phone width — this is where
    // a fixed-height panel with a scrolling body either works or traps its
    // own submit button off-screen.
    for (const vp of [WIDTHS[0], WIDTHS[1]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      const r = await page.evaluate(PROBE);
      checkTrue(
        `${modal.name} @${vp.label}: no horizontal overflow (${r.scrollWidth}/${r.clientWidth})`,
        r.scrollWidth <= r.clientWidth + 1
      );
      const dialogBox = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return null;
        const r = d.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight };
      });
      checkTrue(
        `${modal.name} @${vp.label}: dialog fits the viewport (${dialogBox?.h}px in ${dialogBox?.vh}px)`,
        dialogBox && dialogBox.top >= -1 && dialogBox.bottom <= dialogBox.vh + 1,
        JSON.stringify(dialogBox)
      );
      for (const t of r.smallTargets) {
        record(census.smallTargets, `${t.path}|${t.label}`, { ...t, where: `modal:${modal.name} @${vp.label}` });
      }
      for (const c of r.covered) {
        record(census.covered, `${c.path}|${c.label}|${c.by}`, { ...c, where: `modal:${modal.name} @${vp.label}` });
      }
    }
    await page.close();
  }
  await authed.close();
}

// ---------------------------------------------------------------------
console.log("\n== 3. the census ==");

console.log(`\n-- horizontal overflow: ${census.overflow.length} --`);
for (const o of census.overflow) console.log(`   ${o}`);

console.log(`\n-- controls under 44px: ${census.smallTargets.size} --`);
for (const [, t] of [...census.smallTargets].sort((a, b) => a[1].h - b[1].h)) {
  console.log(`   ${t.w}x${t.h}  ${t.label || "(no label)"}  [${t.where}]  ${t.path}`);
}

console.log(`\n-- controls covered by something else: ${census.covered.size} --`);
for (const [, c] of census.covered) {
  console.log(`   ${c.label || "(no label)"} covered by ${c.by}  [${c.where}]`);
}

console.log(`\n-- text clipped with no way to read the rest: ${census.clippedUnrecoverable.size} --`);
for (const [, c] of census.clippedUnrecoverable) {
  console.log(`   [${c.axis}] "${c.text}"  [${c.where}]  ${c.path}`);
}

console.log("\n== 4. the assertions ==");

// EVERY ASSERTION BELOW COMES AFTER THE BASELINE CONSTS IT READS.
//
// It did not, for one commit, and the cost is worth recording: a `const`
// read above its declaration is a ReferenceError, not a hoisted
// `undefined`, so this file threw at the first baseline check and never
// reached the other three. The run still printed a full census and a
// PASS line above the crash, and the crash itself was hidden because the
// command was piped to `tail`, which reports ITS OWN exit code. A gate
// that dies silently after printing something reassuring is worse than
// no gate.

// Overflow is the one with no baseline: it was already at zero on an empty
// account, and putting real data in it must not change that.
check("no route overflows horizontally at any of the four widths", census.overflow, []);

// BASELINES — a ratchet, not a target.
//
// The first run of this file, against a full account, measured 346
// distinct controls under 44px. Asserting zero on that would fail on
// arrival and be commented out inside a week, so the number is recorded
// and may not GROW; it is lowered as the remaining classes are fixed.
//
// 346 -> 93 in this change. What closed:
//   - `sm:min-h-0` on 67 controls, which cancelled the 44px minimum at
//     every width above 640px. A tablet is a touch screen.
//   - the shared `.input` class (globals.css), 40px, and therefore every
//     text field, textarea and select in the app at once.
//   - the star and the "..." menu on every card, 36px, side by side on
//     every list screen.
//   - the collapsible sidebar group headers, 21px, which is the control
//     you press to reveal half the navigation.
//
// WHAT THE REMAINING 93 ARE, so the number is not just a number:
//   - 24 are inline text links in footers and prose (91x16). WCAG 2.5.8
//     exempts a link sized by the sentence around it, and padding them to
//     44px would break the paragraph. Arguably these should be excluded by
//     the probe rather than counted; they are counted for now because the
//     exemption is a judgement and a visible number invites the argument.
//   - 20 are 269x40 — 4px short, in surfaces that set their own padding
//     rather than using `.input`.
//   - 9 are 32x32 icon buttons in dense toolbars where 44px genuinely
//     changes the layout, which is the line the brief drew ("raise the
//     ones that do not break the layout").
//   - the rest are one-offs.
//
// 93 -> 119 AND THAT IS NOT A REGRESSION. It is what happens when a page
// gets measured for the first time. /dashboard/overview redirects to
// /onboarding unless the account has finished onboarding, so until the
// fixture grew that row, every run of this file — and of
// routes-smoke.prodtest.mjs before it — measured the onboarding wizard
// while reporting the route as /dashboard/overview. The extra 26 are the
// real Home screen's own controls, seen here for the first time.
const SMALL_TARGET_BASELINE = 119;

// Text cut off with no title= or aria-label to recover the full string
// from. Most are card headings under a long record name — the fixture's
// 68-character names are what surfaced them, and they are invisible on
// the empty account every other check uses.
//
// 46 -> 48 is a deliberate trade, not a slip. Letting the health-score
// card's text shrink (it had `shrink-0` around the text as well as the
// ring) stopped it pushing the page sideways in Greek; the text now
// truncates instead. Truncating beats scrolling the whole page, so the
// two extra clipped strings are the price and they are recorded as such.
const CLIPPED_BASELINE = 48;

// Five, all on /dashboard/chat at 375px: the conversation drawer is
// translated off-canvas rather than removed, so the controls inside it
// keep a hit area and sit under the page. The fix is `inert` on the closed
// drawer, which is a behaviour change to the chat surface rather than a
// layout tweak, so it is recorded here rather than done in passing.
const COVERED_BASELINE = 5;

checkTrue(
  `controls covered by another element has not grown (${census.covered.size} <= ${COVERED_BASELINE})`,
  census.covered.size <= COVERED_BASELINE,
  [...census.covered.values()].map((c) => `${c.label} <- ${c.by} [${c.where}]`).join("\n        ")
);


checkTrue(
  `controls under 44px has not grown (${census.smallTargets.size} <= ${SMALL_TARGET_BASELINE})`,
  census.smallTargets.size <= SMALL_TARGET_BASELINE
);
checkTrue(
  `unrecoverable clipped text has not grown (${census.clippedUnrecoverable.size} <= ${CLIPPED_BASELINE})`,
  census.clippedUnrecoverable.size <= CLIPPED_BASELINE
);

await browser.close();
harness.cleanup();

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
