#!/usr/bin/env node
/*
 * THE SIGNED-IN SCREENS, PHOTOGRAPHED.
 *
 * Run: SHOTS=/tmp/shots node scripts/ui-shots.mjs
 *      SHOTS=/tmp/shots SKIP_BUILD=1 node scripts/ui-shots.mjs
 *
 * scripts/prod-shots.mjs photographs what a stranger sees. This one
 * photographs what a CUSTOMER sees — the overview, the chat, the
 * sidebar with every group, the Make screens — which is everything the
 * other one cannot reach, because all of it is behind sign-in.
 *
 * IT BUILDS AND SERVES THE APP ITSELF, with lib/mock-supabase.mjs
 * standing in for the project and a forged session cookie. That is a
 * deliberate trade and the report must carry it: the CODE is the real
 * compiled build, and the DATA is not anybody's. A screenshot from here
 * shows the interface honestly and shows an empty account.
 *
 * WHY NOT THE DEPLOYED SITE. Two reasons, both measured and neither
 * worked around: BOT_EMAIL and BOT_PASSWORD are not in this
 * environment, so nothing can sign in; and outbound HTTPS is
 * re-terminated by a proxy whose CA Chromium will not read, so every
 * page fails with ERR_CERT_AUTHORITY_INVALID (curl, which reads the
 * same CA, is fine). The remaining lever is ignoreHTTPSErrors, which
 * turns verification off and is never the fix.
 *
 * THE PLAN IS ULTIMATE, deliberately. On Free the Make screens render
 * an upgrade wall instead of a workspace, and a run without it would
 * photograph the wall and label it the feature — which is exactly what
 * routes-smoke did, unnoticed, for sixteen days.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { startMockSupabase, MOCK_USER } from "./lib/mock-supabase.mjs";
import { loadTs } from "./tests/load-ts.mjs";

const OUT = process.env.SHOTS;
if (!OUT) {
  console.log("SHOTS=<directory> is required — that is where the PNGs go.");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

MOCK_USER.user_metadata = { subscription_tier: "ultimate" };

// THE BALANCE IS THE PLAN'S OWN NUMBER, read from lib/billing/plans.ts.
// The stand-in's default row is 500 of 500, which is right for nothing:
// the 2026-10-02 shots put "500" in the header of an Ultimate account
// whose pricing card says 25,000, beside chat's "430 free messages",
// and the owner read the three as one number disagreeing with itself.
// A fresh month on Ultimate, nothing spent, is what an empty account
// actually shows — and the header is checked against it below.
const { PLANS } = await loadTs("src/lib/billing/plans.ts");
const ULTIMATE_CREDITS = PLANS.find((p) => p.slug === "ultimate")?.monthlyCredits;
if (typeof ULTIMATE_CREDITS !== "number") {
  console.log("lib/billing/plans.ts has no numeric Ultimate allowance — nothing to show a balance against.");
  process.exit(1);
}

const PORT = 34571;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const supa = await startMockSupabase({
  port: 54351,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: ULTIMATE_CREDITS, credits_total: ULTIMATE_CREDITS }],
  },
});

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
};

// The six the owner asked for, plus the two that carry the rest of the
// Make story. Named with the screen, not the route, because the file
// names are what a reader scrolls past.
const SCREENS = [
  ["overview", "/dashboard/overview"],
  ["chat", "/dashboard/chat"],
  ["website-builder", "/dashboard/website-builder"],
  ["presentations", "/dashboard/presentations"],
  ["posts", "/dashboard/posts"],
  ["coding", "/dashboard/coding"],
  ["pricing", "/pricing"],
];
const DEVICES = [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
];

let server = null;
let browser = null;
const stop = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

try {
  if (!process.env.SKIP_BUILD) {
    console.log("next build (production) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("build failed\n" + log.slice(-2000));
      stop();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const up = await (async () => {
    for (let i = 0; i < 60; i++) {
      try {
        await new Promise((res, rej) => {
          const r = http.get(`${ORIGIN}/api/health`, () => res());
          r.on("error", rej);
        });
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return false;
  })();
  if (!up) {
    console.log("the server did not start");
    stop();
    process.exit(1);
  }

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  let shot = 0;
  const balanceReads = [];
  for (const [dev, width, height] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: dev === "phone" });
    await ctx.addCookies([{ ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    for (const [name, path] of SCREENS) {
      try {
        await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForTimeout(500);
        const landed = new URL(page.url()).pathname;
        await page.screenshot({ path: `${OUT}/${dev}-${name}.png`, fullPage: false });
        // THE HEADER'S BALANCE, read off the page and compared with the
        // plan's. Digits only, so the locale's grouping (25,000 / 25.000)
        // does not decide the answer.
        const badge = page.locator('header a[href="/dashboard/settings#buy-credits"]').first();
        if ((await badge.count()) > 0 && (await badge.isVisible())) {
          const shown = Number(((await badge.innerText()) || "").replace(/\D/g, ""));
          balanceReads.push({ dev, name, shown });
        }
        shot++;
        // THE LANDED PATH IS PRINTED, every time. A screenshot of the
        // login page filed under "chat" is the failure this whole file
        // exists to avoid, and it is invisible in a thumbnail.
        console.log(`${dev.padEnd(8)} ${name.padEnd(17)} landed ${landed}${landed === path ? "" : "   <- NOT the page asked for"}`);
      } catch (err) {
        console.log(`${dev.padEnd(8)} ${name.padEnd(17)} FAILED  ${String(err.message).slice(0, 70)}`);
      }
    }
    // THE SIDEBAR ON ITS OWN, at desktop only: at 390 it is a drawer
    // and photographing it shut would say the opposite of what it says.
    if (dev === "desktop") {
      await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle", timeout: 60_000 });
      const nav = page.locator("nav").first();
      if ((await nav.count()) > 0) {
        await nav.screenshot({ path: `${OUT}/desktop-sidebar.png` });
        shot++;
        console.log("desktop  sidebar           cropped to the nav element");
      }
    }
    await ctx.close();
  }
  console.log(`\n${shot} screenshots in ${OUT}`);
  const wrong = balanceReads.filter((r) => r.shown !== ULTIMATE_CREDITS);
  console.log(
    `header balance read on ${balanceReads.length} screen(s); the plan grants ${ULTIMATE_CREDITS}` +
      (wrong.length ? ` — DIFFERENT on ${wrong.map((r) => `${r.dev}/${r.name} (${r.shown})`).join(", ")}` : " — the same on every one"),
  );
  if (balanceReads.length === 0 || wrong.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  stop();
}

console.log(
  "\nTHE CODE IS THE REAL BUILD; THE DATA IS NOBODY'S. The account is a\n" +
  "stand-in on the Ultimate plan with no records, so every list is empty\n" +
  "on purpose. What a real account's screens look like needs BOT_EMAIL\n" +
  "and BOT_PASSWORD, and so does everything else that is waiting on them."
);
