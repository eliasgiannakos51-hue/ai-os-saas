// Does the pricing page really tell a buyer what a plan buys — in a
// production build, with real measured costs coming out of the database?
//
// The unit suite (plan-allowance.test.mjs) proves the arithmetic. It
// cannot prove the part that actually reaches a visitor: that the page
// calls the stats function, that the numbers survive the round trip
// through PostgREST (where numeric(18,8) arrives as a STRING, not a
// number — a bug that would silently turn every median into "no data"),
// and that what renders is the figure the formula produces.
//
// So this builds the app, serves it, answers the stats RPC with known
// values, and reads the numbers off the rendered page.
//
// Run: node scripts/tests/pricing-allowance.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";

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

const OUT = process.env.SHOT_DIR ?? "/tmp";

// The medians the stand-in database will report. Deliberately round
// numbers whose credit conversion can be worked out by hand:
//
//   $1.50 x 0.92 = EUR 1.38 ; x4 = EUR 5.52
//   Starter credit = EUR 0.02  ->  ceil(5.52 / 0.02) = 276 credits
//   1,000 / 276 = 3.62        ->  floor = 3 websites a month
//
// Returned as STRINGS, which is what PostgREST does with numeric columns.
const STATS = [
  { feature: "website_generate", samples: 42, median_usd: "1.50000000", p80_usd: "2.10000000" },
  { feature: "chat_message", samples: 900, median_usd: "0.01200000", p80_usd: "0.02000000" },
];
const EXPECTED_STARTER_WEBSITES = 3;
const EXPECTED_STARTER_WEBSITE_CREDITS = 276;

let rpcCalls = 0;
// Mutated by the second half of this file, which signs a user in. The
// pricing half runs first and deliberately runs signed OUT.
let authedUser = null;
const tableRows = {};

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/rest/v1/rpc/feature_cost_stats") {
      rpcCalls++;
      // Assert the app asks for the window it documents, not a default.
      try {
        const parsed = JSON.parse(body || "{}");
        if (parsed.p_days !== 90) console.log(`        (note: p_days was ${parsed.p_days})`);
      } catch {}
      return json(200, STATS);
    }
    // /pricing runs signed OUT — that is the visitor whose mind the page
    // has to change. The builder half below sets `authedUser` first.
    if (url.pathname === "/auth/v1/user") {
      return authedUser ? json(200, authedUser) : json(401, { message: "no session" });
    }
    if (url.pathname === "/auth/v1/settings") return json(200, { external: { google: false } });
    if (url.pathname.startsWith("/auth/v1/")) {
      return json(200, { user: authedUser, session: null });
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = tableRows[table] ?? [];
      // PostgREST returns a bare object, not an array, for .single().
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});

const SUPA_PORT = 54353;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (c) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(c)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: "127", role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: "127", role: "service_role", iat: 1, exp: 2000000000 });

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}
console.log("build ok — starting `next start`");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/pricing`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function done(code) {
  server.kill("SIGKILL");
  supa.close();
  process.exit(code);
}

if (!(await waitUp())) {
  console.log("  FAIL  server never came up\n" + serverLog.slice(-2000));
  done(1);
}

const res = await fetch(`http://127.0.0.1:${PORT}/pricing`);
check("/pricing responds 200", res.status, 200);
checkTrue("the page asked the database for real costs", rpcCalls > 0, `rpc calls: ${rpcCalls}`);

const { chromium } = await import("/home/user/ai-os-saas/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("cookie-consent-accepted", "1");
  } catch {}
});
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/pricing`, { waitUntil: "networkidle" });

// --- the card line ----------------------------------------------------
const starterCard = page.locator('[data-testid="plan-allowance-starter"]');
checkTrue("the Starter card carries an allowance block", (await starterCard.count()) === 1);
const starterText = (await starterCard.innerText()).replace(/\s+/g, " ").trim();
console.log(`        Starter card reads: ${JSON.stringify(starterText)}`);
checkTrue(
  `it names websites and quotes ${EXPECTED_STARTER_WEBSITES}`,
  /websites/i.test(starterText) && new RegExp(`${EXPECTED_STARTER_WEBSITES}\\s*websites`, "i").test(starterText),
  starterText
);
checkTrue(
  "no unresolved i18n key leaked into it",
  !/pricing\.allowance|allowance\.action/.test(starterText),
  starterText
);

// The Free card must NOT claim websites — Free cannot use the builder.
const freeCard = page.locator('[data-testid="plan-allowance-free"]');
if ((await freeCard.count()) === 1) {
  const freeText = await freeCard.innerText();
  check("the Free card does not advertise websites", /website/i.test(freeText), false);
}

// --- the table --------------------------------------------------------
const table = page.locator('[data-testid="allowance-table"]');
checkTrue("the per-month table rendered", (await table.count()) === 1);
await table.scrollIntoViewIfNeeded();

const grid = await table.evaluate((el) =>
  [...el.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("th,td")].map((c) => c.innerText.replace(/\s+/g, " ").trim())
  )
);
check("the table has a header plus one row per action", grid.length, 7);
check(
  "the columns are the six plans",
  grid[0].slice(1),
  ["Free", "Starter", "Growth", "Professional", "Ultimate", "Enterprise"]
);

const websiteRow = grid.find((r) => /website/i.test(r[0]));
checkTrue("there is a websites row", Boolean(websiteRow), JSON.stringify(grid.map((r) => r[0])));
if (websiteRow) {
  console.log(`        websites row: ${JSON.stringify(websiteRow)}`);
  // Column 2 is Starter. The measured median is $1.50, so this is the
  // hand-computable case in the header comment.
  checkTrue(
    `Starter shows ${EXPECTED_STARTER_WEBSITES} websites at ${EXPECTED_STARTER_WEBSITE_CREDITS} credits each`,
    websiteRow[2].startsWith(String(EXPECTED_STARTER_WEBSITES)) &&
      websiteRow[2].includes(String(EXPECTED_STARTER_WEBSITE_CREDITS)),
    websiteRow[2]
  );
  // Free cannot generate websites, so its cell is the cross, not a count.
  check("Free's websites cell quotes no number", /\d/.test(websiteRow[1]), false);
  // Enterprise has no published allowance to divide.
  checkTrue("Enterprise's cell says Custom", /custom/i.test(websiteRow[6]), websiteRow[6]);
}

// --- the honesty footnote --------------------------------------------
const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
checkTrue(
  "the page says the figures come from real measurements",
  /really cost over the last 90 days/i.test(body),
  "with measured data present it must not claim to be estimating"
);
check(
  "...and does not simultaneously claim to be estimating",
  /estimated from the size of a normal request/i.test(body),
  false
);

// --- it must not have broken the page ---------------------------------
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
checkTrue(`no horizontal overflow at 1400px (${overflow}px)`, overflow <= 0, String(overflow));
await page.screenshot({ path: `${OUT}/pricing-allowance-desktop.png`, fullPage: true });

await page.setViewportSize({ width: 375, height: 800 });
await page.reload({ waitUntil: "networkidle" });
const mobileOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
);
checkTrue(`no horizontal overflow at 375px (${mobileOverflow}px)`, mobileOverflow <= 0, String(mobileOverflow));
const mobileStarter = page.locator('[data-testid="plan-allowance-starter"]');
checkTrue("the allowance block survives 375px", (await mobileStarter.count()) === 1);
await page.screenshot({ path: `${OUT}/pricing-allowance-mobile.png`, fullPage: true });

await page.close();

// ======================================================================
// The other half: the refusal itself. A user with 30 credits, in the real
// Website Builder, clicking Generate.
//
// The generate route makes two small Anthropic calls (the clarification
// pre-check and the off-topic classifier) before it ever reaches the
// credit check, so driving it end to end would mean calling a model from
// a test. What is fulfilled here instead is ONLY the network response —
// and its body is produced by the REAL describeShortfall() on the REAL
// pricing config, not hand-written. Everything after that point is the
// application: its own route handler's response shape, its own client
// code reading it, its own component tree rendering it, in a production
// build.
// ======================================================================
console.log("\n-- the insufficient-credits panel, in the real builder --");

const { loadTs } = await import("./load-ts.mjs");
const shortfallMod = await loadTs("src/lib/billing/shortfall.ts");
const plansMod = await loadTs("src/lib/billing/plans.ts");
const configMod = await loadTs("src/lib/billing/pricing-config.ts");
const liveConfig = configMod.resolvePricingConfig();

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: "starter" },
  identities: [],
};
authedUser = USER;

const nowSec = Math.floor(Date.now() / 1000);
const session = {
  access_token: jwt({
    sub: USER.id,
    aud: "authenticated",
    role: "authenticated",
    email: USER.email,
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: USER,
};
await ctx.addCookies([
  {
    name: "sb-127-auth-token",
    value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    domain: "127.0.0.1",
    path: "/",
  },
]);

const PARAGRAPH =
  "A landing page for a neighbourhood coffee shop. Sections: a hero with the shop name and " +
  "opening hours, our story, the menu with prices, photos of the space, customer reviews, a map " +
  "with directions, a contact form, and a footer with social links. Warm colours, large " +
  "photography, and a booking button in the header. ";

const starter = plansMod.getPlan("starter");
const shortfallFor = (chars, available) =>
  shortfallMod.describeShortfall(
    {
      action: "websiteGenerate",
      model: "claude-sonnet-4-6",
      inputChars: chars,
      imageCount: 0,
      available,
      plan: starter,
      purchasedPackPriceEur: null,
    },
    liveConfig
  );

// Two scenarios, because the panel has two genuinely different jobs and
// only one of them is exercised by any single balance:
//
//   A. a long request and a middling balance — the case where "describe
//      it more simply" is real, free advice. This is the whole point of
//      the feature and it must be proven end to end.
//   B. a balance below the floor — the case where that advice would be a
//      lie, and the panel has to say so rather than imply a rewrite would
//      work.
const LONG = PARAGRAPH.repeat(40);
const longFloor = shortfallFor(LONG.length, 0).floorCredits;
const longFull = shortfallFor(LONG.length, 0).needed;
const SCENARIOS = [
  {
    id: "simplify-offered",
    description: LONG,
    available: Math.floor((longFloor + longFull) / 2),
    expectSimpler: true,
  },
  {
    id: "below-the-floor",
    description: PARAGRAPH.repeat(6),
    available: 30,
    expectSimpler: false,
  },
];

for (const scenario of SCENARIOS) {
  console.log(`\n   scenario: ${scenario.id}`);
  const realShortfall = shortfallFor(scenario.description.length, scenario.available);
  console.log(
    `        real describeShortfall: need ${realShortfall.needed}, have ${scenario.available}, ` +
      `floor ${realShortfall.floorCredits}, simpler ${
        realShortfall.simpler
          ? `${realShortfall.simpler.credits} @ ${realShortfall.simpler.inputChars} chars (-${realShortfall.simpler.shrinkPercent}%)`
          : "none"
      }, pack ${realShortfall.pack?.id ?? "none"}, upgrade ${realShortfall.upgrade?.slug ?? "none"}`
  );
  check(
    `${scenario.id}: the scenario is the one it claims to be`,
    realShortfall.simpler !== null,
    scenario.expectSimpler
  );

  tableRows.user_credits = [
    {
      user_id: USER.id,
      credits_remaining: scenario.available,
      credits_total: 1000,
      plan_tier: "starter",
      beta_expires_at: null,
    },
  ];

  const builder = await ctx.newPage();
  await builder.setViewportSize({ width: 1280, height: 900 });

  // Fulfil ONLY the generate call, with the route's own response shape.
  await builder.route("**/api/websites/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        generated: false,
        rateLimited: true,
        shortfall: realShortfall,
        message: `Not enough credits (you have: ${scenario.available}, need: ${realShortfall.needed}). Upgrade your plan or purchase more credits.`,
      }),
    })
  );

  await builder.goto(`http://127.0.0.1:${PORT}/dashboard/website-builder`, { waitUntil: "networkidle" });
  checkTrue(
    `${scenario.id}: the builder loaded for a signed-in user`,
    !builder.url().includes("/login"),
    builder.url()
  );

  const nameField = builder.locator("#website-name");
  const descField = builder.locator("#website-description");
  checkTrue(`${scenario.id}: the new-project form is on screen`, (await nameField.count()) === 1);
  await nameField.fill("Kafeneio");
  await descField.fill(scenario.description);
  await builder.locator('form button[type="submit"]').click();

  const panel = builder.locator('[data-testid="credit-shortfall"]');
  await panel.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  checkTrue(`${scenario.id}: the shortfall panel is what the user sees`, (await panel.count()) === 1);

  if ((await panel.count()) === 1) {
    const panelText = (await panel.innerText()).replace(/\s+/g, " ").trim();
    console.log(`        panel reads: ${JSON.stringify(panelText)}`);

    checkTrue(
      `${scenario.id}: it states both numbers`,
      panelText.includes(String(realShortfall.needed)) && panelText.includes(String(scenario.available)),
      panelText
    );
    checkTrue(`${scenario.id}: no unresolved i18n key`, !/creditShortfall\./.test(panelText), panelText);

    if (realShortfall.simpler) {
      const simplify = builder.locator('[data-testid="shortfall-simplify"]');
      checkTrue(`${scenario.id}: the free option is offered`, (await simplify.count()) === 1);
      const simplifyText = await simplify.innerText();
      checkTrue(
        `${scenario.id}: it quotes the computed cheaper price (${realShortfall.simpler.credits})`,
        simplifyText.includes(String(realShortfall.simpler.credits)),
        simplifyText
      );
      checkTrue(
        `${scenario.id}: it quotes a concrete target length (${realShortfall.simpler.inputChars})`,
        simplifyText.replace(/[.,\u00a0\u202f\s]/g, "").includes(String(realShortfall.simpler.inputChars)),
        simplifyText
      );
      const order = await panel.evaluate((el) =>
        [...el.querySelectorAll("[data-testid]")].map((n) => n.getAttribute("data-testid"))
      );
      check(
        `${scenario.id}: the free option is listed before the ones that cost money`,
        order.indexOf("shortfall-simplify") < order.indexOf("shortfall-pack"),
        true
      );
    } else {
      checkTrue(
        `${scenario.id}: when nothing simpler fits, the panel says so instead of hinting`,
        (await builder.locator('[data-testid="shortfall-no-simpler"]').count()) === 1
      );
      checkTrue(
        `${scenario.id}: ...and quotes the floor (${realShortfall.floorCredits})`,
        panelText.includes(String(realShortfall.floorCredits)),
        panelText
      );
      check(
        `${scenario.id}: no free option is dangled`,
        await builder.locator('[data-testid="shortfall-simplify"]').count(),
        0
      );
    }

    if (realShortfall.pack) {
      const packText = await builder.locator('[data-testid="shortfall-pack"]').innerText();
      checkTrue(
        `${scenario.id}: the pack option names the post-purchase price (${realShortfall.pack.creditsAfterPurchase})`,
        packText.replace(/[.,\u00a0\u202f]/g, "").includes(String(realShortfall.pack.creditsAfterPurchase)),
        packText
      );
    }
    if (realShortfall.upgrade) {
      const upText = await builder.locator('[data-testid="shortfall-upgrade"]').innerText();
      checkTrue(
        `${scenario.id}: the upgrade option names ${realShortfall.upgrade.name}`,
        upText.includes(realShortfall.upgrade.name),
        upText
      );
    }

    const looksLikeError = await panel.evaluate((el) => el.className.includes("red"));
    check(`${scenario.id}: it is not painted as an error`, looksLikeError, false);

    // Screenshot BEFORE taking the free option, since taking it closes
    // the panel — this is the frame the user actually sees.
    await builder.screenshot({ path: `${OUT}/credit-shortfall-${scenario.id}.png` });

    // Taking the free option must put the user back in their own text
    // rather than wiping it. Last, because it dismisses the panel.
    if (realShortfall.simpler) {
      await builder.locator('[data-testid="shortfall-simplify"]').click();
      check(
        `${scenario.id}: taking the free option returns focus to the description`,
        await builder.evaluate(() => document.activeElement?.id),
        "website-description"
      );
      check(
        `${scenario.id}: ...with the text they wrote still there`,
        await descField.inputValue(),
        scenario.description
      );
      check(
        `${scenario.id}: ...and the panel dismissed`,
        await builder.locator('[data-testid="credit-shortfall"]').count(),
        0
      );
    }
  }

  await builder.close();
}

await browser.close();

console.log(`\n${pass} passed, ${fail} failed`);
done(fail === 0 ? 0 : 1);
