// Does the PWA actually work? Asked of a real browser, not of the source.
//
// manifest.ts, sw.js, pwa-provider.tsx and push-notification-settings.tsx
// were written and never verified end to end. scripts/tests/pwa.test.mjs
// greps the source for the right strings, which proves the code was
// WRITTEN — not that Chromium accepts it. Those are different claims, and
// the difference is where every one of the findings below was hiding.
//
// So this file asks the browser:
//   1. Does Chromium's OWN manifest parser accept the manifest?
//   2. Does every icon URL in it actually resolve?
//   3. Does the service worker install, activate and control the page?
//   4. With the network cut, does a visited page come back? Does /offline?
//   5. Does a push message reach the notification the user would see?
//
// Run: node scripts/tests/pwa-audit.prodtest.mjs
//      SKIP_BUILD=1 node scripts/tests/pwa-audit.prodtest.mjs   (reuse .next)
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { startMockSupabase } from "../lib/mock-supabase.mjs";

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
function note(text) {
  console.log(`  ....  ${text}`);
}

const supa = await startMockSupabase({ port: 54341 });
const SUPA_URL = supa.url;
const ANON_KEY = supa.anonKey;
const SERVICE_KEY = supa.serviceKey;
const AUTH_COOKIE = supa.authCookie;

// A FIXED port: NEXT_PUBLIC_SITE_URL is inlined at build time, and with
// SKIP_BUILD=1 the reused build has to be served from the same origin it
// was built for.
const PORT = 38471;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
  // A published key, so the push settings panel renders its real UI
  // instead of "not configured". This is the VAPID public key from the
  // web-push README example — public by definition, and never used to
  // send anything here.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
};

// THE PORT MUST BE FREE, and this has to be checked rather than assumed.
//
// The port is fixed (NEXT_PUBLIC_SITE_URL is inlined at build time), so a
// `next start` left behind by an earlier run keeps answering on it — and
// `next start` fails quietly while the OLD server serves the OLD build.
// That is not a hypothetical: the first run of this file against the fixed
// manifest reported /icon-192.png as a 404, no service worker and a
// ChunkLoadError, all of which were true of a build from an hour earlier
// and none of which were true of the code under test. A stale server must
// stop the run, not colour it.
{
  const taken = await new Promise((resolve) => {
    const req = http.get(`${ORIGIN}/`, () => resolve(true));
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
  if (taken) {
    console.log(
      `  FAIL  port ${PORT} is already serving something.\n` +
        "        An earlier run's `next start` is still alive; this test would\n" +
        "        have measured ITS build, not this one. Kill it and re-run:\n" +
        "          pkill -f 'next-server' ; pkill -f 'next start'"
    );
    supa.close();
    process.exit(1);
  }
}

if (!process.env.SKIP_BUILD) {
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
}

// detached, so the whole PROCESS GROUP can be killed.
//
// `npx next start` is a wrapper around a `next-server` child. SIGTERM to
// the wrapper does not reliably reach the child, which then keeps the
// fixed port and serves its build to the NEXT run — the exact stale-server
// failure the guard above exists to catch. Killing the group is what stops
// it being left behind in the first place.
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function get(path) {
  return new Promise((resolve) => {
    http
      .get(`${ORIGIN}${path}`, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        );
      })
      .on("error", () => resolve({ status: 0, headers: {}, body: Buffer.alloc(0) }));
  });
}

for (let i = 0; i < 120; i++) {
  const r = await get("/");
  if (r.status > 0) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log(`production server up on :${PORT}\n`);

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

let browser;
try {
  // =====================================================================
  console.log("== 1. the manifest, as Chromium itself reads it ==");
  // =====================================================================
  const manifestRes = await get("/manifest.webmanifest");
  check(`/manifest.webmanifest is served (${manifestRes.status})`, manifestRes.status === 200);
  let manifest = null;
  let manifestParseError = null;
  try {
    manifest = JSON.parse(manifestRes.body.toString("utf8"));
  } catch (err) {
    manifestParseError = err;
  }
  // ONE CHECK, ON THE PARSE ITSELF. It was two: a FAIL in the catch and a
  // `check("it is valid JSON", true)` in the `if (manifest)` branch. The
  // second asserted a literal — it could not go red — and the pair left a
  // hole between them: a body of exactly `null` parses fine, so neither
  // branch ran and the manifest was reported on by NOTHING at all.
  check("it is valid JSON", manifestParseError === null, manifestParseError ? String(manifestParseError) : "");
  if (manifest) {
    check("has a name", typeof manifest.name === "string" && manifest.name.length > 0, manifest.name);
    check("has a short_name", typeof manifest.short_name === "string");
    check("display: standalone", manifest.display === "standalone");
    check("has a start_url", typeof manifest.start_url === "string", manifest.start_url);

    // The four the owner asked about, plus the three Chromium wants for a
    // first-class install.
    for (const field of ["id", "screenshots", "share_target", "file_handlers", "launch_handler", "lang", "dir"]) {
      check(`manifest declares \`${field}\``, manifest[field] !== undefined, "absent");
    }
  }

  // =====================================================================
  console.log("\n== 2. every icon the manifest names actually resolves ==");
  // =====================================================================
  const icons = manifest?.icons ?? [];
  check(`the manifest lists icons (${icons.length})`, icons.length > 0);
  let has192 = false;
  let has512any = false;
  let hasMaskable = false;
  for (const icon of icons) {
    const res = await get(icon.src);
    const ok = res.status === 200;
    check(`icon ${icon.src} → ${res.status}`, ok, ok ? undefined : `declared ${icon.sizes} ${icon.type}`);
    if (!ok) continue;
    const size = pngSize(res.body);
    const declared = String(icon.sizes ?? "");
    if (size) {
      const matches = declared === "any" || declared.split(/\s+/).includes(`${size.w}x${size.h}`);
      check(
        `   ...and is really ${size.w}x${size.h} (declared ${declared})`,
        matches,
        `the manifest says ${declared}, the file is ${size.w}x${size.h}`
      );
      const purpose = String(icon.purpose ?? "any");
      if (purpose.includes("any")) {
        if (size.w >= 192) has192 = true;
        if (size.w >= 512) has512any = true;
      }
      if (purpose.includes("maskable")) hasMaskable = true;
    } else if (declared === "any" && String(icon.type).includes("svg")) {
      note(`${icon.src} is an SVG — sizes:"any" is legal but Chromium does not count it toward installability`);
    }
  }
  check("a >=192px purpose:any raster icon exists (Chromium installability)", has192);
  check("a >=512px purpose:any raster icon exists (rich install dialog)", has512any);
  check("a maskable icon exists", hasMaskable);

  // =====================================================================
  console.log("\n== 3. the service worker installs, activates and controls ==");
  // =====================================================================
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    baseURL: ORIGIN,
    serviceWorkers: "allow",
    permissions: ["notifications"],
  });
  await context.addCookies([{ ...AUTH_COOKIE, url: ORIGIN }]);
  const page = await context.newPage();
  // CONSOLE ERRORS ARE COUNTED IN A QUIET WINDOW, and only there.
  //
  // Two things in this file produce console errors that say nothing about
  // the app: section 5 cuts the network on purpose, and every section
  // drives page.goto() far faster than a person would — which aborts the
  // sidebar prefetches Next has in flight, logging "Failed to fetch RSC
  // payload" for each. Both are the TEST's doing. So collection is off by
  // default and switched on for one settled window at the end, with no
  // programmatic navigation inside it.
  let counting = false;
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && counting) consoleErrors.push(m.text());
  });

  await page.goto("/dashboard/overview", { waitUntil: "load" });
  // The dashboard can still redirect after load (onboarding, locale), and
  // an evaluate() that lands mid-navigation dies with "execution context
  // destroyed" — which reads like a PWA failure and is not one.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1500);
  note(`landed on ${page.url()}`);

  const swState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return { supported: false };
    const reg = await Promise.race([
      navigator.serviceWorker.ready.then((r) => r),
      new Promise((r) => setTimeout(() => r(null), 20000)),
    ]);
    if (!reg) return { supported: true, ready: false };
    return {
      supported: true,
      ready: true,
      scope: reg.scope,
      active: reg.active?.state ?? null,
      controlled: Boolean(navigator.serviceWorker.controller),
    };
  });
  check("the browser supports service workers", swState.supported === true);
  check("a registration became ready", swState.ready === true, JSON.stringify(swState));
  check("its worker is activated", swState.active === "activated", String(swState.active));
  check("the scope is the whole origin", String(swState.scope).endsWith("/"), swState.scope);

  // Chromium's own manifest verdict, via the protocol the DevTools
  // Application panel uses. `errors` here is the browser's opinion, not
  // this file's.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const appManifest = await cdp.send("Page.getAppManifest");
  const critical = (appManifest.errors ?? []).filter((e) => e.critical);
  check(
    `Chromium's manifest parser reports no CRITICAL errors (${critical.length})`,
    critical.length === 0,
    (appManifest.errors ?? []).map((e) => `${e.critical ? "CRITICAL" : "warn"}: ${e.message}`).join("\n        ")
  );
  for (const e of appManifest.errors ?? []) {
    if (!e.critical) note(`Chromium warns: ${e.message}`);
  }

  // =====================================================================
  console.log("\n== 4. beforeinstallprompt ==");
  // =====================================================================
  const bip = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let fired = false;
        window.addEventListener("beforeinstallprompt", () => {
          fired = true;
        });
        setTimeout(() => resolve(fired), 4000);
      })
  );
  if (bip) {
    // A NOTE, NOT A CHECK. Whether the event fires is a property of the
    // BROWSER, not of the site: it does not fire in headless Chromium at
    // all (see the else branch). A `check(..., true)` here was a PASS line
    // that could not go red, sitting under a name that reads like a
    // verified fact. The checkable part is sections 1-3.
    note("beforeinstallprompt fired in this browser");
  } else {
    note("beforeinstallprompt did NOT fire — headless Chromium does not run the");
    note("install pipeline, so this is NOT evidence either way. What section 1-3");
    note("proved mechanically (manifest accepted, icons resolve, SW controls the");
    note("page) is the criteria list; that is the checkable part.");
  }

  // =====================================================================
  console.log("\n== 5. offline — the part that either works or does not ==");
  // =====================================================================
  // Warm the caches: visit a page while online so the SW stores it.
  await page.goto("/dashboard/overview", { waitUntil: "networkidle" }).catch(() => undefined);
  const warmed = await page.evaluate(async () => {
    const names = await caches.keys();
    const out = {};
    for (const n of names) {
      const c = await caches.open(n);
      out[n] = (await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
    }
    return out;
  });
  const allCached = Object.values(warmed).flat();
  note(`caches: ${Object.keys(warmed).join(", ") || "(none)"}`);
  for (const [name, keys] of Object.entries(warmed)) note(`  ${name}: ${keys.join(" , ")}`);
  check(`the offline shell page is cached`, allCached.some((u) => u === "/offline"), allCached.join(" "));
  check(
    `the visited dashboard page is cached`,
    allCached.some((u) => u.startsWith("/dashboard/overview")),
    allCached.join(" ")
  );

  // A cached page HYDRATES, and Next's router then tries to refresh it.
  // Offline that refresh fails and the router starts its own navigation,
  // which aborts whatever page.goto() is doing — net::ERR_ABORTED. That is
  // the TEST racing the app, not the app failing, so each offline
  // navigation gets a settle and up to three attempts, and the attempt
  // count is printed: if a page only ever loads on attempt 3, that is a
  // finding, and if it loads on attempt 1 there was never a race.
  async function gotoOffline(path) {
    let last = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.waitForTimeout(700);
      const r = await page
        .goto(path, { waitUntil: "domcontentloaded", timeout: 20000 })
        .then(() => ({ ok: true, attempt }))
        .catch((e) => ({ ok: false, attempt, err: String(e).split("\n")[0].slice(0, 160) }));
      if (r.ok) return r;
      last = r.err;
      if (!/ERR_ABORTED/.test(last)) return r;
    }
    return { ok: false, attempt: 3, err: last };
  }

  await context.setOffline(true);
  const offlineNav = await gotoOffline("/dashboard/overview");
  check(
    `a visited page still loads with the network cut (attempt ${offlineNav.attempt})`,
    offlineNav.ok,
    offlineNav.err
  );
  if (offlineNav.ok) {
    const text = await page.evaluate(() => document.body?.innerText?.slice(0, 200) ?? "");
    check("...and it rendered something, not an error string", text.trim().length > 0, JSON.stringify(text));
  }

  // Before blaming the fallback, confirm the SIMPLEST offline navigation:
  // straight to the page that is definitely in the shell cache.
  const directOffline = await gotoOffline("/offline");
  check(
    `navigating straight to /offline works with no network (attempt ${directOffline.attempt})`,
    directOffline.ok,
    directOffline.err
  );

  const unseenNav = await gotoOffline("/dashboard/finance");
  check(
    `a NEVER-visited page falls back to the offline shell (attempt ${unseenNav.attempt})`,
    unseenNav.ok,
    unseenNav.err
  );
  if (!unseenNav.ok) {
    // WHY it failed matters more than that it did. The cached /offline
    // response is the suspect: a service worker may not answer a
    // navigation with a response that was itself redirected.
    await context.setOffline(false);
    await page.goto("/dashboard/overview", { waitUntil: "domcontentloaded" }).catch(() => undefined);
    const diag = await page.evaluate(async () => {
      const out = [];
      for (const n of await caches.keys()) {
        const c = await caches.open(n);
        const hit = await c.match("/offline");
        if (hit) {
          out.push({
            cache: n,
            status: hit.status,
            type: hit.type,
            redirected: hit.redirected,
            url: hit.url,
            body: (await hit.clone().text()).slice(0, 120),
          });
        }
      }
      const direct = await fetch("/offline", { redirect: "follow" });
      return { cached: out, live: { status: direct.status, url: direct.url, redirected: direct.redirected } };
    });
    note("cached /offline: " + JSON.stringify(diag.cached));
    note("live    /offline: " + JSON.stringify(diag.live));
    await context.setOffline(true);
  }
  if (unseenNav.ok) {
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    check(
      "...and that fallback is the offline page, not a blank 503",
      body.length > 20 && !/^Offline$/.test(body.trim()),
      JSON.stringify(body.slice(0, 160))
    );
  }
  await context.setOffline(false);
  // A FRESH DOCUMENT before counting console errors again.
  //
  // The offline page still rendered the sidebar, and Next prefetched every
  // link on it; those prefetches reject after the network comes back and
  // land as console errors belonging to the deliberate part of this test.
  // Navigating discards the old document and its pending prefetches, so
  // what section 10 counts is genuinely the online app.
  await page.goto("/dashboard/overview", { waitUntil: "load" }).catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  // =====================================================================
  console.log("\n== 6. push — does a message become a notification? ==");
  // =====================================================================
  await cdp.send("ServiceWorker.enable");
  let registrationId = null;
  const gotReg = new Promise((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", (ev) => {
      for (const r of ev.registrations ?? []) {
        if (r.scopeURL?.startsWith(ORIGIN) && !r.isDeleted) {
          registrationId = r.registrationId;
          resolve(true);
        }
      }
    });
    setTimeout(() => resolve(false), 5000);
  });
  await page.goto("/dashboard/overview", { waitUntil: "load" }).catch(() => undefined);
  await gotReg;
  check("the service worker registration is addressable", Boolean(registrationId), String(registrationId));

  if (registrationId) {
    const payload = JSON.stringify({
      title: "Agent finished",
      body: "Your competitor sweep is ready.",
      url: "/dashboard/agents",
      tag: "agent_results",
    });
    let delivered = true;
    try {
      await cdp.send("ServiceWorker.deliverPushMessage", {
        origin: ORIGIN,
        registrationId,
        data: payload,
      });
    } catch (err) {
      delivered = false;
      note(`deliverPushMessage threw: ${String(err).slice(0, 200)}`);
    }
    check("a push message can be delivered to the worker", delivered);

    if (delivered) {
      const shown = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        for (let i = 0; i < 40; i++) {
          const list = await reg.getNotifications();
          if (list.length > 0) {
            return list.map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data }));
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return [];
      });
      check(
        "...and the worker turned it into a notification",
        shown.length > 0,
        shown.length === 0 ? "registration.getNotifications() stayed empty" : undefined
      );
      if (shown.length > 0) {
        check("the notification carries the sent title", shown[0].title === "Agent finished", shown[0].title);
        check("the notification carries the sent body", shown[0].body === "Your competitor sweep is ready.", shown[0].body);
        check(
          "the click target came through, so it can open the right page",
          shown[0].data?.url === "/dashboard/agents",
          JSON.stringify(shown[0].data)
        );
      }
    }
  }

  // =====================================================================
  console.log("\n== 7. the push settings panel, as the user meets it ==");
  // =====================================================================
  await page.goto("/dashboard/settings", { waitUntil: "load" }).catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1200);
  note(`settings landed on ${page.url()}`);
  const panel = await page.evaluate(() => {
    const heads = [...document.querySelectorAll("h2")];
    const h = heads.find((e) => /notification|ειδοποι/i.test(e.textContent ?? ""));
    if (!h) return { found: false, heads: heads.map((e) => e.textContent) };
    const box = h.closest("div")?.parentElement;
    return { found: true, text: (box?.innerText ?? "").slice(0, 400) };
  });
  check("the push panel is on the settings page", panel.found, JSON.stringify(panel.heads ?? "").slice(0, 300));
  if (panel.found) note(panel.text.replace(/\n/g, " | ").slice(0, 240));

  // =====================================================================
  console.log("\n== 8. an iPhone, which is the case that was broken ==");
  // =====================================================================
  // Safari never fires beforeinstallprompt, so the old provider — whose
  // entire invitation lived inside that handler — could not offer an
  // iPhone anything. This drives a real Chromium wearing an iPhone's user
  // agent and touch profile: what is being proved is that the DECISION
  // reaches the iOS branch and renders the three taps, not that WebKit
  // behaves like Chromium.
  const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

  async function visitAs(userAgent, opts = {}) {
    const ctx = await browser.newContext({
      baseURL: ORIGIN,
      serviceWorkers: "allow",
      userAgent,
      viewport: opts.viewport ?? { width: 390, height: 844 },
      isMobile: opts.isMobile ?? true,
      hasTouch: opts.hasTouch ?? true,
      deviceScaleFactor: 3,
    });
    await ctx.addCookies([{ ...AUTH_COOKIE, url: ORIGIN }]);
    // The invitation deliberately waits for a THIRD genuine visit — a
    // prompt on first sight is the classic way to teach someone to dismiss
    // it. Seeding two past visits is how the test reaches the third
    // without waiting a day between them.
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "ionexa-install-prompt",
          JSON.stringify({
            visits: 2,
            lastVisitAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
            dismissedAt: 0,
            installed: false,
          })
        );
      } catch {}
    });
    const p = await ctx.newPage();
    await p.goto("/dashboard/overview", { waitUntil: "load" });
    await p.waitForLoadState("networkidle").catch(() => undefined);
    return { ctx, page: p };
  }

  {
    const { ctx, page: phone } = await visitAs(IPHONE_UA);
    const card = phone.locator('[data-testid="install-invitation"]');
    const appeared = await card
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check("an iPhone IS invited to install", appeared);

    if (appeared) {
      check(
        "...through the iOS surface, not a button that would do nothing",
        (await card.getAttribute("data-surface")) === "ios"
      );
      check(
        "the steps are hidden until asked for",
        (await phone.locator('[data-testid="ios-install-steps"]').count()) === 0
      );
      await phone.locator('[data-testid="install-show-how"]').click();
      const steps = phone.locator('[data-testid="ios-install-steps"]');
      check(
        "...and 'Show me how' reveals them",
        await steps.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)
      );
      const text = await steps.innerText();
      check("three numbered taps are listed", (text.match(/\n?\s*[123]\s/g) ?? []).length >= 3, text.slice(0, 200));
      check("Share is named", /share/i.test(text), text.slice(0, 200));
      check("Add to Home Screen is named", /home screen/i.test(text), text.slice(0, 200));
      check(
        "and what iOS loses until then is stated — push and 7-day eviction",
        /notification/i.test(text) && /7/.test(text),
        text.slice(0, 400)
      );
    }
    await ctx.close();
  }

  {
    // A desktop browser that never fires the event must be offered
    // NOTHING, rather than iOS instructions that lead nowhere.
    const DESKTOP_UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0";
    const { ctx, page: desktop } = await visitAs(DESKTOP_UA, {
      viewport: { width: 1280, height: 800 },
      isMobile: false,
      hasTouch: false,
    });
    await desktop.waitForTimeout(3000);
    check(
      "a desktop with no install event is offered nothing (not dead instructions)",
      (await desktop.locator('[data-testid="install-invitation"]').count()) === 0
    );
    await ctx.close();
  }

  // =====================================================================
  console.log("\n== 9. the device reported itself, so the decision has data ==");
  // =====================================================================
  const telemetry = supa.hits.filter((h) => h.includes("pwa_client_stats"));
  check(
    `the browser wrote a pwa_client_stats row (${telemetry.length} calls)`,
    telemetry.length > 0,
    supa.hits.slice(-8).join("\n        ")
  );

  console.log("\n== 10. console errors, in a settled window ==");
  // Land once, let everything finish, THEN start listening — and do not
  // navigate again. What this counts is an app sitting still on a page,
  // which is what a person actually does.
  await page.goto("/dashboard/overview", { waitUntil: "load" }).catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(2000);
  counting = true;
  await page.waitForTimeout(4000);
  const real = consoleErrors.filter((t) => !/favicon/i.test(t));
  check(`no console errors in 4 settled seconds (${real.length})`, real.length === 0, real.slice(0, 6).join("\n        "));
} catch (err) {
  check("the audit ran to the end", false, String(err).slice(0, 600));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  // SIGTERM the group, then make sure. `npx next start` is a wrapper around
  // a next-server child; a wrapper that exits without taking its child down
  // leaves the fixed port held, and the next run measures THAT build.
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try {
      process.kill(-server.pid, signal);
    } catch {
      try {
        server.kill(signal);
      } catch {
        // Already gone.
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  supa.close();
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
