// "As soon as it loads, the top of the page appears wrong."
//
// WHAT IT ACTUALLY WAS, measured on the shipped production build before
// this suite existed:
//
//   shift 0.00498 @882ms
//      DIV.relative.z-10  {x:45,y:233,w:1190,h:434} -> {x:31,y:233,w:1218,h:434}
//   shift 0.00009 @816ms
//      A.hover:text-orange-400 {x:206,...,w:90} -> {x:209,...,w:96}
//
// The hero was a shrink-to-fit flex item centred in the viewport, so its
// width WAS its own <h1>'s text width. @fontsource ships Inter with
// `font-display: swap`; Inter is 6.48% wider than the system fallback, so
// the moment the webfont arrived the block got 28px wider and slid 14px to
// the left, taking the logo, the headline, the buttons and the footer with
// it. Everything on the page moved, at once, most of a second in. That is
// a small CLS number and a very visible defect — which is exactly why this
// suite does not just assert a CLS budget.
//
// It asserts the thing a person actually sees: the position of the primary
// call to action, and of the headline, MUST BE THE SAME PIXEL before and
// after the font swaps. Nothing on the page may be sized by the text
// inside it.
//
// THE FONT DELAY IS NOT A TRICK. A first-time visitor downloads the
// webfont over a network after the CSS parses; served from localhost that
// is ~0ms, which hides the entire defect. Delaying font responses by
// FONT_DELAY_MS reproduces the ordinary cold load, and nothing else about
// the page is touched.
//
// Deliberately a *.prodtest.mjs: it binds a port, drives a browser and
// runs `next build`. See routes-smoke.prodtest.mjs for why that can never
// go in the build gate.
//
// Run: node scripts/tests/landing-stability.prodtest.mjs
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

const FONT_DELAY_MS = 600;
// Google calls anything under 0.1 "good". This page is held to 0.01,
// because the defect being fixed measured 0.005 and was plainly visible —
// a budget that the bug passes is not a budget.
const CLS_BUDGET = 0.01;

// --- a local stand-in for the Supabase project ------------------------
// The landing page is public and reads nothing, but middleware runs on it
// and calls getUser(). Answering 401 here is the logged-out visitor this
// page is written for.
const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(401, { message: "no session" });
    // GoTrue's provider list — see lib/auth/oauth-providers.ts. Not used by
    // the landing page itself, but /login is what the server-ready probe
    // below fetches.
    if (url.pathname === "/auth/v1/settings") return json(200, { external: { google: false } });
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: null, session: null });
    if (url.pathname.startsWith("/rest/v1/")) return json(200, []);
    json(200, {});
  });
});
const SUPA_PORT = 54341;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
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

// NEXT_PUBLIC_* values are inlined at build time, so this has to build
// rather than reuse .next — see routes-smoke.prodtest.mjs.
if (process.env.SKIP_BUILD !== "1") {
  console.log("running `next build` (production build, not a dev server) ...");
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", (d) => (buildLog += d));
  build.stderr.on("data", (d) => (buildLog += d));
  const code = await new Promise((r) => build.on("close", r));
  if (code !== 0) {
    console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
    supa.close();
    process.exit(1);
  }
  console.log("build ok — starting `next start`");
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
function cleanup() {
  try {
    server.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  supa.close();
}
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
if (!(await waitForServer())) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// buffered:true so shifts that happen before this observer is installed
// are still counted — otherwise the earliest, biggest ones are invisible.
const CLS_SCRIPT = `
window.__cls = 0;
window.__shifts = [];
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    if (e.hadRecentInput) continue;
    window.__cls += e.value;
    window.__shifts.push({
      value: Number(e.value.toFixed(6)),
      at: Math.round(e.startTime),
      sources: (e.sources || []).map((s) => ({
        node: s.node ? s.node.nodeName + (typeof s.node.className === "string" && s.node.className
          ? "." + s.node.className.split(" ").slice(0, 2).join(".") : "") : "?",
        from: s.previousRect ? [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width)] : null,
        to: s.currentRect ? [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width)] : null,
      })),
    });
  }
}).observe({ type: "layout-shift", buffered: true });
`;

// The elements a visitor's eye is on. If any of these move between the
// fallback render and the webfont render, the page "appeared wrong".
const WATCHED = [
  ["headline", "h1"],
  ["primary CTA", 'a[href="/signup"]'],
  ["demo panel", "main section:first-of-type div.rounded-2xl"],
];

async function geometry(page) {
  return page.evaluate((watched) => {
    const out = {};
    for (const [label, selector] of watched) {
      const el = document.querySelector(selector);
      if (!el) {
        out[label] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      out[label] = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }
    return out;
  }, WATCHED);
}

// `motion: "reduce"` is not a way of avoiding a hard case — it is how the
// app behaves for a real, supported preference (globals.css's
// html[data-motion="reduce"], and the demo skips its typing entirely), and
// it is the only state in which a before/after comparison MEANS anything:
// with the demo animating, "the panel is 2px shorter than it was 200ms ago"
// says nothing about the webfont. The animated path is not exempt from
// scrutiny — it is measured by the CLS budget in the second pass, which is
// the number that actually counts an animation's shifts.
async function run(label, width, height, { motion = "no-preference" } = {}) {
  console.log(`\n== ${label} (${width}x${height}, motion: ${motion}) ==`);
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
  });
  await context.addInitScript(CLS_SCRIPT);
  const page = await context.newPage();

  let fontRequests = 0;
  await page.route("**/*.{woff,woff2,ttf,otf}", async (route) => {
    fontRequests++;
    await new Promise((r) => setTimeout(r, FONT_DELAY_MS));
    await route.continue();
  });

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 30000 });
  // Early enough that the delayed webfont cannot have arrived: this is the
  // frame the visitor actually sees first.
  await page.waitForTimeout(Math.round(FONT_DELAY_MS / 3));
  const before = await geometry(page);

  // Long enough for the font to load, hydration to finish, and the demo's
  // first scripted run to complete.
  await page.waitForTimeout(FONT_DELAY_MS + 4200);
  const after = await geometry(page);
  const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));

  checkTrue(`the webfont really was delayed (${fontRequests} font requests)`, fontRequests > 0);

  if (motion === "reduce") {
    for (const [name] of WATCHED) {
      checkTrue(`${name}: present`, before[name] !== null && after[name] !== null);
      check(`${name}: does not move when the font swaps`, before[name], after[name]);
    }
  }

  checkTrue(`CLS ${cls.toFixed(5)} <= ${CLS_BUDGET}`, cls <= CLS_BUDGET, JSON.stringify(shifts, null, 1));

  // 375px is the narrowest phone this app targets; a landing page that
  // slides sideways under a thumb reads as broken however good the copy is.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  checkTrue(
    `no horizontal overflow (${overflow.scrollWidth}/${overflow.clientWidth})`,
    overflow.scrollWidth <= overflow.clientWidth + 1,
    JSON.stringify(overflow)
  );

  check("no console errors", consoleErrors.filter((e) => !/favicon|net::ERR_/i.test(e)), []);

  await context.close();
  return { cls, shifts };
}

// Pass 1 per viewport: the font swap, with nothing else moving.
await run("desktop", 1280, 900, { motion: "reduce" });
await run("phone", 375, 812, { motion: "reduce" });
// Pass 2 per viewport: everything the page really does on load — the
// webfont AND the demo's own animation — held to the same budget.
await run("desktop", 1280, 900);
await run("phone", 375, 812);

console.log("\n== what the page says ==");
// The rules the rewrite was for, asserted so they cannot quietly erode.
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 30000 });

const h1 = (await page.locator("h1").first().innerText()).trim();
checkTrue(`headline is under 8 words ("${h1}")`, h1.split(/\s+/).length < 8);

// ONE call to action. Log in is navigation for people who already have an
// account, not a second thing being asked of a visitor — it is counted
// separately and must stay a plain link, not a button.
const signupLinks = await page.locator('a[href="/signup"]').count();
const loginLinks = await page.locator('a[href="/login"]').count();
checkTrue(`every CTA points at signup (${signupLinks} of them)`, signupLinks >= 1);
checkTrue(`log in is present once as navigation (${loginLinks})`, loginLinks === 1);

// The jargon the rewrite exists to remove. A visitor who reads "AI
// Operating System" learns nothing they did not already assume.
const bodyText = (await page.locator("body").innerText()).toLowerCase();
for (const banned of ["operating system", "orchestration", "workflow automation", "llm"]) {
  checkTrue(`no jargon: "${banned}"`, !bodyText.includes(banned), bodyText.slice(0, 400));
}

// The demo has to be above the problem section, which has to be above the
// proof — problem before solution, demo before either.
const order = await page.evaluate(() => {
  const y = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY;
  };
  return {
    h1: y("h1"),
    demo: y("main section:first-of-type ul"),
    problem: y("main dl"),
    proof: y("main figure"),
  };
});
checkTrue("the demo sits directly under the headline", order.demo > order.h1 && order.demo < order.problem, JSON.stringify(order));
checkTrue("the problem comes before the proof", order.problem < order.proof, JSON.stringify(order));

// Every proof section: exactly one picture and exactly one sentence.
// Scrolled through first — the pictures are loading="lazy", so below the
// fold they legitimately have not been fetched yet and `complete` would be
// false for a page with nothing wrong with it.
await page.evaluate(async () => {
  for (const f of document.querySelectorAll("main figure")) {
    f.scrollIntoView();
    await new Promise((r) => setTimeout(r, 250));
  }
  window.scrollTo(0, 0);
});
await page.waitForLoadState("networkidle");
const figures = await page.evaluate(() =>
  [...document.querySelectorAll("main figure")].map((f) => ({
    images: f.querySelectorAll("img").length,
    caption: (f.querySelector("figcaption")?.textContent ?? "").trim(),
    sized: [...f.querySelectorAll("img")].every(
      (img) => img.getAttribute("width") && img.getAttribute("height")
    ),
    alt: [...f.querySelectorAll("img")].every((img) => (img.getAttribute("alt") ?? "").length > 20),
    // An <img> that never resolved has naturalWidth 0 — a broken picture
    // on the page whose entire argument is the pictures.
    loaded: [...f.querySelectorAll("img")].every((img) => img.complete && img.naturalWidth > 0),
  }))
);
checkTrue(`three proof sections (${figures.length})`, figures.length === 3);
for (const [i, f] of figures.entries()) {
  check(`figure ${i + 1}: exactly one picture`, f.images, 1);
  checkTrue(`figure ${i + 1}: the picture actually loaded`, f.loaded);
  checkTrue(`figure ${i + 1}: width and height are declared`, f.sized);
  checkTrue(`figure ${i + 1}: has real alt text`, f.alt);
  // One sentence. Counting terminal punctuation rather than length: the
  // rule is "one sentence", not "few words".
  const sentences = (f.caption.match(/[.!?。！？](\s|$)/g) ?? []).length;
  checkTrue(`figure ${i + 1}: caption is one sentence ("${f.caption}")`, sentences === 1);
}

// The demo must say it is an example. An unlabelled scripted run that
// looks live is the same dishonesty the old copy had.
checkTrue(
  "the demo is labelled as a recorded example",
  /example/i.test(await page.locator("main section:first-of-type").first().innerText())
);

await page.close();
await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
