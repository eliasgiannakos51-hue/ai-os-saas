// EVERY BLOCK ON THE HOME PAGE, MEASURED — AND THE CONTRAST OVER THE BACKDROP.
//
// V4.6 #10. "The Home answers three questions: what happened · what is
// going well or badly · what do I do now. Anything that does not serve
// those goes." A list of which elements serve which is not something a
// source file can be read for — what matters is how much VERTICAL SPACE
// each one takes on a real screen, because that is what pushes the rest
// below the fold.
//
// So this measures. It does not cut anything: the brief says do not cut
// before saying what, and this is the saying.
//
// AND THE BACKDROP. The page paints a GlowOrb, .ambient-corners and the
// drifting dots behind the text. Nine points, sampled from real
// screenshot pixels rather than from token values, because a token says
// what a layer intends and a pixel says what four layers did together.
//
// Run: node scripts/tests/home-audit.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

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

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};

// --- a local stand-in for the Supabase project ------------------------
// GoTrue's /auth/v1/user plus PostgREST table reads. Every table answers
// with an empty result unless named, which is all the dashboard layout
// needs to render its shell.
const TABLE_ROWS = {
  user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
  // WITHOUT THIS ROW /dashboard/overview REDIRECTS TO /onboarding, and
  // everything below measures the onboarding screen while printing the
  // word "Home". The first run of this file did exactly that: it reported
  // four blocks and nine contrast points, all of them from the wrong
  // page. Asserting location.pathname after the goto is what caught it,
  // and that assertion stays.
  user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
  // A little real data, so the Home renders its populated state rather
  // than its empty one — the empty state is a different page with
  // different blocks, and the brief is about the populated one.
  ideas: [
    { id: "11111111-1111-4111-8111-111111111111", user_id: USER.id, name: "Subscription tier for agencies", created_at: "2026-08-20T10:00:00Z" },
    { id: "11111111-1111-4111-8111-111111111112", user_id: USER.id, name: "Referral programme", created_at: "2026-08-22T10:00:00Z" },
  ],
};

const supaHits = [];
const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    supaHits.push(`${req.method} ${req.url}`);
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, USER);
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: USER, session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = TABLE_ROWS[table] ?? [];
      // PostgREST returns a bare object (not an array) for .single()
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});
// A FIXED port, because NEXT_PUBLIC_* values are inlined into the server
// and middleware bundles by `next build` — they are not read at start
// time. The build below has to bake in the same URL this server listens
// on, which is also why this file builds rather than reusing an existing
// .next: a build made against the real project would send middleware's
// getUser() to the real Supabase.
const SUPA_PORT = 54329;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

// A session cookie in the exact shape @supabase/ssr writes and reads.
// supabase-js derives the cookie name from the URL's first hostname
// label (`sb-${hostname.split(".")[0]}-auth-token`), so for 127.0.0.1
// that is literally "127".
const PROJECT_REF = "127";
// Well-formed JWTs. supabase-js parses the access token locally to read
// its expiry before it will call the server with it, so an opaque string
// makes it drop the session and report "not logged in" without any
// network call at all. The signature is never checked here — getUser()
// always verifies against the auth server, which is the stand-in above.
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) =>
  `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
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
const AUTH_COOKIE = {
  name: `sb-${PROJECT_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
};

// --- the production server --------------------------------------------
// Claim a free port by binding one and releasing it, rather than
// hardcoding: a leftover `next start` from an earlier run silently holds
// the port and serves its OWN, older build, which looks exactly like the
// app being broken.
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

// A real `next build`, into its own output directory.
//
// This has to build rather than reuse the existing .next, because Next
// INLINES every NEXT_PUBLIC_* value into the server and middleware
// bundles at build time — they are not read when the server starts. A
// build made against .env.local would send middleware's getUser() to the
// real Supabase project no matter what is set here, which is exactly why
// the first run of this test redirected to /login without the stand-in
// server ever being contacted.
// Values already present in process.env win over .env.local (@next/env
// never overrides an inherited variable), so the stand-in URL and keys
// above are what get inlined.
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
console.log("build ok — starting `next start`");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
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

function cleanup() {
  try {
    // KILL THE GROUP, NOT THE HANDLE. `npx next start` is npx -> sh ->
    // next-server. SIGKILL to the npx handle leaves the grandchild alive,
    // reparented to init, still holding its port and serving its build.
    // Measured across one full survey of the suite: thirteen orphaned
    // next-server processes, the oldest 41 minutes old. `detached: true`
    // on the spawn puts the whole tree in its own group so this reaches
    // all of it. Enforced by scripts/tests/prodtest-hygiene.test.mjs.
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  } catch {
    /* already gone */
  }
  supa.close();
}

const up = await waitForServer();
if (!up || /EADDRINUSE|Failed to start server/.test(serverLog)) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT} (next start, NODE_ENV=production)`);


const { chromium } = await import("playwright");
const sharp = (await import("sharp")).default;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
});

const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const la = lum(...a), lb = lum(...b);
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
};

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
});
const page = await context.newPage();

try {
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/overview`, { waitUntil: "networkidle", timeout: 60000 });
  // ASSERT THE PAGE. Without a user_onboarding row this redirects to
  // /onboarding, and a census run against that measures the wrong screen
  // while printing the word "Home". That has happened here before.
  const where = await page.evaluate(() => location.pathname);
  checkTrue("the Home page opened", where === "/dashboard/overview", where);

  console.log("\n== 1. every block, and what it costs in vertical space ==");
  // Top-level children of <main>, in document order, with their measured
  // height and where they start. The fold is the viewport height.
  const blocks = await page.evaluate(() => {
    let main = document.querySelector("main");
    if (!main) return [];
    // UNWRAP THE LANDMARK BEFORE MEASURING.
    //
    // The <main> landmark moved from the page into the dashboard layout,
    // so `main` is now a container whose single child is <PageTransition>
    // and whose single grandchild is the page. Its "blocks" were one
    // block, and this suite reported the Home page as having nothing on
    // it — a red test on a page that had not changed.
    //
    // The thing being measured is the page's own top-level rows, so walk
    // down through any chain of single-child wrappers first. Bounded, so
    // a page that genuinely is one deep column cannot loop.
    for (let i = 0; i < 6 && main.children.length === 1; i++) main = main.children[0];
    const out = [];
    const walk = (node, depth) => {
      for (const el of Array.from(node.children)) {
        const r = el.getBoundingClientRect();
        if (r.height < 8) continue;
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 46);
        // One level down when a wrapper holds several cards, so a grid of
        // three stats is three rows and not one.
        const isWrapper = el.children.length > 1 && r.height > 200 && depth < 2;
        if (isWrapper) { walk(el, depth + 1); continue; }
        out.push({ tag: el.tagName.toLowerCase(), h: Math.round(r.height), top: Math.round(r.top + window.scrollY), x: Math.round(r.left), w: Math.round(r.width), text });
      }
    };
    walk(main, 0);
    return out;
  });
  checkTrue(`the page has blocks to measure (${blocks.length})`, blocks.length >= 8, String(blocks.length));

  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const fold = 900;
  console.log(`\n  page height ${pageHeight}px, fold at ${fold}px\n`);
  // X AND WIDTH MATTER AS MUCH AS HEIGHT. Cutting one card out of a
  // two-column row saves NO vertical space at all — the row is as tall as
  // its taller side. A cut list built from heights alone would promise
  // pixels it cannot deliver.
  console.log("     top     h      x     w   fold  content");
  let total = 0;
  for (const b of blocks) {
    total += b.h;
    console.log(`  ${String(b.top).padStart(6)}  ${String(b.h).padStart(4)}  ${String(b.x).padStart(5)}  ${String(b.w).padStart(4)}   ${b.top < fold ? "yes" : "no "}   ${b.text}`);
  }
  console.log(`\n  measured blocks total ${total}px of ${pageHeight}px`);
  console.log(`  a 30% cut is ${Math.round(pageHeight * 0.3)}px`);

  // THE HEIGHT, PINNED — AND THE ESTIMATE THAT WAS WRONG.
  //
  // The brief asked for a 30% cut. The plan that was approved listed the
  // blocks to remove and put the saving at 26%, and that number came from
  // ADDING UP the heights in the table above. It was wrong, and the way
  // it was wrong is why this file prints x and w beside h:
  //
  //   * Recent Entries and Progress shared a ROW. Both were 202px tall
  //     and they sat side by side, so deleting Progress freed 202px of
  //     the "measured blocks total" and ZERO pixels of page height.
  //   * "What's Next?", "AI Coach" and "Active Mission" were merged, not
  //     deleted. Three cards costing 208px became one costing 119px — an
  //     89px saving, not a 208px one.
  //   * The Energy Check-In GREW, from 172px to 179px, because the brief
  //     also asked for scale labels and a line saying what it is for.
  //
  // Measured, after the whole approved list was done: 1632px -> 1629px.
  // Three pixels. What actually moved the number was a LAYOUT change the
  // list did not contain — putting Recent Entries and the check-in in one
  // row, the same trick the old page had been using — which took it to
  // 1398px.
  //
  // 1632 -> 1398 is 234px, or 14.3%. Not 30%, and not 26%. The remaining
  // 1398px is the hero, the composer, Next, the setup ring, the four
  // numbers, the history, the check-in and the sample-data offer; getting
  // to 30% means deleting one of those, and each one answers one of the
  // three questions the brief says the Home is for.
  // 1398 -> 1540, AND THIS IS THE RULE BELOW BEING BROKEN ON PURPOSE.
  //
  // That rule says lower the ceiling when a block goes, never raise it,
  // and it is right about the failure it prevents: a ceiling that rises
  // to meet the page measures nothing. So the raise is itemised rather
  // than asserted.
  //
  // Measured, same build, same 1440x900:
  //   1398  the ceiling before the first screen existed
  //   1596  after merging V4.6-1/2 — the one sentence and the three
  //         runnable examples. +198px, and they are the feature, not
  //         bloat: they are what the page was missing.
  //   1540  after cutting Quick Start and two dead constants. -56px.
  //
  // 142px of the 198 remain, and they are the first screen. Reaching
  // 1398 again means deleting a card nobody asked to delete — the Energy
  // Check-In, the numbers row, or the sample banner — and cutting a
  // feature to satisfy a number is the same dishonesty as raising a
  // number to excuse a feature.
  //
  // 1540 EXACTLY, not a round number with slack: the next block to
  // arrive has to pay for itself the same way, and there is nowhere to
  // hide 40px.
  const HEIGHT_CEILING = 1540;
  checkTrue(
    `the Home is no taller than ${HEIGHT_CEILING}px (measured ${pageHeight}px, was 1632px before V4.6 #10)`,
    pageHeight <= HEIGHT_CEILING,
    `${pageHeight - HEIGHT_CEILING}px taller — lower the ceiling in the same commit that removes the block, never raise it`
  );

  console.log("\n== 2. contrast over the backdrop, nine points, from real pixels ==");
  // NINE POINTS ON TEXT, not nine points on a grid.
  //
  // The first version sampled a fixed 3x3 grid and took the darkest and
  // lightest pixel of a patch around each. Seven of the nine landed on
  // empty panel space, where darkest equals lightest and the ratio is
  // 1:1 — and it reported those as nine contrast failures. That was the
  // measurement being wrong, not the page: 1:1 over an empty patch means
  // "no text here", and reporting it as a failure invents a problem.
  //
  // So the points are chosen from the text the page actually renders,
  // spread down the whole scroll height, and each is measured as the
  // darkest pixel (the ink) against the most COMMON pixel (the ground)
  // inside that element's own box.
  const textBoxes = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (el.children.length > 0) continue;              // leaves only
      const t = (el.textContent ?? "").trim();
      if (t.length < 3) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 8) continue;
      out.push({
        x: Math.round(r.left), y: Math.round(r.top + window.scrollY),
        w: Math.round(r.width), h: Math.round(r.height),
        text: t.slice(0, 30), color: getComputedStyle(el).color,
      });
    }
    return out;
  });
  checkTrue(`the page renders text to measure (${textBoxes.length} leaf nodes)`, textBoxes.length >= 20, String(textBoxes.length));

  // Spread over the whole page rather than clustered in one card.
  const sorted = [...textBoxes].sort((a, b) => a.y - b.y);
  const picks = Array.from({ length: 9 }, (_, i) => sorted[Math.floor((i * (sorted.length - 1)) / 8)]);

  const full = await page.screenshot({ fullPage: true });
  const { data: fd, info: fi } = await sharp(full).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * fi.width + x) * fi.channels;
    return [fd[i], fd[i + 1], fd[i + 2]];
  };
  const measured = [];
  for (const b of picks) {
    if (!b) continue;
    // WHICH PIXEL IS THE INK DEPENDS ON THE THEME, and assuming is how
    // this got measured wrong twice. Taking the DARKEST pixel as the ink
    // is a light-theme assumption; this page is dark, its text is light,
    // and every reading came back 1.01:1 — the darkest pixel in a box of
    // light text on a dark ground is the GROUND.
    //
    // So the ground is whatever the box is mostly made of, and the ink is
    // whatever is furthest from it in luminance. That is right in either
    // theme and assumes neither.
    const counts = new Map();
    const pixels = [];
    for (let y = b.y; y < Math.min(fi.height, b.y + b.h); y++) {
      for (let x = b.x; x < Math.min(fi.width, b.x + b.w); x++) {
        const p = at(x, y);
        counts.set(p.join(","), (counts.get(p.join(",")) ?? 0) + 1);
        pixels.push(p);
      }
    }
    let ground = [0, 0, 0], best = 0;
    for (const [k, n] of counts) if (n > best) { best = n; ground = k.split(",").map(Number); }
    const groundLum = lum(...ground);
    let ink = ground;
    for (const p of pixels) if (Math.abs(lum(...p) - groundLum) > Math.abs(lum(...ink) - groundLum)) ink = p;
    const r = ratio(ink, ground);
    measured.push({ ...b, r, ink, ground });
    console.log(`  y=${String(b.y).padStart(4)}  ${String(r).padStart(6)}:1   ink rgb(${ink})  ground rgb(${ground})   "${b.text}"`);
  }
  const belowAA = measured.filter((m) => m.r < 4.5);
  checkTrue(
    `every one of the nine clears 4.5:1 (${belowAA.length} below)`,
    belowAA.length === 0,
    belowAA.map((m) => `"${m.text}" ${m.r}:1 ink rgb(${m.ink}) on rgb(${m.ground})`).join("; ")
  );

  await page.screenshot({ path: "/tmp/home-audit-1440.png", fullPage: true });
  console.log("\n  full-page screenshot -> /tmp/home-audit-1440.png");

  // -------------------------------------------------------------------
  console.log("\n== 3. the horizontal overflow at 768 and 1024, named ==");
  // WHY THIS IS HERE AND NOT IN layout-stress.prodtest.mjs. That file
  // FINDS the overflow — it reports "el /dashboard/overview @768
  // (782/768), widest: li > a > svg > path" — and that is as far as a
  // widest-element report can take anybody: the arrow at the end of a
  // setup step is where the overflow ENDS, not where it starts. The
  // element that overflows and the element that CAUSES it are almost
  // never the same one, because the cause is an ancestor that refused to
  // shrink.
  //
  // So this walks the containment chain instead: for every element wider
  // than the viewport, it reports the element and the first ancestor
  // that is NOT itself over — the boundary where a box stopped fitting.
  // That is the line to edit.
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const report = await page.evaluate((vw) => {
      const doc = document.documentElement;
      const scrollW = Math.max(doc.scrollWidth, document.body.scrollWidth);
      // THE FULL CLASS LIST, NOT THE FIRST TWO. An earlier version of
      // this probe abbreviated to two classes and reported
      // `a.flex.min-h-[44px]` — which matches four different links on
      // this page, so the report named a shape rather than an element
      // and the chain could not be followed by hand.
      const sel = (el) => {
        const c = (el.className && typeof el.className === "string" ? el.className : "").trim();
        const cs = getComputedStyle(el);
        const box = `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`;
        return `${el.tagName.toLowerCase()} ${box} pos:${cs.position} ov:${cs.overflowX} "${c.slice(0, 150)}"`;
      };
      const offenders = [];
      for (const el of Array.from(document.querySelectorAll("main *"))) {
        const r = el.getBoundingClientRect();
        if (r.right <= vw + 0.5) continue;
        // The first ancestor that DOES fit — the box that should have
        // clipped or shrunk this one and did not.
        let a = el.parentElement, chain = [];
        while (a && a.tagName !== "BODY" && chain.length < 8) {
          const ar = a.getBoundingClientRect();
          chain.push(`${ar.right <= vw + 0.5 ? "FITS" : "OVER"} [${Math.round(ar.left)}..${Math.round(ar.right)}] ${sel(a)}`);
          a = a.parentElement;
        }
        offenders.push({ el: sel(el), right: Math.round(r.right), chain });
      }
      return { scrollW, vw, offenders };
    }, width);
    console.log(`\n  viewport ${width}: scrollWidth ${report.scrollW} (${report.scrollW - width > 0 ? "+" + (report.scrollW - width) : "fits"})`);
    // Only the outermost offenders matter — a child of an overflowing box
    // is a symptom. Deduped by the first fitting ancestor.
    for (const o of report.offenders.slice(0, 4)) {
      console.log(`    reaches ${o.right}: ${o.el}`);
      for (const c of o.chain) console.log(`        ${c}`);
    }
    if (report.offenders.length > 4) console.log(`    ...and ${report.offenders.length - 4} more`);
    if (report.offenders.length === 0) console.log("    nothing overflows");
    checkTrue(
      `the Home fits its viewport at ${width} (scrollWidth ${report.scrollW})`,
      report.scrollW <= width,
      `${report.scrollW - width}px over`
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
} finally {
  await context.close();
  await browser.close();
  cleanup();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
