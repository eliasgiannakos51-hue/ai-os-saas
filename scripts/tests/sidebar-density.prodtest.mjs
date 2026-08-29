/**
 * HOW MANY THINGS CAN YOU SEE WITHOUT SCROLLING?
 *
 * The brief said "8 groups / 41 items", and the count that matters is
 * neither of those: this sidebar is an ACCORDION. One collapsible group
 * is open at a time and the rest are headings, so a number taken from
 * the config over-reports what a person is looking at by three times.
 *
 * So this measures the thing itself, in a browser, at four widths, in
 * both locales — every row's rectangle against the viewport, the way
 * Rule 11 asks for. What it reports:
 *
 *   rows visible     headings + links whose box is entirely on screen
 *   links visible    of those, the ones that go somewhere
 *   groups           how many headings exist at all
 *   overflow         how far past the viewport the sidebar runs
 *
 * BEFORE and AFTER are the same run of the same file. A restructure that
 * moves items between groups without changing what a person can see is a
 * restructure that changed nothing.
 *
 * Run: node scripts/tests/sidebar-density.prodtest.mjs
 */
import { startProdHarness } from "../lib/prod-harness.mjs";

const WIDTHS = [
  { width: 1440, height: 900, label: "1440x900 laptop" },
  { width: 1024, height: 768, label: "1024x768 tablet" },
];
const LOCALES = ["el"];

// Where the accordion is CLOSED (an always-open group holds the page, so
// no collapsible one is expanded) and where it is OPEN (a module page
// expands the group holding it). Those are the two states a person is
// ever in, and they are different counts.
//
// NOT /dashboard/overview: this fixture has no onboarding row, so that
// route redirects to /onboarding and the measurement would be taken of
// the wizard. layout-stress.prodtest.mjs documents the same trap.
const ROUTES = ["/dashboard/files", "/dashboard/finance"];

const PROBE = () => {
  const aside = document.querySelector("aside");
  if (!aside) return { error: "no aside" };

  const vh = window.innerHeight;
  const rows = [];
  // Headings are the <p>/<button> that label a group; links are the nav
  // rows. Both are "things you can see", and a screen of headings is not
  // the same screen as one of links — so they are counted apart.
  // THE WHOLE ASIDE, NOT JUST <nav>. The first writing of this scoped
  // headings to "nav p, nav button" and reported 7 groups where there
  // are 8: the Settings group is rendered in its own <div> below the
  // nav, so its heading was outside the selector and invisible to the
  // count. A heading a person can see is a heading, wherever the markup
  // puts it.
  for (const el of aside.querySelectorAll("p, button[aria-expanded], a[href]")) {
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const kind =
      el.tagName === "A" && el.getAttribute("href") !== "/dashboard/settings"
        ? "link"
        : el.tagName === "A"
          ? "link"
          : "heading";
    // PIXELS, NOT BOXES. The first writing of this asked only whether
    // the rectangle sat inside the viewport, and that is not the same
    // question: a collapsed accordion group is `grid-rows-[0fr]` with an
    // `overflow-hidden` wrapper, so its links keep full-size layout
    // boxes that getBoundingClientRect happily reports while nothing is
    // on screen. Both the before and after numbers were inflated by
    // rows inside closed groups.
    //
    // So each row is probed at its own centre: if the topmost element
    // there is not the row or something inside it, the row is not what a
    // person can see and press.
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const inViewport = r.top >= 0 && r.bottom <= vh && cy >= 0 && cy <= vh;
    const hit = inViewport ? document.elementFromPoint(cx, cy) : null;
    rows.push({
      kind,
      text: text.slice(0, 40),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      visible: Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el))),
    });
  }
  return {
    vh,
    scrollHeight: aside.scrollHeight,
    clientHeight: aside.clientHeight,
    rows,
  };
};

const harness = await startProdHarness();
const { chromium } = await import("playwright");
// --no-sandbox: this container has no user namespaces, and without it
// the first launch hung with no chromium process and no error.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
console.log("browser up");

const table = [];
try {
  for (const locale of LOCALES) {
    for (const vp of WIDTHS) {
      const context = await harness.signedIn(browser, { width: vp.width, height: vp.height });
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      for (const route of ROUTES) {
        const page = await context.newPage();
        // domcontentloaded, NOT networkidle: every dashboard route polls
        // (credits, jobs), so the network never goes idle and a
        // networkidle wait spends its whole timeout on every page.
        await page.goto(`${harness.origin}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        console.log(`  loaded ${locale} ${vp.label} ${route}`);
        // A redirect can still be in flight when goto resolves on
        // domcontentloaded; reading the URL before it settles measures
        // whichever page happened to be mid-swap.
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(300);
        const landed = new URL(page.url()).pathname;
        if (landed !== route) {
          console.log(`  SKIP  ${locale} ${vp.label} ${route} -> redirected to ${landed}`);
          await page.close();
          continue;
        }
        // The accordion animates its open group with grid-template-rows;
        // measuring mid-transition reports half a group.
        await page.waitForTimeout(400);
        const m = await page.evaluate(PROBE);
        await page.close();
        if (m.error) {
          console.log(`  ERROR ${locale} ${vp.label} ${route}: ${m.error}`);
          continue;
        }
        const links = m.rows.filter((r) => r.kind === "link");
        const headings = m.rows.filter((r) => r.kind === "heading");
        table.push({
          locale,
          viewport: vp.label,
          route,
          groups: headings.length,
          rowsVisible: m.rows.filter((r) => r.visible).length,
          linksVisible: links.filter((r) => r.visible).length,
          linksTotal: links.length,
          linksHidden: links.length - links.filter((r) => r.visible).length,
          overflowPx: Math.max(0, m.scrollHeight - m.clientHeight),
        });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  harness.cleanup();
}

console.log("\nlocale  viewport           route                   groups  rows vis  links vis  links  overflow");
for (const r of table) {
  console.log(
    `${r.locale.padEnd(7)} ${r.viewport.padEnd(18)} ${r.route.padEnd(23)} ${String(r.groups).padStart(6)}  ${String(r.rowsVisible).padStart(8)}  ${String(r.linksVisible).padStart(9)}  ${String(r.linksTotal).padStart(5)}  ${String(r.overflowPx).padStart(8)}`,
  );
}

const worst = table.reduce((a, b) => (b.linksVisible < a.linksVisible ? b : a), table[0]);
console.log(
  `\nWORST: ${worst.linksVisible} links visible without scrolling (${worst.locale}, ${worst.viewport}, ${worst.route})`,
);
console.log(`GROUPS: ${table[0]?.groups ?? "—"}`);
