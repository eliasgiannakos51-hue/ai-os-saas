/*
 * THE APPROVED EDITOR LAYOUT, IN THE BUILT APP (the switch "editor-shell",
 * components/shell/editor-shell.tsx; the owner's approved screens,
 * docs/design/approved/README.md, 2026-11-04).
 *
 * Run: node scripts/tests/editor-shell.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/editor-shell.prodtest.mjs
 *      SHOT_DIR=/tmp/editor-shots node scripts/tests/editor-shell.prodtest.mjs
 *
 * The switch is turned on for the staff user (the test account,
 * TEST_ACCOUNT_EMAILS) and three tools are opened on finished work seeded
 * straight into the stand-in database — nothing is generated:
 *
 *   Image     the start screen (M00-Start.png), then the work with the
 *             288px panel, a picture chosen (14-Image.png, M14-Image.png),
 *             and one change, answered by an intercepted route, so the
 *             last-answer line and «Chat» have something to say;
 *   Site      the work with a part of the page chosen (08-Site.png);
 *   Document  the work with a paragraph chosen and text typed, so the
 *             price is said inside the field (11-Document.png).
 *
 * What is measured is what the approved screens fix: the work spans the
 * whole width of the main column (less the panel), the panel is 288px
 * when there is one, the field is bottom-centre and at most 680px wide,
 * the bar is 56px with at most ONE white button in it (exactly one where
 * the tool hands it one), the top bar's «Make anything» is not filled,
 * and on a phone the «Chat | Result» switch, the primary full-width above
 * the field, and the field above the tab bar.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const EL = JSON.parse(readFileSync("messages/el.json", "utf8"));
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));

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
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// ---- the seeded work -------------------------------------------------------
// Four pictures of a sesame ring on a counter, drawn here so the screens
// read like the approved ones rather than like four grey squares.
const TONES = [
  ["#ECE8E2", "#C98B4E"],
  ["#E6E0D8", "#B97E44"],
  ["#D9C3A8", "#D29A5C"],
  ["#E9E4DD", "#C4884B"],
];
const PICTURES = await Promise.all(
  TONES.map(([bg, ring]) =>
    sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${bg}"/><circle cx="200" cy="250" r="96" fill="none" stroke="${ring}" stroke-width="44"/></svg>`))
      .png()
      .toBuffer()
  )
);
const IMAGE_ID = "c5555555-5555-4555-8555-555555555555";
const pathOf = (n) => `${MOCK_USER.id}/${IMAGE_ID}/v${n}.png`;
const IMAGE_ROW = {
  id: IMAGE_ID, user_id: MOCK_USER.id, prompt: "Κουλούρι σε μαρμάρινο πάγκο", aspect: "4:5", status: "done", credits_charged: 4,
  variants: [0, 1, 2, 3].map((n) => ({ index: n, path: pathOf(n), mime: "image/png", fullPath: null, previous: [] })),
  created_at: "2026-11-04T09:00:00Z", updated_at: "2026-11-04T09:00:00Z",
};

const SITE_ID = "a6666666-6666-4666-8666-666666666666";
const SITE_HTML = `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Φούρνος της Γειτονιάς</title>
<style>body{margin:0;background:#17110C;color:#F3E9DC;font-family:Georgia,serif}header{display:flex;justify-content:space-between;padding:20px 32px}nav a{color:#CDBFAE;margin-left:22px;text-decoration:none;font-family:system-ui}section{padding:36px 32px}h1{font-size:44px;margin:0 0 12px}p{color:#CDBFAE;font-family:system-ui;font-size:16px}.btn{display:inline-block;background:#C98B4E;color:#17110C;padding:10px 18px;border-radius:9px;font-family:system-ui;font-weight:600}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{border:1px solid #33261A;border-radius:12px;padding:12px;font-family:system-ui}footer{padding:24px 32px;color:#8a7d6e;font-family:system-ui}</style></head>
<body><header><strong>Φούρνος της Γειτονιάς</strong><nav><a href="#">Ψωμιά</a><a href="#">Γλυκά</a><a href="#">Ώρες</a><a href="#">Επικοινωνία</a></nav></header>
<section><h1>Ζεστό ψωμί από τις 6:00</h1><p>Ψήνουμε κάθε πρωί με προζύμι που φτιάχνουμε εμείς, στη γωνία της γειτονιάς σου.</p><span class="btn">Δες τι ψήνουμε</span></section>
<section><h2>Τι ψήνουμε</h2><div class="cards"><div class="card">Χωριάτικο ψωμί<br>2,40 €</div><div class="card">Κουλούρι Θεσσαλονίκης<br>0,80 €</div><div class="card">Τυρόπιτα χωριάτικη<br>2,20 €</div></div></section>
<footer>Φούρνος της Γειτονιάς · Πατησίων 112</footer></body></html>`;
const SITE_ROW = {
  id: SITE_ID, user_id: MOCK_USER.id, name: "Φούρνος της Γειτονιάς", html_content: SITE_HTML, pages: null, generation_notes: null, timeline: null,
  status: "completed", error_message: null, reference_image_url: null, has_reference_images: false, is_large_request: false, free_retry_used: false,
  description: "Ένας φούρνος της γειτονιάς", created_at: "2026-11-04T09:00:00Z", updated_at: "2026-11-04T09:00:00Z",
};

const DOC_ID = "b7777777-7777-4777-8777-777777777777";
const DOC_ROW = {
  id: DOC_ID, user_id: MOCK_USER.id, title: "Προσφορά για τον φούρνο", updated_at: "2026-11-04T09:00:00Z", created_at: "2026-11-04T09:00:00Z",
  content: { html: "<h1>Προσφορά για τον φούρνο</h1><p>Σας ευχαριστούμε για το ενδιαφέρον σας. Παρακάτω θα βρείτε την προσφορά μας για το νέο site του φούρνου.</p><h2>Τι προσφέρουμε</h2><ul><li>Σελίδα με τα προϊόντα και τις τιμές</li><li>Ώρες λειτουργίας και χάρτη</li></ul><p>Η προσφορά ισχύει για τριάντα ημέρες.</p>" },
};

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const flags = [{ key: "editor-shell", audience: "staff" }];
const supa = await startMockSupabase({
  port: 54611,
  tableRows: {
    feature_flags: flags,
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 82, credits_total: 3000 }],
    generated_images: [IMAGE_ROW],
    ai_images: [],
    user_websites: [SITE_ROW],
    user_documents: [DOC_ROW],
  },
  handle: ({ req, res, url, body, json }) => {
    const p = url.pathname;
    if (req.method === "POST" && p === "/storage/v1/object/sign/ai-images") {
      const { paths } = JSON.parse(body || "{}");
      json(200, (paths ?? []).map((path) => ({ path, signedURL: `/object/sign/ai-images/${path}?token=t`, error: null })));
      return true;
    }
    if (req.method === "GET" && p.startsWith("/storage/v1/object/sign/ai-images/")) {
      const n = Number(/\/v(\d)\.png$/.exec(p)?.[1] ?? 0);
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PICTURES[n] ?? PICTURES[0]);
      return true;
    }
    return false;
  },
});

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ADMIN_EMAILS: "",
  // Image draws its prices only when it could make a picture; nothing in
  // this file asks the provider for one (the one change is intercepted).
  GEMINI_API_KEY: "test-key-never-called",
};

const SHOT_DIR = process.env.SHOT_DIR;
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
};

async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}

/** What the bar, the stage, the panel and the field measure, read in the page. */
async function layout(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" };
    };
    // A WHITE BUTTON is one painted in the design's button colour
    // (#F5F7FB, globals.css --button) and visible.
    const white = (root) =>
      [...(root?.querySelectorAll("button, a") ?? [])].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).backgroundColor.replace(/\s/g, "") === "rgb(245,247,251)";
      }).length;
    const work = document.querySelector('[data-testid="tool-shell-work"]');
    const bar = work?.querySelector('[data-testid="editor-bar"]') ?? document.querySelector('[data-testid="editor-bar"]');
    return {
      main: box("#main-content"),
      work: box('[data-testid="tool-shell-work"]'),
      bar: bar ? (() => { const r = bar.getBoundingClientRect(); return { h: r.height, w: r.width }; })() : null,
      barWhite: white(bar),
      headerWhite: white(document.querySelector("header")),
      stage: box('[data-testid="editor-stage"]'),
      panel: box('[data-testid="editor-panel"]'),
      field: box('[data-testid="editor-field"]'),
      float: box('[data-testid="editor-float"]'),
      tabBar: (() => { const nav = [...document.querySelectorAll("nav")].find((n) => getComputedStyle(n).position === "fixed" && n.getBoundingClientRect().bottom >= window.innerHeight - 1); return nav ? nav.getBoundingClientRect().top : null; })(),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env: base, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  const ON = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    const desktop = !device.touch;
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: 2 });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: "el", url: ON },
      ].map(({ domain, path, ...c }) => c)
    );
    const page = await context.newPage();
    pageErrors.length = 0;
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
      if (!cdp) return locator.click();
      const b = await locator.boundingBox();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png` });
    const settle = () => page.waitForTimeout(400);

    // ---- IMAGE, THE START SCREEN (M00-Start.png) ----------------------------
    await page.goto(`${ON}/dashboard/images`, { waitUntil: "networkidle" });
    await page.locator('[data-shell="editor"]').waitFor({ timeout: 20_000 });
    check(`${device.label}: the switch on, Image draws the editor layout`, (await page.locator('[data-shell="editor"]').count()) === 1);
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 10_000 });
    await settle();
    {
      const examples = page.locator('[data-testid="tool-shell-example"]');
      const n = await examples.count();
      const boxes = [];
      for (let i = 0; i < n; i++) boxes.push(await examples.nth(i).boundingBox());
      const column = await page.locator('[data-testid="tool-shell-empty"]').boundingBox();
      check(`${device.label}: start — three examples, as full-width rows of their column, not pills (${boxes.map((b) => Math.round(b.w ?? b.width)).join(", ")}px)`,
        n === 3 && boxes.every((b) => near(b.width, column.width, 1) && b.height >= 44) && column.width <= 561);
      const l = await layout(page);
      check(`${device.label}: start — the field is at most 680px and centred under the column (${Math.round(l.field.w)}px)`,
        l.field.w <= 681 && near(l.field.x + l.field.w / 2, column.x + column.width / 2, 2));
      check(`${device.label}: start — the tool's options are inside the field's bottom row`,
        (await page.locator('[data-testid="editor-field"] [data-testid="tool-shell-options"] [data-testid="image-aspect"]').count()) === 1);
      check(`${device.label}: start — the price is inside the field, before send`,
        (await page.locator('[data-testid="editor-field"] [data-testid="editor-cost"]').innerText()).includes("credit"));
      check(`${device.label}: start — «Make anything» in the top bar is not a white button`, l.headerWhite === 0, String(l.headerWhite));
    }
    await shot("image-1-start");

    // ---- IMAGE, THE WORK WITH THE PANEL (14-Image.png / M14-Image.png) -------
    await page.goto(`${ON}/dashboard/images?record=${IMAGE_ID}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 20_000 });
    await page.locator('[data-testid="image-variant"] img').first().waitFor({ timeout: 10_000 });
    await settle();
    {
      const l = await layout(page);
      check(`${device.label}: image — the bar is 56px (${l.bar?.h})`, near(l.bar?.h ?? 0, 56, 1));
      check(`${device.label}: image — no white button in the bar before a picture is chosen (${l.barWhite})`, l.barWhite === 0);
      if (desktop) {
        check(`${device.label}: image — the work spans the whole main column (${Math.round(l.work.w)} of ${Math.round(l.main.w)})`, near(l.work.x, l.main.x, 1) && near(l.work.w, l.main.w, 1));
        check(`${device.label}: image — the panel is 288px (${l.panel?.w})`, Boolean(l.panel) && near(l.panel.w, 288, 1) && near(l.panel.right, l.work.right, 1));
        check(`${device.label}: image — the stage is all the rest of the width (${Math.round(l.stage.w)})`, near(l.stage.w, l.work.w - 288, 2));
        check(`${device.label}: image — the field floats bottom-centre over the stage, at most 680px (${Math.round(l.field.w)}px)`,
          l.field.w <= 681 && near(l.field.x + l.field.w / 2, l.stage.x + l.stage.w / 2, 2) && l.field.bottom <= l.stage.bottom && l.stage.bottom - l.field.bottom <= 40);
        check(`${device.label}: image — the options are in the panel, not in the field`,
          (await page.locator('[data-testid="editor-field"] [data-testid="tool-shell-options"]').count()) === 0 && (await page.locator('[data-testid="editor-panel"] [data-testid="image-panel-aspect"]').count()) === 4);
        check(`${device.label}: image — the price box is pinned at the foot of the panel`,
          await page.locator('[data-testid="editor-price"]').evaluate((el) => {
            const p = el.closest('[data-testid="editor-panel"]').getBoundingClientRect();
            return p.bottom - el.getBoundingClientRect().bottom < 120;
          }));
      } else {
        check(`${device.label}: image — the work is the whole screen above the tab bar`, near(l.work.x, 0, 1) && near(l.work.w, l.vw, 1));
        check(`${device.label}: image — «Chat | Result» is there, on Result`,
          (await page.locator('[data-testid="editor-switch"] button').count()) === 2 && (await page.locator('[data-testid="editor-switch-result"]').getAttribute("aria-pressed")) === "true");
        check(`${device.label}: image — the field sits above the tab bar (${Math.round(l.field.bottom)} ≤ ${Math.round(l.tabBar ?? 0)})`, l.tabBar !== null && l.field.bottom <= l.tabBar + 1);
        check(`${device.label}: image — the balance is said once, by the tab bar's «You», not by a second pill on top`,
          !(await page.locator('[data-testid="editor-credits"]').isVisible()));
      }
    }

    // A picture chosen: the chip in the field, the white button in the bar.
    await press(page.locator('[data-testid="image-variant"]').nth(1));
    await page.locator('[data-testid="editor-selection"]').waitFor({ timeout: 5_000 });
    await settle();
    {
      const l = await layout(page);
      const chip = await page.locator('[data-testid="editor-selection"]').innerText();
      check(`${device.label}: image — the chosen picture is a chip in the field (${JSON.stringify(chip)})`,
        chip.includes(fill(EL.dashboard.images.chosen, { n: 2 })) && (await page.locator('[data-testid="editor-field"] [data-testid="editor-selection"]').count()) === 1 && (await page.locator('[data-testid="box-chosen"]').count()) === 0);
      if (desktop) {
        check(`${device.label}: image — EXACTLY ONE white button in the bar, the primary (${l.barWhite})`, l.barWhite === 1 && (await page.locator('[data-testid="editor-primary"]').isVisible()));
      } else {
        const primary = await page.locator('[data-testid="editor-primary-phone"]').boundingBox();
        check(`${device.label}: image — the primary is full-width above the field (${Math.round(primary?.width ?? 0)}px)`,
          Boolean(primary) && primary.width >= l.vw - 34 && primary.y + primary.height <= l.field.y + 1 && (await page.locator('[data-testid="editor-primary"]').isVisible()) === false);
        check(`${device.label}: image — and the bar itself has no white button`, l.barWhite === 0);
      }
    }
    await shot("image-2-work");

    // One change, answered by an intercepted route: the last-answer line.
    const srcs = await page.locator('[data-testid="image-variant"] img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src")));
    await page.route("**/api/images/*/edit", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, image: { id: IMAGE_ID, prompt: IMAGE_ROW.prompt, aspect: "4:5", createdAt: IMAGE_ROW.created_at, variants: srcs.map((url, index) => ({ index, url, full: false })) } }),
      })
    );
    await page.locator('[data-testid="editor-field"] textarea').fill("Πιο ζεστό φως");
    await page.locator('[data-testid="editor-field"] textarea').press("Enter");
    if (desktop) {
      await page.locator('[data-testid="editor-note"]').waitFor({ timeout: 10_000 });
      await settle();
      const said = fill(EL.dashboard.images.changed, { n: 2 });
      check(`${device.label}: image — keyboard focus in the text draws the 2px ring round the whole field, not a box inside it`,
        await page.evaluate(() => {
          const field = document.querySelector('[data-testid="editor-field"] [data-shape]');
          const text = field?.querySelector("textarea");
          return Boolean(field && text && document.activeElement === text && getComputedStyle(field).outlineStyle === "solid" && getComputedStyle(field).outlineWidth === "2px" && getComputedStyle(text).outlineColor === "rgba(0, 0, 0, 0)");
        }));
      check(`${device.label}: image — the line above the field says the last answer`, (await page.locator('[data-testid="editor-note-text"]').innerText()).includes(said));
      const note = await page.locator('[data-testid="editor-note"]').boundingBox();
      const field = await page.locator('[data-testid="editor-field"]').boundingBox();
      check(`${device.label}: image — ...on one line, right above the field, no wider than it`, note.height <= 50 && note.y + note.height <= field.y && note.width <= 681);
      await shot("image-3-answered");
      await press(page.locator('[data-testid="editor-chat-open"]'));
      await page.locator('[data-testid="editor-chat"]').waitFor({ timeout: 5_000 });
      const thread = await page.locator('[data-testid="editor-chat-thread"]').innerText();
      check(`${device.label}: image — «Chat» opens the whole conversation`, thread.includes("Πιο ζεστό φως") && thread.includes(said));
      await shot("image-4-chat");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      check(`${device.label}: image — Esc closes it, and focus goes back to «Chat»`,
        (await page.locator('[data-testid="editor-chat"]').count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "editor-chat-open");
    } else {
      await page.waitForTimeout(800);
      await press(page.locator('[data-testid="editor-switch-chat"]'));
      await page.locator('[data-testid="tool-shell-thread"]').waitFor({ timeout: 5_000 });
      const thread = await page.locator('[data-testid="tool-shell-thread"]').innerText();
      check(`${device.label}: image — «Chat» shows the conversation, and the work steps aside`,
        thread.includes("Πιο ζεστό φως") && thread.includes(fill(EL.dashboard.images.changed, { n: 2 })) && !(await page.locator('[data-testid="editor-stage"]').isVisible()));
      await shot("image-3-chat");
      await press(page.locator('[data-testid="editor-switch-result"]'));
      await page.locator('[data-testid="editor-stage"]').waitFor({ state: "visible", timeout: 5_000 });
      check(`${device.label}: image — «Result» brings the work back`, await page.locator('[data-testid="editor-stage"]').isVisible());
    }
    await page.unroute("**/api/images/*/edit");

    // ---- SITE, A PART CHOSEN (08-Site.png) ------------------------------------
    await page.goto(`${ON}/dashboard/website-builder?project=${SITE_ID}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 20_000 });
    await page.locator('[data-testid="site-live-preview"]').waitFor({ timeout: 10_000 });
    if (desktop) {
      await press(page.locator('[data-testid="site-box"]').nth(1));
      await page.locator('[data-testid="editor-selection"]').waitFor({ timeout: 5_000 });
    }
    await settle();
    {
      const l = await layout(page);
      check(`${device.label}: site — the bar is 56px (${l.bar?.h})`, near(l.bar?.h ?? 0, 56, 1));
      check(`${device.label}: site — no panel, since Site passes none`, l.panel === null);
      check(`${device.label}: site — at most one white button in the bar (${l.barWhite})`, l.barWhite <= 1);
      if (desktop) {
        check(`${device.label}: site — the work spans the whole main column (${Math.round(l.work.w)} of ${Math.round(l.main.w)})`, near(l.work.x, l.main.x, 1) && near(l.work.w, l.main.w, 1) && near(l.stage.w, l.work.w, 1));
        check(`${device.label}: site — the field floats bottom-centre, at most 680px (${Math.round(l.field.w)}px)`,
          l.field.w <= 681 && near(l.field.x + l.field.w / 2, l.stage.x + l.stage.w / 2, 2) && l.stage.bottom - l.field.bottom <= 40);
        check(`${device.label}: site — the chosen part is the chip in the field`, (await page.locator('[data-testid="editor-selection"]').innerText()).trim().length > 0);
        check(`${device.label}: site — computer | phone sit beside the title`, (await page.locator('[data-testid="editor-bar"] [data-testid="site-viewport-desktop"]').isVisible()) && (await page.locator('[data-testid="editor-status"]').isVisible()));
      } else {
        check(`${device.label}: site — «Chat | Result» on the phone`, (await page.locator('[data-testid="editor-switch"] button').count()) === 2);
        check(`${device.label}: site — the field sits above the tab bar`, l.tabBar !== null && l.field.bottom <= l.tabBar + 1);
        // Site has options and no panel, so its field is the stacked shape,
        // whose placeholder runs to two lines at 390px and was cut in half
        // at one line's height (2026-11-05).
        const text = await page.locator('[data-testid="editor-field"] textarea').boundingBox();
        check(`${device.label}: site — the stacked field's text has room for two lines (${Math.round(text?.height ?? 0)}px)`, (text?.height ?? 0) >= 63);
      }
    }
    await shot("site-1-work");

    // ---- DOCUMENT, A PARAGRAPH CHOSEN, THE PRICE IN THE FIELD ---------------
    await page.goto(`${ON}/dashboard/documents?record=${DOC_ID}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 20_000 });
    await page.locator('[data-testid="doc-box"]').first().waitFor({ timeout: 10_000 });
    if (desktop) {
      await press(page.locator('[data-testid="doc-box"]').nth(1));
      await page.locator('[data-testid="editor-selection"]').waitFor({ timeout: 5_000 });
    }
    await page.locator('[data-testid="editor-field"] textarea').fill("Πιο σύντομο");
    await settle();
    {
      const l = await layout(page);
      check(`${device.label}: document — the bar is 56px (${l.bar?.h})`, near(l.bar?.h ?? 0, 56, 1));
      check(`${device.label}: document — what typing will cost is said inside the field`,
        (await page.locator('[data-testid="editor-field"] [data-testid="editor-cost"]').count()) === 1);
      if (desktop) {
        check(`${device.label}: document — EXACTLY ONE white button in the bar: the Word file (${l.barWhite})`,
          l.barWhite === 1 && (await page.locator('[data-testid="editor-primary"]').innerText()).includes(EL.dashboard.documents.writer.word));
        check(`${device.label}: document — the work spans the whole main column`, near(l.work.w, l.main.w, 1) && near(l.stage.w, l.work.w, 1));
        check(`${device.label}: document — the field floats bottom-centre, at most 680px`, l.field.w <= 681 && near(l.field.x + l.field.w / 2, l.stage.x + l.stage.w / 2, 2));
        check(`${device.label}: document — the chosen paragraph is the chip in the field`, (await page.locator('[data-testid="editor-selection"]').innerText()).includes(fill(EL.dashboard.documents.writer.block, { n: 2 })));
      } else {
        check(`${device.label}: document — the Word file is the full-width button above the field`, await page.locator('[data-testid="editor-primary-phone"]').isVisible());
      }
    }
    await shot("document-1-work");

    check(`${device.label}: no page errors`, pageErrors.length === 0, pageErrors.join(" | "));
    await context.close();
  }
} catch (err) {
  failures.push(String(err?.stack ?? err));
  console.log(`  FAIL  ${err?.stack ?? err}`);
} finally {
  try { await browser?.close(); } catch {}
  cleanup();
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
