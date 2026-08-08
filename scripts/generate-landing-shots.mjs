#!/usr/bin/env node
/*
 * Landing-page screenshots, taken from the REAL application.
 *
 * The landing page used to describe the product in prose. A tester read it
 * and concluded Ionexa was "several LLMs in one place, cheaper" — because
 * a paragraph about capabilities is indistinguishable from every other
 * paragraph about capabilities. The replacement shows the thing instead:
 * one picture per section, one sentence under it.
 *
 * Every picture in public/landing/ is produced by this script, and every
 * one of them is a photograph of the actual product:
 *
 *   website.png  — /dashboard/website-builder, the real workspace, with a
 *                  finished site in its real preview pane.
 *   mission.png  — /dashboard/mission with a mission open, the real step
 *                  list with real outcomes and estimates.
 *   agent.png    — the output of lib/email/templates.ts's
 *                  agentRunResultEmailHtml, which is the exact function
 *                  that renders the mail a scheduled agent sends. Not a
 *                  mock-up of an email: the email.
 *
 * WHAT IS AND IS NOT REAL HERE. The UI, the layout, the components, the
 * email template and the published-site renderer are the shipped ones,
 * rendered by a production `next build`. The CONTENT is example data,
 * seeded through a stand-in Supabase exactly as scripts/tests/*.prodtest
 * do — a coffee shop that does not exist, a mission nobody is running.
 * That is why every one of these images is captioned "Example" on the
 * landing page itself. Showing invented output as a customer's real result
 * would be the same lie the old copy told, in a new format.
 *
 * Run: node scripts/generate-landing-shots.mjs
 *      (add SKIP_BUILD=1 to reuse an existing .next from a previous run)
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadTs } from "./tests/load-ts.mjs";

const OUT_DIR = path.join(process.cwd(), "public", "landing");
mkdirSync(OUT_DIR, { recursive: true });

const USER_ID = "00000000-0000-4000-8000-000000000001";
const USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "you@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: "pro", seat_count: 0 },
  identities: [],
};

// ---------------------------------------------------------------------------
// The example content.
// ---------------------------------------------------------------------------

// A complete single-file site, in the shape lib/website-builder.ts's system
// prompt specifies (one document, inline CSS, no external requests). This
// is what goes in the preview pane, so the screenshot shows a finished page
// rather than an empty frame.
const COFFEE_SITE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kafeneio — coffee, Thessaloniki</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,'Times New Roman',serif;background:#1c1614;color:#f3ece4;line-height:1.6}
header{padding:96px 24px 72px;text-align:center;background:radial-gradient(circle at 50% 0%,#3a2a20 0%,#1c1614 70%)}
.brand{font-size:13px;letter-spacing:.42em;text-transform:uppercase;color:#c9a227}
h1{font-size:56px;line-height:1.1;margin:18px 0 14px;font-weight:400}
header p{color:#c8bcae;font-size:18px}
.cta{display:inline-block;margin-top:30px;background:#c9a227;color:#1c1614;padding:14px 30px;border-radius:2px;
text-decoration:none;font-size:13px;letter-spacing:.16em;text-transform:uppercase;font-family:system-ui,sans-serif}
section{max-width:960px;margin:0 auto;padding:64px 24px}
h2{font-size:13px;letter-spacing:.32em;text-transform:uppercase;color:#c9a227;margin-bottom:26px;font-family:system-ui,sans-serif}
.menu{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
.item{border:1px solid #3a2f28;padding:22px;border-radius:3px;background:#221a17}
.item h3{font-size:19px;font-weight:400;margin-bottom:6px}
.item span{color:#c9a227;font-size:14px}
.item p{color:#a89a8c;font-size:14px;margin-top:8px}
.hours{display:flex;gap:56px;flex-wrap:wrap;color:#c8bcae;font-size:15px}
footer{border-top:1px solid #3a2f28;padding:30px 24px;text-align:center;color:#7d7168;font-size:13px}
</style></head>
<body>
<header>
  <div class="brand">Kafeneio</div>
  <h1>Coffee worth<br />sitting down for.</h1>
  <p>Roasted in Thessaloniki. Poured since 1998.</p>
  <a class="cta" href="#menu">See the menu</a>
</header>
<section id="menu">
  <h2>Menu</h2>
  <div class="menu">
    <div class="item"><h3>Freddo espresso</h3><span>&euro;2.60</span><p>Double shot, shaken cold.</p></div>
    <div class="item"><h3>Greek coffee</h3><span>&euro;2.20</span><p>Briki, on hot sand.</p></div>
    <div class="item"><h3>Bougatsa</h3><span>&euro;3.40</span><p>Semolina cream, warm.</p></div>
  </div>
</section>
<section>
  <h2>Find us</h2>
  <div class="hours">
    <div><strong>Mon&ndash;Fri</strong><br />07:00 &ndash; 22:00</div>
    <div><strong>Sat&ndash;Sun</strong><br />08:00 &ndash; 00:00</div>
    <div><strong>Address</strong><br />Aristotelous 14, Thessaloniki</div>
  </div>
</section>
<footer>Kafeneio &middot; Aristotelous 14 &middot; +30 2310 000 000</footer>
</body></html>`;

const NOW = "2026-08-01T09:00:00Z";
const WEBSITE_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: USER_ID,
  name: "Kafeneio — coffee shop",
  html_content: COFFEE_SITE_HTML,
  status: "completed",
  error_message: null,
  reference_image_url: null,
  has_reference_images: false,
  is_large_request: false,
  free_retry_used: false,
  description: "A landing page for my coffee shop in Thessaloniki",
  created_at: NOW,
};

const MISSION_ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: USER_ID,
  goal: "Find 5 new customers this month",
  status: "in_progress",
  created_at: NOW,
  updated_at: NOW,
  plan_steps: {
    steps: [
      {
        text: "List 40 businesses that already buy something like this",
        status: "completed",
        outcome: "A list of 40 names with the person to contact",
        estimatedMinutes: 45,
        module: "leads",
        moduleTitle: "Sales",
      },
      {
        text: "Write one short email and send it to the first 20",
        status: "completed",
        outcome: "20 emails sent, replies tracked in Sales",
        estimatedMinutes: 60,
        module: "leads",
        moduleTitle: "Sales",
      },
      {
        text: "Follow up with everyone who opened it but did not reply",
        status: "pending",
        outcome: "Every warm contact chased once",
        estimatedMinutes: 30,
      },
      {
        text: "Book calls with the three most interested",
        status: "pending",
        outcome: "Three calls in the calendar",
        estimatedMinutes: 20,
      },
      {
        text: "Send the offer and close",
        status: "pending",
        outcome: "5 new customers",
        estimatedMinutes: 40,
      },
    ],
  },
};

const AGENT_OUTPUT = `Three things happened in your market overnight.

A competitor cut their entry price to EUR 19/month, down from EUR 29. That is the second cut this quarter, and it is now below your Starter tier.

The trade body published its yearly report. Small operators grew 11% while the largest four shrank. Your segment is the one that grew.

A supplier you buy from announced delivery delays into September. Worth ordering early.`;

// ---------------------------------------------------------------------------
// A stand-in Supabase, seeded with the rows above. Same technique as
// scripts/tests/routes-smoke.prodtest.mjs — see that file for why the
// production build has to be made against this URL rather than reused.
// ---------------------------------------------------------------------------
const TABLE_ROWS = {
  user_credits: [{ user_id: USER_ID, credits_remaining: 4820, credits_total: 6000 }],
  user_websites: [WEBSITE_ROW],
  ai_missions: [MISSION_ROW],
  scheduled_agent_runs: [],
  favorites: [],
  user_achievements: [],
  credit_transactions: [],
};

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data, headers = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, USER);
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: USER, session: null });
    if (url.pathname.startsWith("/rest/v1/rpc/")) return json(200, {});
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = TABLE_ROWS[table] ?? [];
      // A `head: true, count: "exact"` request carries no body and is read
      // purely from Content-Range. dashboard/mission/page.tsx uses one to
      // tell "no missions" apart from "session degraded" — answer it, or
      // the page renders its session-expired notice instead of the list.
      if (req.method === "HEAD" || (req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
        });
        return res.end("[]");
      }
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows, {
        "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
      });
    }
    json(200, {});
  });
});

const SUPA_PORT = 54337;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.sig`;
const PROJECT_REF = "127";
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const nowSec = Math.floor(Date.now() / 1000);
const session = {
  access_token: jwt({
    sub: USER_ID,
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
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    p.on("close", (code) => resolve({ code, log }));
  });
}

if (process.env.SKIP_BUILD !== "1") {
  console.log("running `next build` ...");
  const built = await run("npx", ["next", "build"]);
  if (built.code !== 0) {
    console.error("build failed\n" + built.log.slice(-4000));
    supa.close();
    process.exit(1);
  }
  console.log("build ok");
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
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
if (!(await waitForServer())) {
  console.error("server did not start\n" + serverLog.slice(-3000));
  server.kill("SIGKILL");
  supa.close();
  process.exit(1);
}
console.log(`server up on :${PORT}`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 1400, height: 1100 },
  // Retina-sharp on the landing page without shipping a 4x asset.
  deviceScaleFactor: 2,
  // The screenshots must not catch a half-finished animation. Every
  // decorative motion in the app collapses under this flag (see
  // globals.css's html[data-motion="reduce"] rule), which is also how a
  // motion-sensitive user sees the product — so this is the app's own
  // still frame, not a frozen one.
  reducedMotion: "reduce",
});
await context.addCookies([
  { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
]);
// The cookie banner is fixed to the bottom of every public page and would
// sit across the bottom of a screenshot. Accepting it is what a returning
// visitor's browser already has stored.
await context.addInitScript(() => {
  try {
    localStorage.setItem("cookie-consent-accepted", "1");
  } catch {
    /* storage disabled */
  }
});

// WebP, not PNG. These are 2x screenshots of a dark UI with gradients:
// as PNG each one is ~1.2 MB, and three of them would make the landing
// page — the page whose whole job is to load fast and not jump — the
// heaviest thing in the app. WebP at q82 keeps them visually identical at
// roughly a tenth of that. sharp is already a dependency (see
// scripts/generate-icons.mjs).
async function shoot(name, { url, prepare, clip, html }) {
  const page = await context.newPage();
  if (html) {
    await page.setContent(html, { waitUntil: "load" });
  } else {
    await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "networkidle", timeout: 45000 });
  }
  if (prepare) await prepare(page);
  await page.waitForTimeout(500);
  const target = clip ? page.locator(clip).first() : page;
  const buffer = await target.screenshot({ type: "png" });
  const box = clip ? await target.boundingBox() : page.viewportSize();
  await sharp(buffer)
    .webp({ quality: 82, effort: 6 })
    .toFile(path.join(OUT_DIR, `${name}.webp`));
  await page.close();
  return box;
}

const sizes = {};

// 1. The Website Builder, with a finished site in its own preview pane.
sizes.website = await shoot("website", {
  url: "/dashboard/website-builder",
  // The DetailPanel (components/ui/detail-panel.tsx) — the open project
  // with its preview — rather than the whole page. A full-page shot at
  // this viewport is mostly the list below it and the sticky nav clipping
  // the heading, neither of which is the point being made.
  clip: "main section.rounded-2xl",
  prepare: async (page) => {
    // The workspace opens on the preview tab with the newest site selected
    // (see website-builder-workspace.tsx) — wait for the iframe to have
    // actually painted the document rather than screenshotting a blank one.
    await page.waitForSelector("iframe", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
  },
});

// 2. Mission Control, with the plan open on its steps.
sizes.mission = await shoot("mission", {
  url: "/dashboard/mission",
  clip: "main section.rounded-2xl",
  prepare: async (page) => {
    const card = page.getByText("Find 5 new customers this month").first();
    await card.click({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(900);
  },
});

// 3. The agent's email — rendered by the very function that sends it.
const templates = await loadTs("src/lib/email/templates.ts");
const agentEmailHtml = templates.agentRunResultEmailHtml({
  agentName: "Morning market brief",
  output: AGENT_OUTPUT,
  agentsUrl: "https://ionexa.ai/dashboard/agents",
  aiGeneratedNotice:
    "This message was written by an AI agent you set up. Check anything you plan to act on.",
});
// The inner 520px-wide table is the message itself; the outer one is the
// full-width background wrapper an email client supplies, which would be
// most of the picture and none of the point.
sizes.agent = await shoot("agent", { html: agentEmailHtml, clip: "table table" });

await browser.close();
server.kill("SIGKILL");
supa.close();

console.log("\nwrote:");
for (const file of readdirSync(OUT_DIR).sort()) {
  const kb = Math.round(statSync(path.join(OUT_DIR, file)).size / 1024);
  console.log(`  public/landing/${file}  ${kb} KB`);
}

// The landing page sets width/height on every <img> so the browser can
// reserve the box before the bytes arrive — a picture without them is one
// of the two things that made the old page jump on load. Writing the real
// pixel dimensions out here keeps that markup honest instead of guessed.
const manifest = Object.fromEntries(
  Object.entries(sizes).map(([k, box]) => [
    k,
    box ? { width: Math.round(box.width), height: Math.round(box.height) } : null,
  ])
);
writeFileSync(path.join(OUT_DIR, "sizes.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("\nCSS pixel sizes (for the <img> width/height attributes):");
console.log(JSON.stringify(manifest, null, 2));
process.exit(0);
