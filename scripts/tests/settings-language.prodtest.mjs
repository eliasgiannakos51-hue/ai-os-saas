// "ΔΕΝ ΥΠΑΡΧΕΙ ΑΛΛΑΓΗ ΓΛΩΣΣΑΣ ΠΟΥΘΕΝΑ" — and the harder half of it.
//
// There WAS a switcher: an unlabelled globe icon in the top-right corner,
// which is discoverable if you already know it is there. Rendered is not
// the same as findable, and Settings — the one place a person looks for
// "what language is this in" — had nothing.
//
// The half that was genuinely broken rather than merely hidden is where
// the choice went. It went into a NEXT_LOCALE cookie and nowhere else, so
// it was a per-BROWSER fact: picked on the laptop, absent on the phone,
// gone with cleared site data. Nothing in the app could see that, because
// from inside the browser a cookie-only write and an account write look
// EXACTLY THE SAME — the page changes language either way. That is why
// this test watches the network rather than the pixels for check 3, and
// why the harness now records writes to /auth/v1/user at all.
//
// WHAT EACH CHECK WOULD CATCH, stated so a future reader can break one on
// purpose and see it go red (all four mutations were run — see the commit
// message):
//
//   1-2  the card is gone, or does not offer all ten languages
//   3    the choice is written to a cookie only, never to the account
//   4    the account write happens but the page does not re-render
//   5    the account holds the language and a NEW DEVICE still gets English
//   6    the nav globe went back to writing a cookie only, which middleware
//        would then revert on the next navigation — language changes, then
//        changes back
//
// Run: node scripts/tests/settings-language.prodtest.mjs
import { startProdHarness } from "../lib/prod-harness.mjs";
import { chromium } from "playwright";

// Every language the app claims to have, in its own script. A reader who
// has landed in the wrong language cannot read "Greek" but can read
// "Ελληνικά" — so the list on screen has to be the native one.
const NATIVE_LABELS = [
  "English", "Ελληνικά", "Español", "Français", "Deutsch",
  "Italiano", "Português", "中文", "日本語", "العربية",
];

// HYDRATION, NOT A TIMEOUT. The first version of this test clicked after a
// fixed 1.2s wait and reported "the choice is never written to the
// account" — on a build where it was. A production Settings page is a lot
// of JavaScript, the button existed in the server-rendered HTML long
// before React attached a listener to it, and a click into un-hydrated
// markup does exactly nothing and reports success. That is a test lying in
// the more dangerous direction, so it retries the click and waits for the
// EFFECT instead of for the clock.
async function clickUntil(page, selectorText, scope, isDone, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const hit = await page.evaluate(
      ({ text, scope }) => {
        const root = scope ? document.querySelector(scope) : document;
        if (!root) return false;
        const btn = Array.from(root.querySelectorAll("button")).find(
          (b) => b.textContent?.trim() === text && b.offsetParent !== null
        );
        if (!btn) return false;
        btn.click();
        return true;
      },
      { text: selectorText, scope }
    );
    if (hit && (await isDone())) return true;
    await page.waitForTimeout(1500);
    if (await isDone()) return true;
  }
  return false;
}

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

const harness = await startProdHarness({ tableRows: {}, supaPort: 54393 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

try {
  // ====================================================================
  // 1-2. The card exists on Settings, and offers all ten.
  // ====================================================================
  console.log("\n== Settings: the card ==");
  const ctx = await harness.signedIn(browser, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  // A click that silently does nothing looks identical to a click that was
  // never wired up, so the browser's own complaints are collected and
  // printed rather than discarded.
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") pageErrors.push(`${m.type()}: ${m.text()}`);
  });
  // Next.js aborts its own route prefetches on navigation; those are noise
  // and they crowded out the one line that mattered the first time this
  // was instrumented.
  page.on("requestfailed", (r) => {
    if (!/_rsc=/.test(r.url())) pageErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`);
  });
  await page.goto(`${harness.origin}/dashboard/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const card = await page.evaluate(() => {
    const el = document.querySelector("#language");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      heading: el.querySelector("h2")?.textContent?.trim() ?? "",
      // Native labels come from the button text, and only from buttons
      // that a person can actually press.
      options: Array.from(el.querySelectorAll("button")).map((b) => ({
        text: b.textContent?.trim() ?? "",
        lang: b.getAttribute("lang") ?? "",
        height: Math.round(b.getBoundingClientRect().height),
      })),
      visible: r.width > 0 && r.height > 0,
    };
  });

  check("Settings has a #language card", card !== null && card.visible,
    card === null ? "no element with id=language on /dashboard/settings" : "");

  const optionTexts = (card?.options ?? []).map((o) => o.text);
  const missing = NATIVE_LABELS.filter((l) => !optionTexts.includes(l));
  check("all ten languages are offered, in their own script", missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : "");

  // A control nobody can hit on a phone is not a control. 44px is the
  // same floor the rest of this codebase uses.
  const tooSmall = (card?.options ?? []).filter((o) => o.height < 44);
  check("every language button is at least 44px tall", tooSmall.length === 0,
    tooSmall.map((o) => `${o.text} ${o.height}px`).join(", "));

  // Findable, not merely present: the jump-to-section nav names it.
  const inJumpNav = await page.evaluate(() =>
    Boolean(document.querySelector('nav a[href="#language"]'))
  );
  check("the jump-to-section nav offers Language", inJumpNav);

  // ====================================================================
  // 3-4. Choosing one writes the ACCOUNT, then re-renders.
  // ====================================================================
  console.log("\n== choosing Ελληνικά ==");
  // IS REACT EVEN LISTENING? Asked with a control that is not the one
  // under test: ThemeSettings sits on the same page, is a client
  // component, and writes an attribute onto <html> synchronously. If that
  // works the page is hydrated and clicks are handled — which turns "the
  // language button does nothing" from two possible faults into one.
  const hydrated = await page.evaluate(() => {
    const before = document.documentElement.getAttribute("data-theme");
    const btn = Array.from(document.querySelectorAll("#theme button")).find(
      (b) => b.getAttribute("aria-pressed") === "false"
    );
    if (!btn) return { ok: false, why: "no theme button found" };
    btn.click();
    return { ok: document.documentElement.getAttribute("data-theme") !== before, before,
             after: document.documentElement.getAttribute("data-theme") };
  });
  console.log(`  hydration probe (theme button): ${JSON.stringify(hydrated)}`);

  const before = harness.authWrites.length;
  await clickUntil(page, "Ελληνικά", "#language", async () =>
    harness.authWrites.slice(before).some((w) => w.body?.data?.preferred_locale === "el")
  );
  await page.waitForTimeout(2000);

  const cookieAfter = await page.evaluate(() => document.cookie);
  if (pageErrors.length) {
    console.log("  browser said:");
    for (const e of pageErrors) console.log(`    ${e}`);
  }
  console.log(`  document.cookie after the click: ${cookieAfter}`);

  const writes = harness.authWrites.slice(before);
  const wroteLocale = writes.some((w) => w.body?.data?.preferred_locale === "el");
  check("the choice is written to the ACCOUNT (PUT /auth/v1/user)", wroteLocale,
    `writes seen: ${JSON.stringify(writes)}`);

  const afterHeading = await page.evaluate(
    () => document.querySelector("#language h2")?.textContent?.trim() ?? ""
  );
  check("the page re-renders in the chosen language",
    afterHeading.includes("Γλώσσα"), `heading was "${afterHeading}"`);

  await ctx.close();

  // ====================================================================
  // 5. A NEW DEVICE inherits it. This is the whole point of storing it on
  //    the account, and no amount of cookie-writing can pass it.
  // ====================================================================
  console.log("\n== a new device, no cookie ==");
  harness.setUserMetadata({ preferred_locale: "fr" });
  // Deliberately NOT harness.signedIn's sibling context — a brand-new
  // context has no NEXT_LOCALE cookie at all, which is exactly what a
  // second phone looks like on its first request.
  const fresh = await harness.signedIn(browser, { width: 1280, height: 900 });
  const freshCookies = await fresh.cookies();
  check("the fresh context really has no locale cookie",
    !freshCookies.some((c) => c.name === "NEXT_LOCALE"),
    JSON.stringify(freshCookies.map((c) => c.name)));

  const freshPage = await fresh.newPage();
  await freshPage.goto(`${harness.origin}/dashboard/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await freshPage.waitForLoadState("networkidle").catch(() => {});
  await freshPage.waitForTimeout(2000);
  const freshHeading = await freshPage.evaluate(
    () => document.querySelector("#language h2")?.textContent?.trim() ?? ""
  );
  check("a device with no cookie renders the ACCOUNT's language on the FIRST load",
    freshHeading.includes("Langue"), `heading was "${freshHeading}"`);

  // ...and the cookie it now carries is the account's value, so every
  // later render is served from the cookie with no auth lookup.
  const syncedCookies = await fresh.cookies();
  const localeCookie = syncedCookies.find((c) => c.name === "NEXT_LOCALE");
  check("middleware left the account's language in the cookie",
    localeCookie?.value === "fr", `cookie was ${JSON.stringify(localeCookie)}`);

  // ====================================================================
  // 6. The nav globe writes the account too — or middleware reverts it.
  // ====================================================================
  console.log("\n== the nav globe ==");
  const navBefore = harness.authWrites.length;

  // The globe is found by WHAT IT DOES, not by its label or its position:
  // the visible aria-expanded control whose dropdown contains the language
  // list. Matching on the accessible name would mean hardcoding one
  // locale's word for "Language" into a test that deliberately changes
  // locale mid-run; matching on position breaks with the viewport. There
  // are two globes in the dashboard header (desktop bar, mobile menu) and
  // only one is visible at a time — offsetParent tells them apart.
  //
  // CLICK AND CHECK ARE SEPARATE EVALUATES, and that is the whole reason
  // this loop looks the way it does. The first version clicked and read
  // the result inside ONE page.evaluate: React had not re-rendered yet, so
  // the dropdown was always "not open", the loop clicked the same button a
  // second time to put it back, and the control it was looking for was
  // opened and closed forty times in a row while the test reported it
  // could not be found.
  const listShown = () =>
    freshPage.evaluate(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent?.trim() === "Deutsch" && !b.closest("#language") && b.offsetParent !== null
      )
    );

  const opened = await (async () => {
    if (await listShown()) return true;
    for (let round = 0; round < 6; round++) {
      const candidates = await freshPage.evaluate(() =>
        Array.from(document.querySelectorAll("button[aria-expanded]")).filter(
          (b) => b.offsetParent !== null && !b.closest("#language")
        ).length
      );
      for (let i = 0; i < candidates; i++) {
        await freshPage.evaluate((index) => {
          const list = Array.from(document.querySelectorAll("button[aria-expanded]")).filter(
            (b) => b.offsetParent !== null && !b.closest("#language")
          );
          list[index]?.click();
        }, i);
        await freshPage.waitForTimeout(350);
        if (await listShown()) return true;
        // Not this one — close it again so the next candidate is not
        // hidden behind an open overlay.
        await freshPage.evaluate((index) => {
          const list = Array.from(document.querySelectorAll("button[aria-expanded]")).filter(
            (b) => b.offsetParent !== null && !b.closest("#language")
          );
          list[index]?.click();
        }, i);
        await freshPage.waitForTimeout(200);
      }
      await freshPage.waitForTimeout(800);
    }
    return false;
  })();

  // "Deutsch" appears in the Settings card too, so the search is scoped to
  // the dropdown by excluding anything inside #language.
  const clicked = await (async () => {
    for (let i = 0; i < 8; i++) {
      const hit = await freshPage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) =>
            b.textContent?.trim() === "Deutsch" &&
            !b.closest("#language") &&
            b.offsetParent !== null
        );
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (hit) return true;
      await freshPage.waitForTimeout(1000);
    }
    return false;
  })();
  await freshPage.waitForTimeout(2500);

  check("the nav globe's dropdown was reachable", opened && clicked,
    `opened=${opened} clicked=${clicked}`);
  const navWrites = harness.authWrites.slice(navBefore);
  check("the nav globe also writes the ACCOUNT, so middleware cannot revert it",
    navWrites.some((w) => w.body?.data?.preferred_locale === "de"),
    `writes seen: ${JSON.stringify(navWrites)}`);

  await fresh.close();
} finally {
  await browser.close();
  harness.cleanup();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
}
// EXPLICIT, like every other prodtest in this directory. `next start` is
// spawned through a shell, so killing that shell leaves the real
// next-server orphaned and node's event loop never drains — the process
// hangs forever AFTER printing a perfectly good result. Setting
// process.exitCode instead of exiting is what made the first two runs of
// this file report "terminated" on a green suite.
process.exit(failures.length === 0 ? 0 : 1);
