#!/usr/bin/env node
/*
 * DOES A GREEK PHONE WITH NO CONNECTION SEE A GREEK PAGE?
 *
 * Everything else about this fix is a statement: the page resolves through
 * next-intl (a check on the source), the three keys exist in ten languages
 * (a check on the catalogue), the worker matches with ignoreVary and
 * re-fetches on a language change (checks on two files). None of them is
 * the thing the owner asked for, which is a page in their own language when
 * the network is gone.
 *
 * So this one does it. A real Chromium, a real build, a real service worker
 * install, the network actually cut, and a navigation to a URL that was
 * never cached — the exact path that reaches the last-resort shell.
 *
 * WHY IT IS AN .itest AND NOT A GATE. It builds the app and drives a
 * browser: minutes, a port and a writable node_modules. `next build` runs
 * test:unit, and a suite that needs those inside a build is a coin flip
 * rather than a gate — that mistake already cost one Vercel deploy.
 *
 *   SKIP_BUILD=1  reuse an existing .next instead of building
 *
 * Run: node scripts/tests/offline-shell-language.itest.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { chromiumPath } from "./lib/chromium.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const PORT = 3417;
const BASE = `http://127.0.0.1:${PORT}`;
const ENV = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "probe",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "probe",
};

if (!process.env.SKIP_BUILD) {
  console.log("building ...");
  execFileSync("npx", ["next", "build"], { env: ENV, stdio: "inherit" });
}

console.log(`starting next start on ${PORT} ...`);
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: ENV, stdio: "pipe" });
const stop = () => {
  try {
    server.kill("SIGTERM");
  } catch {
    // already gone
  }
};
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/offline`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const up = await waitForServer();
check("the built app is serving", up);
if (!up) {
  stop();
  process.exit(1);
}

// THE SHARED RESOLVER, not process.env directly: the bundled build lives
// under a versioned directory Playwright's own default does not find here,
// and every other browser suite in this repo already asks lib/chromium.mjs.
const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--ssl-version-max=tls1.2"],
});

// THE SENTENCES, READ FROM THE CATALOGUE rather than typed here. A literal
// would make this test pass on the day somebody changed the Greek and
// forgot the page, which is the failure it exists to catch.
const el = JSON.parse(await (await import("node:fs/promises")).readFile("messages/el.json", "utf8"));
const EL_TITLE = el.common.offline.title;
const EL_RETRY = el.common.offline.retry;
const EL_BODY_START = el.common.offline.lastResortBody.slice(0, 30);

try {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "el", url: BASE },
  ]);
  const page = await context.newPage();

  // 1. A visit, then the worker.
  //
  // THIS TEST REGISTERS IT ITSELF, and that is worth stating rather than
  // hiding: components/pwa/pwa-provider.tsx mounts in the DASHBOARD layout
  // only, so the app registers the worker for signed-in users and this
  // harness has no Supabase to sign in against. That the app registers it
  // at all is pwa.test.mjs's assertion; what is unproven here and nowhere
  // else is what the worker then DOES with a language, which is what
  // follows. (It also means the offline shell reaches signed-in users
  // only — an anonymous visitor never installs one. That is a product
  // decision, not a defect, and it is now written down.)
  await page.goto(`${BASE}/offline`, { waitUntil: "load" });
  const registered = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    try {
      await navigator.serviceWorker.register("/sw.js?build=itest");
      const reg = await navigator.serviceWorker.ready;
      return reg ? "ready" : "none";
    } catch (e) {
      return `failed: ${String(e).slice(0, 80)}`;
    }
  });
  check("the service worker installs and activates", registered === "ready", registered);

  // The install handler caches /offline with its own fetch; give it a
  // moment to finish before the network is cut.
  const cached = await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      const hit = await caches.match("/offline", { ignoreVary: true });
      if (hit) return await hit.text();
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  });
  check("...and the offline shell is in the cache", typeof cached === "string" && cached.length > 200);

  // 2. THE ACTUAL QUESTION. Network gone, navigate somewhere never visited.
  await context.setOffline(true);
  await page.goto(`${BASE}/dashboard/a-page-this-browser-never-opened`, { waitUntil: "load" }).catch(() => {});
  const body = await page.evaluate(() => document.body.innerText);
  const lang = await page.evaluate(() => document.documentElement.lang);

  check(
    `the offline page is served with no network (lang=${lang})`,
    /εκτός σύνδεσης|offline/i.test(body),
    body.slice(0, 200)
  );
  check(`...in Greek: the heading (${JSON.stringify(EL_TITLE)})`, body.includes(EL_TITLE), body.slice(0, 200));
  check("...in Greek: the explanation", body.includes(EL_BODY_START), body.slice(0, 300));
  check(`...in Greek: the button (${JSON.stringify(EL_RETRY)})`, body.includes(EL_RETRY), body.slice(0, 200));
  check("...and no English sentence survived", !/You're offline|Try again/i.test(body), body.slice(0, 200));
  check('...with lang="el" on the document', lang === "el", lang);

  // 3. AND THE LANGUAGE CHANGE, which is the half a cached page cannot do
  // on its own: the shell is frozen at install time until something asks
  // the worker to re-fetch it.
  await context.setOffline(false);
  await page.goto(`${BASE}/offline`, { waitUntil: "load" });
  await context.clearCookies();
  await context.addCookies([{ name: "NEXT_LOCALE", value: "de", url: BASE }]);
  const refreshed = await page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller ? "controlled" : "no-controller";
    navigator.serviceWorker.controller?.postMessage({ type: "refresh-offline" });
    for (let i = 0; i < 40; i++) {
      const hit = await caches.match("/offline", { ignoreVary: true });
      const text = hit ? await hit.text() : "";
      if (text.includes("Verbindung")) return "de";
      await new Promise((r) => setTimeout(r, 250));
    }
    const keys = await caches.keys();
    const entries = [];
    for (const k of keys) {
      const c = await caches.open(k);
      entries.push(`${k}:${(await c.keys()).map((r) => new URL(r.url).pathname).join("|")}`);
    }
    return `${controller} / still-old / ${entries.join(" ;; ").slice(0, 300)}`;
  });
  check(
    "a language change re-fetches the shell, so it is not frozen at install",
    refreshed === "de",
    `cache reported ${refreshed} — the worker's refresh-offline handler did not replace it`
  );

  await context.setOffline(true);
  await page.goto(`${BASE}/dashboard/another-page-never-opened`, { waitUntil: "load" }).catch(() => {});
  const germanBody = await page.evaluate(() => document.body.innerText);
  check(
    "...and the next offline navigation shows the new language",
    /Verbindung|offline/i.test(germanBody) && !germanBody.includes(EL_TITLE),
    germanBody.slice(0, 200)
  );
} finally {
  await browser.close();
  stop();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
