// Generates the PWA's raster icons and its install-dialog screenshots.
//
// WHY THIS IS A SCRIPT AND NOT FOUR CHECKED-IN FILES SOMEONE MADE ONCE:
// the screenshots are photographs of the real app. Re-run it after a
// redesign and the install dialog stops advertising a layout that no
// longer exists. Nothing here is drawn or mocked up — it boots a real
// production build against a stand-in Supabase and photographs what a
// signed-in account actually sees.
//
// The account it photographs is EMPTY, so the screenshots show real empty
// states rather than invented numbers. An install dialog full of fake
// revenue figures would be the same lie as a generated website full of
// them.
//
// Run: node scripts/generate-pwa-assets.mjs
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import { chromium } from "playwright";
import { startMockSupabase } from "./lib/mock-supabase.mjs";

const PORT = 38473;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROMIUM = "/opt/pw-browsers/chromium";

const supa = await startMockSupabase({ port: 54343 });

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
};

let server = null;
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });

try {
  // ---------------------------------------------------------------- icons
  // Rendered from the SAME src/app/icon.svg the favicon uses, so the
  // installed icon can never drift from the one in the tab.
  console.log("rendering icons from src/app/icon.svg ...");
  const svg = readFileSync("src/app/icon.svg", "utf8");
  const iconPage = await browser.newPage();
  for (const size of [192, 512]) {
    await iconPage.setViewportSize({ width: size, height: size });
    await iconPage.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">
       <div style="width:${size}px;height:${size}px">${svg.replace(
         "<svg ",
         `<svg width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" `
       )}</div></body></html>`
    );
    const buf = await iconPage.screenshot({ omitBackground: false });
    writeFileSync(`public/icon-${size}.png`, buf);
    console.log(`  public/icon-${size}.png`);
  }
  await iconPage.close();

  // ----------------------------------------------------------- the build
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
  console.log("running `next build` ...");
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", (d) => (buildLog += d));
  build.stderr.on("data", (d) => (buildLog += d));
  const code = await new Promise((r) => build.on("close", r));
  if (code !== 0) throw new Error("next build failed\n" + buildLog.slice(-3000));
  }

  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (let i = 0; i < 120; i++) {
    const up = await new Promise((res) =>
      http.get(ORIGIN, (r) => res(r.statusCode > 0)).on("error", () => res(false))
    );
    if (up) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`server up on ${ORIGIN}`);

  // ---------------------------------------------------------- screenshots
  // Chrome shows the richer install dialog only when the manifest carries
  // screenshots with a form_factor. Its constraints: 320-3840px on a side,
  // and the longest side no more than 2.3x the shortest. 1080x1920 and
  // 1920x1080 are both 1.78, comfortably inside that.
  mkdirSync("public/screenshots", { recursive: true });

  const SHOTS = [
    { file: "narrow-overview.jpg", path: "/dashboard/overview", w: 540, h: 960, scale: 2, form: "narrow" },
    { file: "narrow-chat.jpg", path: "/dashboard/chat", w: 540, h: 960, scale: 2, form: "narrow" },
    { file: "narrow-create.jpg", path: "/dashboard/create", w: 540, h: 960, scale: 2, form: "narrow" },
    { file: "wide-overview.jpg", path: "/dashboard/overview", w: 1920, h: 1080, scale: 1, form: "wide" },
    { file: "wide-agents.jpg", path: "/dashboard/agents", w: 1920, h: 1080, scale: 1, form: "wide" },
  ];

  const results = [];
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      baseURL: ORIGIN,
      viewport: { width: shot.w, height: shot.h },
      deviceScaleFactor: shot.scale,
      colorScheme: "dark",
      // Never register the worker while photographing: a screenshot served
      // from a cache is a screenshot of an older build.
      serviceWorkers: "block",
    });
    await context.addCookies([{ ...supa.authCookie, url: ORIGIN }]);
    const page = await context.newPage();
    await page.goto(shot.path, { waitUntil: "load" }).catch(() => undefined);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1500);
    const landed = page.url();
    if (!landed.includes(shot.path)) {
      console.log(`  SKIP ${shot.file}: redirected to ${landed}`);
      await context.close();
      continue;
    }
    // Start at the top: the dashboard restores scroll, and a shot taken
    // mid-page shows the sticky header sitting on top of a section title.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    // JPEG, not PNG. The same five shots as PNG were 3.8MB — carried in
    // the repo, served on every install dialog, and a dark screenshot of a
    // UI is exactly what JPEG compresses well. Chrome accepts image/jpeg.
    const buf = await page.screenshot({ type: "jpeg", quality: 82 });
    writeFileSync(`public/screenshots/${shot.file}`, buf);
    const px = { w: shot.w * shot.scale, h: shot.h * shot.scale };
    results.push({ ...shot, ...px });
    console.log(`  public/screenshots/${shot.file}  ${px.w}x${px.h}  (${shot.form})`);
    await context.close();
  }

  console.log("\nPaste into manifest.ts if the set changed:");
  for (const r of results) {
    console.log(
      `  { src: "/screenshots/${r.file}", sizes: "${r.w}x${r.h}", type: "image/jpeg", form_factor: "${r.form}" },`
    );
  }
} finally {
  await browser.close().catch(() => undefined);
  if (server) server.kill("SIGTERM");
  supa.close();
}
