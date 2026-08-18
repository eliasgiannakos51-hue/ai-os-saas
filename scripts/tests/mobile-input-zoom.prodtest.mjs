// "AUTO-ZOOM ΣΤΟ iOS ΟΤΑΝ ΠΑΤΑΣ INPUT" — and why nothing caught it.
//
// iOS Safari zooms the page in when you focus a text field whose
// font-size is UNDER 16px. It is not a bug in the page and it is not
// configurable: it is Safari deciding the text is too small to type into.
// The page then stays zoomed, the layout is wider than the screen, and
// every subsequent tap is off. On this app it fired on every single form,
// because `.input` — the class every text field, textarea and select is
// built from (globals.css) — was `text-sm`, which is 14px.
//
// WHY THE EXISTING GATES WERE ALL GREEN. routes-smoke measures OVERFLOW,
// layout-stress measures OVERLAP, landing-alignment measures MARGINS. A
// 14px input overflows nothing, overlaps nothing and is perfectly
// centred. None of them ever asked what size the text in a field was, so
// none of them could see it — the same shape of gap as the landing
// buttons. A gate does not see what it does not measure.
//
// THE FIX IS NOT `maximum-scale=1`, WHICH IS WHY CHECK D EXISTS.
// The one-line "fix" everyone reaches for is a viewport meta that forbids
// zooming. That does stop the auto-zoom — by taking pinch-zoom away from
// everyone, including the people who need it to read at all. It is an
// accessibility regression traded for a layout annoyance. Check D fails
// if anybody ever adds it.
//
// Run: node scripts/tests/mobile-input-zoom.prodtest.mjs
import { startProdHarness } from "../lib/prod-harness.mjs";
import { chromium } from "playwright";

// The threshold is Safari's, not ours. At exactly 16px it does not zoom.
const MIN_MOBILE_FONT_PX = 16;
// iPhone SE / iPhone 8 width — the narrowest phone still in use, and the
// width the report came from.
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };

// Only the controls Safari actually zooms for. A checkbox, a radio, a
// range, a colour swatch and a file picker have no text to type, and
// Safari leaves them alone — flagging them would be noise that gets the
// whole test ignored.
const ZOOMING_TYPES_EXCLUDED = [
  "checkbox", "radio", "range", "color", "file", "hidden",
  "submit", "button", "reset", "image",
];

const PUBLIC_ROUTES = ["/", "/pricing", "/help", "/terms", "/privacy", "/login", "/signup", "/roadmap"];
const DASHBOARD_ROUTES = [
  "/dashboard", "/dashboard/overview", "/dashboard/chat", "/dashboard/create",
  "/dashboard/website-builder", "/dashboard/mission", "/dashboard/documents",
  "/dashboard/favorites", "/dashboard/timeline", "/dashboard/memory",
  "/dashboard/marketplace", "/dashboard/settings", "/dashboard/team",
  "/dashboard/reflection", "/dashboard/agents", "/dashboard/published",
  "/dashboard/integrations", "/dashboard/files", "/dashboard/deep-research",
  "/onboarding", "/dashboard/apps", "/dashboard/images", "/dashboard/videos",
  "/dashboard/coding", "/dashboard/campaigns", "/dashboard/data-analysis",
  "/dashboard/presentations", "/dashboard/websites",
  "/dashboard/product-workflow", "/dashboard/trading-workflow",
];

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

/** Every text-entry control in the document, with what it computes to. */
const PROBE = (excluded) => {
  const controls = Array.from(document.querySelectorAll("input, textarea, select"));
  return controls
    .filter((el) => {
      if (el.tagName !== "INPUT") return true;
      return !excluded.includes((el.getAttribute("type") || "text").toLowerCase());
    })
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      // The computed value, not the class. A class can be overridden, a
      // shorthand can lose, and the only thing Safari reads is this.
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      cls: (el.getAttribute("class") || "").slice(0, 90),
      name: el.getAttribute("name") || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "",
    }));
};

const harness = await startProdHarness({ tableRows: {}, supaPort: 54395 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

const offenders = [];
let controlsSeen = 0;

try {
  // ====================================================================
  // A. Every control on every reachable page, at 375px.
  // ====================================================================
  console.log("\n== A. every form control at 375px ==");
  const anon = await browser.newContext({ viewport: PHONE });
  const signed = await harness.signedIn(browser, PHONE);

  for (const [ctx, routes, label] of [
    [anon, PUBLIC_ROUTES, "public"],
    [signed, DASHBOARD_ROUTES, "signed-in"],
  ]) {
    for (const route of routes) {
      const page = await ctx.newPage();
      try {
        await page.goto(`${harness.origin}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await page.waitForTimeout(900);
        const controls = await page.evaluate(PROBE, ZOOMING_TYPES_EXCLUDED);
        controlsSeen += controls.length;
        for (const c of controls) {
          if (c.fontSize < MIN_MOBILE_FONT_PX) {
            offenders.push({ route, ...c });
          }
        }
        const bad = controls.filter((c) => c.fontSize < MIN_MOBILE_FONT_PX).length;
        console.log(
          `  ${label} ${route}: ${controls.length} control(s)` +
            (bad ? `  <-- ${bad} under ${MIN_MOBILE_FONT_PX}px` : "")
        );
      } catch (err) {
        console.log(`  ${label} ${route}: SKIPPED (${String(err).slice(0, 80)})`);
      } finally {
        await page.close();
      }
    }
  }

  // ------------------------------------------------------------------
  // A2. The forms the sweep above cannot see, because they are behind
  //     something.
  // ------------------------------------------------------------------
  // The first version of this sweep reported "0 control(s)" for /signup
  // and /dashboard/agents and counted that as coverage. Neither is empty:
  //   /signup      step 1 is a plan picker; the email, password, country
  //                and discount fields are on step 2.
  //   agents etc.  the harness account has no subscription_tier, so every
  //                plan-gated workspace renders an upgrade wall instead of
  //                its form.
  // A route that renders no control is not the same as a route with no
  // control, and reading the first as the second is how a green sweep
  // measures nothing.
  console.log("\n== A2. forms behind a step or a paywall ==");

  // Signup step 2: pick the free plan and continue.
  const signupPage = await anon.newPage();
  await signupPage.goto(`${harness.origin}/signup`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await signupPage.waitForLoadState("networkidle").catch(() => {});
  await signupPage.waitForTimeout(2000);
  let signupControls = [];
  for (let i = 0; i < 6 && signupControls.length === 0; i++) {
    await signupPage.evaluate(() => {
      // The step-1 continue action, found by the email field it reveals
      // rather than by its label, which is translated.
      for (const b of Array.from(document.querySelectorAll("button"))) {
        if (b.offsetParent === null || b.disabled) continue;
        b.click();
        if (document.querySelector('input[type="email"]')) return;
      }
    });
    await signupPage.waitForTimeout(1200);
    signupControls = await signupPage.evaluate(PROBE, ZOOMING_TYPES_EXCLUDED);
  }
  controlsSeen += signupControls.length;
  for (const c of signupControls) {
    if (c.fontSize < MIN_MOBILE_FONT_PX) offenders.push({ route: "/signup (step 2)", ...c });
  }
  check("signup step 2 was actually reached", signupControls.length >= 3,
    `saw ${signupControls.length} control(s): ${signupControls.map((c) => c.tag + (c.type ? ":" + c.type : "")).join(", ")}`);
  console.log(`  /signup step 2: ${signupControls.length} control(s)`);
  await signupPage.close();

  // The plan-gated workspaces, on a plan that unlocks them.
  harness.setUserMetadata({ subscription_tier: "ultimate" });
  const paid = await harness.signedIn(browser, PHONE);
  const GATED = ["/dashboard/agents", "/dashboard/marketplace", "/dashboard/create", "/dashboard/team"];
  let gatedSeen = 0;
  for (const route of GATED) {
    const page = await paid.newPage();
    try {
      await page.goto(`${harness.origin}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1500);
      const controls = await page.evaluate(PROBE, ZOOMING_TYPES_EXCLUDED);
      controlsSeen += controls.length;
      gatedSeen += controls.length;
      for (const c of controls) {
        if (c.fontSize < MIN_MOBILE_FONT_PX) offenders.push({ route: `${route} (ultimate)`, ...c });
      }
      console.log(`  ultimate ${route}: ${controls.length} control(s)`);
    } catch (err) {
      console.log(`  ultimate ${route}: SKIPPED (${String(err).slice(0, 80)})`);
    } finally {
      await page.close();
    }
  }
  check("the paywalled workspaces rendered their forms on a paid plan", gatedSeen > 0,
    `saw ${gatedSeen} control(s) across ${GATED.join(", ")}`);
  await paid.close();
  harness.setUserMetadata({});

  check(
    `every text-entry control on ${PUBLIC_ROUTES.length + DASHBOARD_ROUTES.length} routes is >= ${MIN_MOBILE_FONT_PX}px at 375px`,
    offenders.length === 0,
    offenders
      .slice(0, 25)
      .map((o) => `${o.route}  <${o.tag}${o.type ? ` type=${o.type}` : ""}> ${o.fontSize}px  ${o.name || o.cls}`)
      .join("\n        ") + (offenders.length > 25 ? `\n        ...and ${offenders.length - 25} more` : "")
  );
  // A pass on zero controls would be a green light that measured nothing.
  check("the sweep actually found form controls to measure", controlsSeen >= 10,
    `saw ${controlsSeen}`);

  // ====================================================================
  // B. The class combinations the codebase actually uses on controls.
  // ====================================================================
  // Every text-size class that appears on an <input>/<textarea>/<select>
  // anywhere in src/, measured by INJECTING it rather than by finding a
  // page that happens to render it. That is what covers the controls this
  // sweep cannot reach without clicking: the publish dialog, the rename
  // field, the agent editor's steps, every modal. If the rule beats these
  // classes here, it beats them there — same stylesheet, same specificity.
  console.log("\n== B. injected probes: the classes used on real controls ==");
  const probePage = await signed.newPage();
  await probePage.goto(`${harness.origin}/dashboard/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await probePage.waitForTimeout(600);

  const COMBOS = [
    // tag, class — every combination found by grepping src/ for a
    // text-size utility within a form-control tag.
    ["input", "input"],
    ["input", "input text-xs"],
    ["input", "input text-sm"],
    ["input", "input text-[11px]"],
    ["input", "input font-mono text-xs"],
    ["input", "text-xs"],
    ["input", "text-sm"],
    ["textarea", "input text-xs"],
    ["textarea", "input text-sm"],
    ["textarea", "input resize-y text-sm"],
    ["textarea", "text-xs"],
    ["select", "input text-xs"],
    ["select", "input text-sm"],
    ["select", "text-xs"],
    // The typed inputs that also zoom, with no class at all.
    ["input:email", ""],
    ["input:password", ""],
    ["input:number", ""],
    ["input:tel", ""],
    ["input:url", ""],
    ["input:search", ""],
    ["input:date", ""],
    ["input:time", ""],
    ["input:datetime-local", ""],
  ];

  const probed = await probePage.evaluate((combos) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const out = [];
    for (const [spec, cls] of combos) {
      const [tag, type] = spec.split(":");
      const el = document.createElement(tag);
      if (type) el.setAttribute("type", type);
      if (cls) el.setAttribute("class", cls);
      host.appendChild(el);
      out.push({ spec, cls, fontSize: parseFloat(getComputedStyle(el).fontSize) });
    }
    host.remove();
    return out;
  }, COMBOS);

  const badProbes = probed.filter((p) => p.fontSize < MIN_MOBILE_FONT_PX);
  for (const p of probed) {
    console.log(`  ${p.fontSize}px  <${p.spec}> ${p.cls || "(no class)"}`);
  }
  check(
    "every class combination used on a control in src/ computes >= 16px at 375px",
    badProbes.length === 0,
    badProbes.map((p) => `<${p.spec}> "${p.cls}" -> ${p.fontSize}px`).join("; ")
  );
  await probePage.close();

  // ====================================================================
  // C. Desktop is untouched.
  // ====================================================================
  // The fix must be a MOBILE floor, not a global font bump: raising every
  // field to 16px on a 1280px screen would redesign every form on the
  // desktop the product is mostly used on. `.input` stays 14px there.
  console.log("\n== C. desktop keeps its own size ==");
  const deskCtx = await harness.signedIn(browser, DESKTOP);
  const deskPage = await deskCtx.newPage();
  await deskPage.goto(`${harness.origin}/dashboard/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await deskPage.waitForTimeout(600);
  const deskSize = await deskPage.evaluate(() => {
    const el = document.createElement("input");
    el.className = "input";
    document.body.appendChild(el);
    const px = parseFloat(getComputedStyle(el).fontSize);
    el.remove();
    return px;
  });
  console.log(`  .input at 1280px: ${deskSize}px`);
  check("`.input` is still 14px on desktop (the floor is mobile-only)", deskSize === 14,
    `was ${deskSize}px`);
  await deskCtx.close();

  // ====================================================================
  // D. Zooming is still allowed. Explicitly.
  // ====================================================================
  console.log("\n== D. pinch-zoom is not taken away ==");
  const metaPage = await anon.newPage();
  await metaPage.goto(`${harness.origin}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const meta = await metaPage.evaluate(
    () => document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? ""
  );
  console.log(`  viewport: ${meta}`);
  check("the viewport meta does not cap the scale", !/maximum-scale/i.test(meta), meta);
  check("the viewport meta does not forbid user scaling",
    !/user-scalable\s*=\s*(no|0)/i.test(meta), meta);
  await metaPage.close();

  await anon.close();
  await signed.close();
} finally {
  await browser.close();
  harness.cleanup();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (offenders.length) {
  console.log(`\n${offenders.length} control(s) under ${MIN_MOBILE_FONT_PX}px:`);
  const byRoute = {};
  for (const o of offenders) (byRoute[o.route] ??= []).push(o);
  for (const [route, list] of Object.entries(byRoute)) {
    console.log(`  ${route}`);
    for (const o of list) {
      console.log(`    <${o.tag}${o.type ? ` type=${o.type}` : ""}> ${o.fontSize}px  ${o.name || ""}  [${o.cls}]`);
    }
  }
}
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
