// The Monthly / Annual toggle, in a real production build, in a real
// browser, on the page a buyer actually reads.
//
// scripts/tests/annual-billing.test.mjs proves the arithmetic and the
// wiring. It cannot prove the three things a customer experiences:
//
//   1. that the toggle is on /pricing and pressing it changes the prices;
//   2. that the annual view states the REAL amount charged next to the
//      per-month headline, rather than implying the headline is what
//      gets billed — the difference between a discount and a misleading
//      price. The figures are read from lib/billing/plans.ts, not named
//      here: this header used to say €192/year and €16/month, which was
//      the old 20%-off model, and naming them in prose is how they went
//      on being believed after the code stopped agreeing;
//   3. that with no annual price ids configured the toggle is absent
//      entirely, instead of offering a checkout that 500s.
//
// (3) is asserted by booting the SAME production build twice, once with
// the annual env vars and once without.
//
// Run: node scripts/tests/annual-billing.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

// THE NUMBERS, READ FROM THE MODULE THE PAGE READS THEM FROM.
//
// Every figure in this suite was typed in against a 20%-off model:
// €192/year for a €20 plan, saving €48, "Save 20%". The product moved to
// TWO MONTHS FREE — ten months charged, so €200/year, saving €40, a 17%
// discount — and this file was never updated. It waited ten seconds for
// the text "Billed €192" to appear and then failed.
//
// €192 is not merely stale. lib/billing/plans.ts names it as the bug it
// was written to fix: "NOT price * 12 * (1 - percent/100), which rounds a
// percentage back into euros and lands on €192 for a €20 plan — a number
// no customer can derive from 'two months free'." The test was holding
// the product to the defect, and went red on the correction.
//
// Derived here so that cannot recur. formatNumber is the page's own
// formatter (Intl.NumberFormat with grouping), which is why €2,000 has
// its comma and €200 does not — a detail no hand-written list gets right
// for long.
const plans = await loadTs("src/lib/billing/plans.ts");
const fmt = await loadTs("src/lib/format-number.ts");
const money = (n) => `€${fmt.formatNumber(n, "en")}`;
const DISCOUNT = plans.ANNUAL_DISCOUNT_PERCENT;
const ANNUAL_EXPECTATIONS = plans.PLANS.filter((p) => plans.annualPriceEur(p) !== null).map((p) => ({
  name: p.name,
  // The headline is a division and the page does not round it, so this
  // asks for the same string the page builds rather than a rounded guess.
  perMonth: money(plans.annualMonthlyEquivalentEur(p)),
  total: money(plans.annualPriceEur(p)),
  saving: money(plans.annualSavingsEur(p)),
}));
const STARTER = ANNUAL_EXPECTATIONS.find((p) => /starter/i.test(p.name)) ?? ANNUAL_EXPECTATIONS[0];
const starterPlan = plans.PLANS.find((p) => p.name === STARTER.name);
// AN EMPTY LIST WOULD MAKE THE LOOP BELOW ASSERT NOTHING.
if (ANNUAL_EXPECTATIONS.length < 3) {
  console.log(`  FAIL  derived only ${ANNUAL_EXPECTATIONS.length} annual plan(s) from plans.ts`);
  process.exit(1);
}
console.log(`derived from plans.ts: ${DISCOUNT}% — ` +
  ANNUAL_EXPECTATIONS.map((p) => `${p.name} ${p.perMonth}/mo ${p.total}/yr saves ${p.saving}`).join(", "));

let pass = 0,
  fail = 0;
function checkTrue(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

// /pricing renders for a signed-out visitor, which is the case that
// matters: it is the page a stranger lands on. Supabase is still reached
// for auth.getUser(), so it is stubbed to answer "nobody".
const supa = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  res.writeHead(url.pathname === "/auth/v1/user" ? 401 : 200, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(url.pathname === "/auth/v1/user" ? { message: "no session" } : {}));
});
const SUPA_PORT = 54339;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: "127", role: "anon", iat: 1, exp: 2000000000 });

async function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const ANNUAL_ENV = {
  STRIPE_PRICE_STARTER: "price_starter_m",
  STRIPE_PRICE_GROWTH: "price_growth_m",
  STRIPE_PRICE_PROFESSIONAL: "price_pro_m",
  STRIPE_PRICE_ULTIMATE: "price_ult_m",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_y",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_y",
  STRIPE_PRICE_PROFESSIONAL_ANNUAL: "price_pro_y",
  STRIPE_PRICE_ULTIMATE_ANNUAL: "price_ult_y",
};

/** Builds and starts the app with `extraEnv`, returns {port, stop}. */
async function boot(label, extraEnv) {
  const port = await freePort();
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
    ...extraEnv,
  };
  console.log(`\nbuilding + starting (${label}) ...`);
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  build.stdout.on("data", (d) => (log += d));
  build.stderr.on("data", (d) => (log += d));
  if ((await new Promise((r) => build.on("close", r))) !== 0) {
    console.log(`  FAIL  next build failed (${label})\n` + log.slice(-2500));
    process.exit(1);
  }
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return { port, stop: () => { try { process.kill(-server.pid, "SIGKILL"); } catch { try { server.kill("SIGKILL"); } catch { /* gone */ } } } };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`  FAIL  server did not start (${label})\n` + serverLog.slice(-2000));
  // The GROUP: killing the npx handle orphans next-server. See
  // scripts/tests/prodtest-hygiene.test.mjs.
  try { process.kill(-server.pid, "SIGKILL"); } catch { try { server.kill("SIGKILL"); } catch { /* gone */ } }
  process.exit(1);
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

try {
  // -------------------------------------------------------------------
  // WITH annual prices configured.
  // -------------------------------------------------------------------
  const withAnnual = await boot("annual prices configured", ANNUAL_ENV);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });

  console.log("\n== 1. the toggle is on the page a buyer reads ==");
  await page.goto(`http://127.0.0.1:${withAnnual.port}/pricing`, { waitUntil: "networkidle" });
  const monthlyBtn = page.getByRole("button", { name: /^Monthly$/ });
  const annualBtn = page.getByRole("button", { name: /^Annual$/ });
  checkTrue("a Monthly button exists", (await monthlyBtn.count()) === 1);
  checkTrue("an Annual button exists", (await annualBtn.count()) === 1);
  checkTrue("Monthly is selected by default", (await monthlyBtn.getAttribute("aria-pressed")) === "true");
  const initial = await page.locator("body").innerText();
  checkTrue(
    `the saving is stated next to the control (${DISCOUNT}% / two months free)`,
    new RegExp(`Save ${DISCOUNT}% — two months free`).test(initial),
    initial.slice(0, 240)
  );
  checkTrue("Starter shows €20 while monthly", /€20/.test(initial));
  checkTrue(
    "…and no annual total is shown yet",
    !new RegExp(`Billed ${STARTER.total}`).test(initial),
    "the monthly view must not advertise an annual charge"
  );

  console.log("\n== 2. pressing Annual changes the prices ==");
  await annualBtn.click();
  await page.waitForURL(/billing=annual/, { timeout: 10000 });
  await page.getByText(new RegExp(`Billed ${STARTER.total}`)).waitFor({ state: "visible", timeout: 10000 });
  const annualView = await page.locator("body").innerText();
  checkTrue("Annual is now selected", (await annualBtn.getAttribute("aria-pressed")) === "true");
  checkTrue(`Starter's headline is ${STARTER.perMonth} per month`, annualView.includes(STARTER.perMonth));
  checkTrue(
    `…and the REAL amount charged is stated: ${STARTER.total} once a year`,
    annualView.includes(`Billed ${STARTER.total} once a year`),
    "a discounted headline with no annual total is a misleading price, not a discount"
  );
  checkTrue(`…with the saving in euros (${STARTER.saving})`, annualView.includes(`you save ${STARTER.saving}`));
  // Every paid plan, not just the one from the brief.
  for (const { name: plan, perMonth, total, saving } of ANNUAL_EXPECTATIONS) {
    checkTrue(
      `${plan}: ${perMonth}/month, ${total}/year, saves ${saving}`,
      annualView.includes(perMonth) &&
        annualView.includes(`Billed ${total} once a year`) &&
        annualView.includes(`you save ${saving}`),
      annualView.slice(0, 200)
    );
  }
  checkTrue(
    "Free is not given an annual price",
    !/€0[\s\S]{0,80}Billed/.test(annualView)
  );

  console.log("\n== 3. the annual view is a shareable, indexable URL ==");
  const directCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const direct = await directCtx.newPage();
  await direct.goto(`http://127.0.0.1:${withAnnual.port}/pricing?billing=annual`, {
    waitUntil: "networkidle",
  });
  const directText = await direct.locator("body").innerText();
  checkTrue("opening ?billing=annual directly shows annual prices", directText.includes(`Billed ${STARTER.total} once a year`));
  checkTrue(
    "…server-rendered, not painted in by JavaScript",
    new RegExp(`Billed ${STARTER.total} once a year`).test(
      await (await fetch(`http://127.0.0.1:${withAnnual.port}/pricing?billing=annual`)).text()
    )
  );
  await directCtx.close();

  console.log("\n== 4. pressing Monthly goes back ==");
  await monthlyBtn.click();
  await page.waitForURL((u) => !u.search.includes("billing=annual"), { timeout: 10000 });
  const backText = await page.locator("body").innerText();
  checkTrue("the annual total is gone again", !backText.includes(`Billed ${STARTER.total}`));
  checkTrue("Monthly is selected", (await monthlyBtn.getAttribute("aria-pressed")) === "true");

  console.log("\n== 5. Greek, and 375px ==");
  const elCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: {
      cookies: [{ name: "NEXT_LOCALE", value: "el", domain: "127.0.0.1", path: "/" }],
      origins: [],
    },
  });
  const elPage = await elCtx.newPage();
  await elPage.goto(`http://127.0.0.1:${withAnnual.port}/pricing?billing=annual`, {
    waitUntil: "networkidle",
  });
  const elText = await elPage.locator("body").innerText();
  checkTrue("the toggle is in Greek", /Μηνιαία/.test(elText) && /Ετήσια/.test(elText));
  // THE GREEK STRINGS, BUILT FROM messages/el.json AND THE SAME NUMBERS.
  //
  // These were "Εξοικονόμηση 20%" and "Χρέωση €192 μία φορά τον χρόνο" —
  // the same two stale figures as the English section, in a second
  // language, where they are harder to notice. A translation typed into a
  // test is a second copy of a sentence that already exists once, and it
  // drifts the moment the first one is edited. The numbers are formatted
  // in the EL locale, which is not the same string as the English one for
  // anything four digits and up (€2.000, not €2,000).
  const elMoney = (n) => `€${fmt.formatNumber(n, "el")}`;
  const elStarterTotal = elMoney(plans.annualPriceEur(starterPlan));
  const elSaving = elMoney(plans.annualSavingsEur(starterPlan));
  const elTemplates = JSON.parse(readFileSync("messages/el.json", "utf8")).pricing;
  const expectedElSaving = elTemplates.billingAnnualSaving.replace("{percent}", String(DISCOUNT));
  const expectedElBilled = elTemplates.billedAnnually
    .replace("{total}", elStarterTotal)
    .replace("{saving}", elSaving);
  checkTrue(`the saving line is in Greek ("${expectedElSaving}")`, elText.includes(expectedElSaving), elText.slice(0, 200));
  checkTrue(`the annual total is in Greek ("${expectedElBilled}")`, elText.includes(expectedElBilled), elText.slice(0, 300));
  checkTrue("no raw i18n key leaked", !/pricing\.billing/.test(elText));
  const overflow = await elPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  checkTrue(`no horizontal overflow at 375px (${overflow}px)`, overflow <= 1, `${overflow}px`);
  await elCtx.close();

  checkTrue("no client errors on any of the above", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
  withAnnual.stop();

  // -------------------------------------------------------------------
  // WITHOUT annual prices configured — the deployment that has not done
  // the Stripe setup yet.
  // -------------------------------------------------------------------
  console.log("\n== 6. with no annual price ids, annual is not offered at all ==");
  const noAnnual = await boot("annual prices MISSING", {
    STRIPE_PRICE_STARTER: "price_starter_m",
    STRIPE_PRICE_GROWTH: "price_growth_m",
    STRIPE_PRICE_PROFESSIONAL: "price_pro_m",
    STRIPE_PRICE_ULTIMATE: "price_ult_m",
    STRIPE_PRICE_STARTER_ANNUAL: "",
    STRIPE_PRICE_GROWTH_ANNUAL: "",
    STRIPE_PRICE_PROFESSIONAL_ANNUAL: "",
    STRIPE_PRICE_ULTIMATE_ANNUAL: "",
  });
  const bareCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const bare = await bareCtx.newPage();
  await bare.goto(`http://127.0.0.1:${noAnnual.port}/pricing`, { waitUntil: "networkidle" });
  checkTrue(
    "there is no Annual button",
    (await bare.getByRole("button", { name: /^Annual$/ }).count()) === 0
  );
  const bareText = await bare.locator("body").innerText();
  checkTrue("no saving is advertised", !/two months free/.test(bareText));
  checkTrue("the monthly prices still render", /€20/.test(bareText) && /€200/.test(bareText));
  // And the URL cannot force it on.
  await bare.goto(`http://127.0.0.1:${noAnnual.port}/pricing?billing=annual`, {
    waitUntil: "networkidle",
  });
  const forcedText = await bare.locator("body").innerText();
  checkTrue(
    "?billing=annual cannot force an unconfigured annual view",
    !forcedText.includes(`Billed ${STARTER.total}`),
    "otherwise the buy button starts a checkout for a price id that does not exist"
  );
  await bareCtx.close();
  noAnnual.stop();
} catch (err) {
  fail++;
  console.log(`  FAIL  the flow threw: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await browser.close();
  supa.close();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
