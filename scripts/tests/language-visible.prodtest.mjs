// THE LANGUAGE CONTROL IS VISIBLE — NOT PRESENT, VISIBLE — AT EVERY WIDTH.
//
// "It exists in the DOM" was true both times somebody reported that it did
// not exist. The first time it was rendered inside `hidden sm:contents`;
// the second time it was rendered at the bottom of a scrolling drawer,
// below the fold of every phone. A selector query finds both. A person
// finds neither.
//
// So this asks the browser the only question that matters: at the centre
// of the control's box, what does document.elementFromPoint return? If it
// is the control (or something inside it), nothing is covering it, it is
// inside the viewport, it is painted, and a finger landing there lands on
// it. Then the finger is actually put there — a real CDP touch on the
// phone widths, a mouse click on the rest — and the list of ten languages
// has to open, and choosing one has to reach the account.
//
// FIVE WIDTHS, the ones named in the brief: 1920, 1440, 768, 390, 375.
// Both dashboard surfaces — the top bar, and the card on Settings — plus
// the floating cluster on a public page, since a visitor who has not
// signed up is the one most likely to need a language they can read.
//
// Against a real production build (scripts/lib/prod-harness.mjs: `next
// build`, `next start`, a stand-in Supabase). It cannot sign in to the
// live site, so the live check is the public half only — see
// scripts/tests/public-live.prodtest.mjs for that.
//
// SCREENSHOTS to /tmp/language-visible-<surface>-<width>[-open].png.
//
// Run: node scripts/tests/language-visible.prodtest.mjs
import { startProdHarness } from "../lib/prod-harness.mjs";
import { chromium } from "playwright";
import { chromiumPath } from "./lib/chromium.mjs";
import { readdirSync, readFileSync } from "node:fs";

const NATIVE_LABELS = [
  "English", "Ελληνικά", "Español", "Français", "Deutsch",
  "Italiano", "Português", "中文", "日本語", "العربية",
];
const WIDTHS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];
const TOUCH = (w) => w <= 430;

let pass = 0;
const failures = [];
let ctxLabel = "";
const check = (name, cond, detail = "") => {
  const tagged = ctxLabel ? `[${ctxLabel}] ${name}` : name;
  if (cond) { pass++; console.log(`  PASS  ${tagged}`); }
  else { failures.push(tagged); console.log(`  FAIL  ${tagged}${detail ? `\n        ${detail}` : ""}`); }
};

// FOUND BY TWO NAMES, so this gate can be run against the build BEFORE
// the fix and fail for the right reason. The testid is new; the old
// control had only an aria-label of "Language" in the page's locale. A
// probe that knew only the testid would report "not in the DOM" on the
// old build at every width — true, and not the defect. Reading the old
// control by its label makes the old desktop build fail on "reads as a
// word" (a bare globe) and the old phone build on "exactly one is
// painted (0)" (three copies, all hidden), which are the two reports.
const LANGUAGE_LABELS = readdirSync("messages")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`messages/${f}`, "utf8")).language?.label)
  .filter((l) => typeof l === "string");

/** Geometry and hit-test of every element that IS the language control. */
const PROBE = (labels) => {
  const all = Array.from(document.querySelectorAll('[data-testid="language-control"], button[aria-label]')).filter(
    (el) => el.getAttribute("data-testid") === "language-control" || labels.includes(el.getAttribute("aria-label") ?? "")
  );
  const visible = all.filter((el) => el.offsetParent !== null);
  const info = visible.map((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      x: Math.round(cx), y: Math.round(cy),
      w: Math.round(r.width), h: Math.round(r.height),
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      hitIsControl: hit !== null && (hit === el || el.contains(hit)),
      hitDescribed: hit ? `${hit.tagName.toLowerCase()}${hit.className ? "." + String(hit.className).split(" ").slice(0, 3).join(".") : ""}` : "nothing",
      inHeader: Boolean(el.closest("header")),
      text: (el.textContent ?? "").trim(),
      label: el.getAttribute("aria-label") ?? "",
    };
  });
  return {
    total: all.length,
    visible: info,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
};

/** The ten language buttons currently painted (not the Settings card's). */
const LIST_OPEN = (labels) =>
  Array.from(document.querySelectorAll("button"))
    .filter((b) => labels.includes(b.textContent?.trim() ?? "") && !b.closest("#language") && b.offsetParent !== null)
    .map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent?.trim(), inViewport: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight, h: Math.round(r.height) };
    });

/** A real press: CDP touch on phone widths, a mouse click elsewhere. */
async function press(page, x, y, touch) {
  if (!touch) {
    await page.mouse.click(x, y);
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
}

const harness = await startProdHarness({
  tableRows: {
    user_credits: [{ user_id: "00000000-0000-4000-8000-000000000001", credits_remaining: 500, credits_total: 500 }],
    // Without this row /dashboard/overview redirects to /onboarding.
    user_onboarding: [{ user_id: "00000000-0000-4000-8000-000000000001", completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
  },
  supaPort: 54397,
});
const browser = await chromium.launch({ executablePath: chromiumPath() });

try {
  for (const { width, height } of WIDTHS) {
    const touch = TOUCH(width);
    // Every width starts from the same account: English, no preference.
    harness.setUserMetadata({});
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await context.addCookies([{ ...harness.AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
    const page = await context.newPage();

    // ================================================================
    ctxLabel = `top bar @${width}`;
    // ================================================================
    await page.goto(`${harness.origin}/dashboard/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page);
    check("the page is the dashboard, not a redirect", (await page.evaluate(() => location.pathname)) === "/dashboard/overview",
      await page.evaluate(() => location.pathname));
    await page.screenshot({ path: `/tmp/language-visible-topbar-${width}.png` });

    let probe = await page.evaluate(PROBE, LANGUAGE_LABELS);
    check(`the control is in the DOM (${probe.total})`, probe.total >= 1);
    check(`exactly one is painted (${probe.visible.length})`, probe.visible.length === 1,
      probe.visible.length === 0 ? "rendered somewhere display:none — present is not visible" : "two on one screen");
    const c = probe.visible[0];
    if (c) {
      check("it is inside the <header>, not a drawer or a menu", c.inHeader);
      check(`its box is entirely inside the viewport (${c.x},${c.y})`, c.inViewport);
      check(`it is at least 44x44 (${c.w}x${c.h})`, c.w >= 44 && c.h >= 44);
      check(`elementFromPoint at its centre IS the control (got ${c.hitDescribed})`, c.hitIsControl,
        "something is painted over it — a person tapping here taps that instead");
      check(`it reads as a word, not only an icon ("${c.text}")`, /^[a-z]{2}$/i.test(c.text), "the locale code beside the globe is what makes it findable");
      check(`the page does not scroll sideways (${probe.scrollWidth} <= ${probe.innerWidth})`, probe.scrollWidth <= probe.innerWidth,
        "adding the control pushed the header past the viewport");

      // THE PRESS. A real one.
      await press(page, c.x, c.y, touch);
      await page.waitForTimeout(600);
      const list = await page.evaluate(LIST_OPEN, NATIVE_LABELS);
      check(`${touch ? "a real touch" : "a click"} opens the list of ten (${list.length})`, list.length === 10,
        list.map((l) => l.text).join(", "));
      check("...and the whole list is inside the viewport", list.length > 0 && list.every((l) => l.inViewport),
        list.filter((l) => !l.inViewport).map((l) => l.text).join(", "));
      check("...with 44px rows", list.length > 0 && list.every((l) => l.h >= 44), list.map((l) => `${l.text}:${l.h}`).join(" "));
      await page.screenshot({ path: `/tmp/language-visible-topbar-${width}-open.png` });

      // CHOOSING ONE REACHES THE ACCOUNT, and the bar re-renders in it.
      const before = harness.authWrites.length;
      const greek = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent?.trim() === "Ελληνικά" && !x.closest("#language") && x.offsetParent !== null);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      check("Ελληνικά is on the list", greek !== null);
      if (greek) {
        await press(page, greek.x, greek.y, touch);
        for (let i = 0; i < 10 && !harness.authWrites.slice(before).some((w) => w.body?.data?.preferred_locale === "el"); i++) {
          await page.waitForTimeout(500);
        }
        check("the choice is written to the ACCOUNT (PUT /auth/v1/user)",
          harness.authWrites.slice(before).some((w) => w.body?.data?.preferred_locale === "el"),
          JSON.stringify(harness.authWrites.slice(before)));
        await settle(page);
        probe = await page.evaluate(PROBE, LANGUAGE_LABELS);
        const after = probe.visible[0];
        check(`the bar re-rendered in Greek (code "${after?.text}", label "${after?.label}")`,
          after !== undefined && after.text.toLowerCase() === "el" && after.label === "Γλώσσα");
      }
    }

    // ================================================================
    ctxLabel = `settings @${width}`;
    // ================================================================
    harness.setUserMetadata({});
    await page.goto(`${harness.origin}/dashboard/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page);
    const card = await page.evaluate(() => {
      const el = document.querySelector("#language");
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const first = el.querySelector("button");
      if (!first) return { found: true, option: null };
      const r = first.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        found: true,
        option: {
          text: first.textContent?.trim(),
          w: Math.round(r.width), h: Math.round(r.height),
          hitInCard: hit !== null && el.contains(hit),
          hitDescribed: hit ? hit.tagName.toLowerCase() : "nothing",
        },
        options: el.querySelectorAll("button").length,
      };
    });
    check("Settings has the #language card", card !== null && card.found);
    check(`...offering ten languages (${card?.options ?? 0})`, card?.options === 10);
    check(`...whose first option is hit by elementFromPoint (${card?.option?.hitDescribed})`, Boolean(card?.option?.hitInCard));
    check(`...at 44px or taller (${card?.option?.h})`, (card?.option?.h ?? 0) >= 44);
    await page.screenshot({ path: `/tmp/language-visible-settings-${width}.png` });

    // ================================================================
    ctxLabel = `public @${width}`;
    // ================================================================
    // A signed-out visitor on the landing page. Fresh context: no cookie.
    const anon = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const pub = await anon.newPage();
    await pub.goto(`${harness.origin}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(pub);
    const pprobe = await pub.evaluate(PROBE, LANGUAGE_LABELS);
    check(`exactly one control is painted (${pprobe.visible.length})`, pprobe.visible.length === 1);
    const pc = pprobe.visible[0];
    if (pc) {
      check(`elementFromPoint at its centre IS the control (got ${pc.hitDescribed})`, pc.hitIsControl);
      check(`it is inside the viewport and ≥44px (${pc.w}x${pc.h})`, pc.inViewport && pc.w >= 44 && pc.h >= 44);
      await press(pub, pc.x, pc.y, touch);
      await pub.waitForTimeout(600);
      const list = await pub.evaluate(LIST_OPEN, NATIVE_LABELS);
      check(`${touch ? "a real touch" : "a click"} opens the list of ten (${list.length})`, list.length === 10);
      await pub.screenshot({ path: `/tmp/language-visible-public-${width}-open.png` });
    }
    await anon.close();
    await context.close();
  }
} finally {
  ctxLabel = "";
  await browser.close();
  harness.cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) console.log("  " + failures.join("\n  "));
process.exit(failures.length === 0 ? 0 : 1);
