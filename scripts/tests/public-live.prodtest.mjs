// WHAT THE LIVE SITE ACTUALLY SERVES — measured against the production URL.
//
// "Two times you told me 'done' for things that were not live." A test
// that checks a file exists on disk proves the file exists on disk. This
// one opens https://ai-os-saas-five.vercel.app in a real Chromium and
// asks the pages themselves:
//
//   1. /acceptable-use, /ai-transparency and /contact answer 200 with a
//      heading, in every one of the ten languages (the NEXT_LOCALE cookie
//      is what the app reads), and the page's <html lang> follows.
//   2. /contact says what state the mailer is in — this deployment has no
//      RESEND_FROM_EMAIL, so the amber notice must be on the page, not
//      only in the source.
//   3. The landing footer carries exactly the links this checkout's
//      lib/footer-links.ts declares — which is how "is main deployed?" is
//      answered for the roadmap removal: red until the deploy carries it,
//      green after, and it says which.
//   4. The language control on the public pages passes the same
//      elementFromPoint test the signed-in gate runs locally, at all five
//      widths, with a real touch on the phone ones.
//
// IT CANNOT SIGN IN. Everything behind /dashboard is proven by the
// harness-based prodtests against a local production build; this file is
// the public half and says so rather than pretending.
//
// The Chromium here is launched with --ssl-version-max=tls1.2, which is
// what this sandbox's proxy negotiates; page.request goes through the
// same proxy and would report 403 for everything, so every fetch is made
// FROM INSIDE THE PAGE (see scripts/prod/verify-deployment.mjs).
//
// Run: node scripts/tests/public-live.prodtest.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { chromiumPath } from "./lib/chromium.mjs";
import { loadTs } from "./load-ts.mjs";

const SITE = process.env.PROD_SITE_URL ?? "https://ai-os-saas-five.vercel.app";
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const THE_THREE = ["/acceptable-use", "/ai-transparency", "/contact"];
const WIDTHS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];

let pass = 0;
const failures = [];
const notes = [];
let ctx = "";
const check = (name, cond, detail = "") => {
  const tagged = ctx ? `[${ctx}] ${name}` : name;
  if (cond) { pass++; console.log(`  PASS  ${tagged}`); }
  else { failures.push(tagged); console.log(`  FAIL  ${tagged}${detail ? `\n        ${detail}` : ""}`); }
};
const note = (t) => { notes.push(t); console.log(`  ....  ${t}`); };

const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const { FOOTER_LINKS } = await loadTs("src/lib/footer-links.ts");
const LANGUAGE_LABELS = LOCALES.map((l) => messages[l].language?.label).filter(Boolean);

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--no-sandbox", "--ssl-version-max=tls1.2"],
});

const PROBE = (labels) => {
  const all = Array.from(document.querySelectorAll('[data-testid="language-control"], button[aria-label]')).filter(
    (el) => el.getAttribute("data-testid") === "language-control" || labels.includes(el.getAttribute("aria-label") ?? "")
  );
  const visible = all.filter((el) => el.offsetParent !== null);
  return visible.map((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      x: Math.round(cx), y: Math.round(cy), w: Math.round(r.width), h: Math.round(r.height),
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      hitIsControl: hit !== null && (hit === el || el.contains(hit)),
      text: (el.textContent ?? "").trim(),
    };
  });
};

try {
  // ==================================================================
  console.log(`== 1. the three pages, from ${SITE}, in ten languages ==`);
  // ==================================================================
  for (const locale of LOCALES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([{ name: "NEXT_LOCALE", value: locale, domain: new URL(SITE).hostname, path: "/" }]);
    const page = await context.newPage();
    for (const path of THE_THREE) {
      ctx = `${locale} ${path}`;
      const res = await page.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      check(`answers 200 (${res?.status()})`, res?.status() === 200);
      const got = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        h1: document.querySelector("h1")?.textContent?.trim() ?? "",
        main: Boolean(document.querySelector("main")),
      }));
      check(`the page is in ${locale} (lang="${got.lang}")`, got.lang.startsWith(locale));
      check(`has a heading ("${got.h1.slice(0, 40)}")`, got.h1.length > 0);
      check("has a <main> landmark", got.main);
      // NAMED, per locale: the footer label for this page, as this
      // checkout translates it, is what the page's own title resolves to.
      if (path !== "/contact") {
        const key = FOOTER_LINKS.find((l) => l.href === path)?.labelKey;
        const expected = key ? key.split(".").reduce((o, k) => o?.[k], messages[locale].landing) : null;
        check(`the heading is the ${locale} title ("${expected}")`, typeof expected === "string" && got.h1 === expected, `got "${got.h1}"`);
      }
    }
    await context.close();
  }

  // ==================================================================
  console.log("\n== 2. /contact says the mailer is not fully configured ==");
  // ==================================================================
  {
    ctx = "contact";
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: new URL(SITE).hostname, path: "/" }]);
    const page = await context.newPage();
    await page.goto(`${SITE}/contact`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const status = await page.evaluate(() => {
      const el = document.querySelector('[role="status"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: el.textContent?.trim() ?? "", visible: r.width > 0 && r.height > 0 };
    });
    const en = messages.en.contact.outage;
    check("the outage notice is on the page", status !== null && status.visible);
    check("...and it is one of the two honest sentences (test sender / no key)",
      status !== null && (status.text.includes(en.titleTestSender) || status.text.includes(en.titleNoKey)),
      status?.text.slice(0, 120));
    if (status?.text.includes(en.titleNoKey)) note("the live site has NO mail key at all: the form is not rendered");
    else note("the live site is on the shared test sender: the form renders, delivery is 'plausible', not promised");
    await context.close();
  }

  // ==================================================================
  console.log("\n== 3. the landing footer is this checkout's footer ==");
  // ==================================================================
  {
    ctx = "footer";
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const live = await page.evaluate(() =>
      Array.from(document.querySelectorAll("footer a[href]")).map((a) => a.getAttribute("href"))
    );
    const expected = FOOTER_LINKS.map((l) => l.href);
    check(`the footer has links (${live.length})`, live.length >= 5, live.join(", "));
    const extra = live.filter((h) => !expected.includes(h));
    const missing = expected.filter((h) => !live.includes(h));
    check(
      "the live footer matches lib/footer-links.ts exactly",
      extra.length === 0 && missing.length === 0,
      `DEPLOY BEHIND THIS CHECKOUT — live has ${extra.length ? `extra: ${extra.join(", ")}` : "nothing extra"}; ` +
        `${missing.length ? `missing: ${missing.join(", ")}` : "nothing missing"}`
    );
    check("/roadmap is not linked from the live footer", !live.includes("/roadmap"), "hidden until V7.5 — not deployed yet if this is red");
    const roadmap = await page.evaluate(async () => (await fetch("/roadmap", { redirect: "manual" })).status);
    check(`/roadmap still answers at its URL (${roadmap})`, roadmap === 200, "hidden means unlinked, not deleted");
    await context.close();
  }

  // ==================================================================
  console.log("\n== 4. the public language control, at five widths ==");
  // ==================================================================
  for (const { width, height } of WIDTHS) {
    ctx = `public @${width}`;
    const touch = width <= 430;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    const found = await page.evaluate(PROBE, LANGUAGE_LABELS);
    check(`exactly one control is painted (${found.length})`, found.length === 1);
    const c = found[0];
    if (c) {
      check(`elementFromPoint at its centre IS the control`, c.hitIsControl);
      check(`inside the viewport and ≥44px (${c.w}x${c.h})`, c.inViewport && c.w >= 44 && c.h >= 44);
      check(`reads as a word ("${c.text}")`, /^[a-z]{2}$/i.test(c.text), "a bare globe — the locale code is not deployed yet if this is red");
      if (touch) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.click(c.x, c.y);
      }
      await page.waitForTimeout(600);
      const listed = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "Ελληνικά" && b.offsetParent !== null).length
      );
      check(`${touch ? "a real touch" : "a click"} opens the list`, listed === 1);
      await page.screenshot({ path: `/tmp/public-live-language-${width}.png` });
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (notes.length) console.log("notes:\n  " + notes.join("\n  "));
process.exit(failures.length === 0 ? 0 : 1);
