// The publish dialog, in a real production build, in a real browser.
//
// WHAT WAS REPORTED. "You press Publish and a bit of text appears below.
// It is barely visible, squashed to the left as if hidden, and it is not
// clear you have to type something (a subdomain) for the site to go live."
//
// Every clause of that describes the LAYOUT rather than a defect in it:
// what appeared was an absolutely-positioned popover hanging off a small
// toolbar button, right-aligned, with 11px helper text — and at 375px it
// was pinned against whichever edge the button happened to sit near.
//
// Choosing an address is a required step with no default; the site cannot
// go live without it. So this asserts it now LOOKS like one, measured in
// pixels rather than argued: the dialog is centred, it is a real fraction
// of the viewport, the input is large enough to be the obvious target, the
// resulting URL updates as characters are typed, each validation failure
// says which one it is, and the disabled button explains itself.
//
// It also writes screenshots at 1280 and 375, which is the only way to
// answer "does it look hidden" honestly.
//
// Run: node scripts/tests/publish-dialog.prodtest.mjs [--out DIR]
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const outDir = path.resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "publish-dialog-shots"
);
mkdirSync(outDir, { recursive: true });

const USER_ID = "00000000-0000-4000-8000-000000000001";
const WEBSITE_ID = "44444444-4444-4444-8444-444444444444";

const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// A FINISHED website, because the publish control only appears for one.
const WEBSITE = {
  id: WEBSITE_ID,
  user_id: USER_ID,
  name: "Camping Chalkidiki",
  description: "A campsite in Chalkidiki with pitches, a beach and a taverna.",
  status: "completed",
  html_content:
    '<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>Camping</title></head>' +
    "<body><header><h1>Camping Chalkidiki</h1></header>" +
    '<section id="pitches"><h2>Θέσεις</h2></section></body></html>',
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
};

const TABLE_ROWS = {
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000 }],
  user_websites: [WEBSITE],
  // Nothing published yet — the state the report is about.
  published_sites: [],
  favorites: [],
};

// Flipped by the test to exercise the "address already taken" path, which
// is the one validation the client cannot know on its own.
let subdomainTaken = false;

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      let rows = TABLE_ROWS[table] ?? [];
      // subdomainTaken() looks for an existing published_sites row with
      // this subdomain. Answering one is what makes the server return
      // reason:"taken" through the real route rather than a stubbed error.
      if (table === "published_sites" && subdomainTaken && url.search.includes("subdomain=")) {
        rows = [{ id: "55555555-5555-4555-8555-555555555555", subdomain: "taken-name", website_id: "other" }];
      }
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});

const SUPA_PORT = 54339;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: user(),
};
const AUTH_COOKIE = {
  name: `sb-${PROJECT_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
};

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
  NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
const buildCode = await new Promise((r) => build.on("close", r));
if (buildCode !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function cleanup() {
  try {
    server.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  supa.close();
}
if (!(await waitForServer())) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}\n`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function openDialog(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/website-builder`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  // The finished site has to be selected before its toolbar exists.
  const card = page.locator(`text=${WEBSITE.name}`).first();
  if (await card.count()) await card.click().catch(() => {});
  await page.waitForTimeout(1200);
  return { context, page };
}

// aria-pressed alone was not enough: the builder's design controls use it
// too ("You choose", "Animated gradient"), so the first match was a
// background picker and the click did nothing. The toggle is identified by
// its accessible NAME, exactly — "Publish changes" must not match — and
// scrolled to, because the preview panel pushes the toolbar below the fold
// on a 900px-tall viewport.
async function publishToggle(page) {
  const btn = page.getByRole("button", { name: "Publish", exact: true }).first();
  await btn.scrollIntoViewIfNeeded();
  return btn;
}

const DIALOG = '[role="dialog"][aria-modal="true"]';
const INPUT = "#publish-subdomain";

try {
  // -------------------------------------------------------------------
  console.log("== 1. the dialog is a dialog, at desktop width ==");
  const { context: ctx, page } = await openDialog(1280, 900);

  const publishBtn = await publishToggle(page);
  check("the Publish toggle is on screen", (await publishBtn.count()) > 0 && (await publishBtn.isVisible()));
  await page.screenshot({ path: path.join(outDir, "after-1280-closed.png"), fullPage: false });

  await publishBtn.click();
  await page.waitForSelector(DIALOG, { timeout: 10000 });
  const dialog = page.locator(DIALOG);
  check("pressing Publish opens a modal dialog", await dialog.isVisible());
  check("it is announced as modal", (await dialog.getAttribute("aria-modal")) === "true");
  check("and it is labelled by its heading", Boolean(await dialog.getAttribute("aria-labelledby")));
  await page.screenshot({ path: path.join(outDir, "after-1280-open.png"), fullPage: false });

  // "Squashed to the left, as if hidden" is a claim about geometry, so it
  // is answered with geometry.
  const box = await dialog.boundingBox();
  const vw = 1280;
  check(`the dialog is a real size (${Math.round(box.width)}x${Math.round(box.height)}px)`, box.width >= 380 && box.height >= 300);
  const centreOffset = Math.abs(box.x + box.width / 2 - vw / 2);
  check(`it is centred, not pushed to an edge (${Math.round(centreOffset)}px off centre)`, centreOffset <= 24);
  check("there is a dimmed backdrop behind it", (await page.locator(".fixed.inset-0.bg-black\\/60").count()) > 0);

  console.log("\n== 2. it is obvious that something must be typed ==");
  const input = page.locator(INPUT);
  check("the address input is on screen", await input.isVisible());
  const ib = await input.boundingBox();
  // The old field was 12px text in a 22rem popover. A required field has
  // to be the largest thing in the dialog after the heading.
  check(`the input is a large target (${Math.round(ib.width)}x${Math.round(ib.height)}px)`, ib.width >= 300 && ib.height >= 36);
  check("it is focused as soon as the dialog opens", await input.evaluate((el) => el === document.activeElement));
  const heading = await page.locator("#publish-dialog-title").innerText();
  check(`the heading states the task ("${heading}")`, heading.trim().length > 0);
  const introVisible = await page.locator(`${DIALOG} p`).first().innerText();
  check(
    "and a sentence explains why an address is needed",
    /address/i.test(introVisible) || introVisible.length > 30,
    introVisible
  );

  console.log("\n== 3. the URL preview follows what is typed ==");
  await input.fill("");
  const emptyPreview = await page.locator(`${DIALOG} .font-mono`).innerText();
  await input.type("camping-chalkidiki", { delay: 5 });
  await page.waitForTimeout(150);
  const typedPreview = await page.locator(`${DIALOG} .font-mono`).innerText();
  check("the preview changes as characters are typed", typedPreview !== emptyPreview, `${emptyPreview} -> ${typedPreview}`);
  check(`the preview contains the typed address (${typedPreview})`, typedPreview.includes("camping-chalkidiki"));
  // The preview must be the address that will actually be created, which
  // is why the template comes from the server.
  check("and it is a real, full URL", /https?:\/\/[^\s]+/.test(typedPreview), typedPreview);

  console.log("\n== 4. every rejection says which one it is ==");
  const feedback = page.locator("#publish-address-feedback");
  const publishNow = page.locator(`${DIALOG} button.bg-orange-500`);
  const messages = {};
  for (const [label, value] of [
    ["valid", "camping-chalkidiki"],
    ["too short", "ab"],
    ["invalid characters", "camping site!"],
    ["bad edges", "-camping-"],
    ["reserved", "admin"],
    ["empty", ""],
  ]) {
    await input.fill(value);
    await page.waitForTimeout(120);
    messages[label] = (await feedback.innerText()).trim();
    const enabled = await publishNow.isEnabled();
    check(
      `${label}: button is ${label === "valid" ? "enabled" : "disabled"} — "${messages[label]}"`,
      label === "valid" ? enabled : !enabled
    );
  }
  const distinct = new Set(Object.entries(messages).filter(([k]) => k !== "valid").map(([, v]) => v));
  check(
    `the five failures give ${distinct.size} distinct messages, not one generic one`,
    distinct.size >= 4,
    JSON.stringify(messages, null, 2)
  );
  check("none of them is empty", Object.values(messages).every((m) => m.length > 0));

  console.log("\n== 5. a disabled button explains itself ==");
  await input.fill("ab");
  await page.waitForTimeout(120);
  check("the button is disabled", !(await publishNow.isEnabled()));
  const dialogText = await dialog.innerText();
  check(
    "and the dialog says what to do about it",
    /valid address/i.test(dialogText) || dialogText.includes(messages["too short"]),
    dialogText.slice(0, 400)
  );
  await page.screenshot({ path: path.join(outDir, "after-1280-invalid.png"), fullPage: false });

  await input.fill("camping-chalkidiki");
  await page.waitForTimeout(120);
  check("a valid address enables it again", await publishNow.isEnabled());

  console.log("\n== 6. Escape closes it ==");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("the dialog is gone", (await page.locator(DIALOG).count()) === 0);
  await ctx.close();

  // -------------------------------------------------------------------
  console.log("\n== 7. the same dialog at 375px ==");
  const { context: ctx2, page: mobile } = await openDialog(375, 812);
  await (await publishToggle(mobile)).click();
  await mobile.waitForSelector(DIALOG, { timeout: 10000 });
  await mobile.locator(INPUT).fill("camping-chalkidiki");
  await mobile.waitForTimeout(200);
  await mobile.screenshot({ path: path.join(outDir, "after-375-open.png"), fullPage: false });

  const mbox = await mobile.locator(DIALOG).boundingBox();
  check(`the dialog fills the phone width (${Math.round(mbox.width)}/375px)`, mbox.width >= 300);
  check("it starts at the left edge margin, not off-screen", mbox.x >= 0 && mbox.x <= 32);
  check("and it fits on screen vertically", mbox.y >= 0 && mbox.y + mbox.height <= 812 + 1);
  const overflow = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    `no horizontal overflow at 375px (${overflow.scrollWidth}/${overflow.clientWidth})`,
    overflow.scrollWidth <= overflow.clientWidth + 1
  );
  const mInput = await mobile.locator(INPUT).boundingBox();
  check(`the input is still a full-width target (${Math.round(mInput.width)}px)`, mInput.width >= 260);
  check("the preview is visible on a phone too", await mobile.locator(`${DIALOG} .font-mono`).isVisible());
  await ctx2.close();

  // -------------------------------------------------------------------
  console.log("\n== 8. an address the server rejects as taken ==");
  // The only validation the browser cannot do for itself. It must land on
  // the field, not in a toast that slides away while the user is looking
  // at the input, and it must re-disable the button.
  subdomainTaken = true;
  const { context: ctx3, page: p3 } = await openDialog(1280, 900);
  await (await publishToggle(p3)).click();
  await p3.waitForSelector(DIALOG, { timeout: 10000 });
  await p3.locator(INPUT).fill("taken-name");
  await p3.waitForTimeout(150);
  await p3.locator(`${DIALOG} button.bg-orange-500`).click();
  await p3.waitForTimeout(1500);
  const takenText = (await p3.locator("#publish-address-feedback").innerText()).trim();
  check(`the field says the address is taken ("${takenText}")`, /taken|πιασμ/i.test(takenText), takenText);
  check("and the button is disabled again", !(await p3.locator(`${DIALOG} button.bg-orange-500`).isEnabled()));
  await p3.screenshot({ path: path.join(outDir, "after-1280-taken.png"), fullPage: false });
  // Editing the value must clear it, or the user is stuck.
  await p3.locator(INPUT).fill("taken-name-2");
  await p3.waitForTimeout(150);
  check("changing the address clears the rejection", await p3.locator(`${DIALOG} button.bg-orange-500`).isEnabled());
  await ctx3.close();
} catch (err) {
  failures.push("unhandled error");
  console.log(`  FAIL  unhandled error\n        ${err.stack ?? err.message}`);
} finally {
  await browser.close();
  cleanup();
}

console.log(`\nscreenshots written to ${outDir}`);
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
