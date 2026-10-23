/*
 * THE LAYOUT ITSELF, IN A REAL BROWSER (the owner's fourth message,
 * 2026-10-23: "ΒΗΜΑ 3: TEST ΠΟΥ ΤΟ ΑΠΟΔΕΙΚΝΥΕΙ").
 *
 * Run: node scripts/tests/coding-layout.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/coding-layout.prodtest.mjs
 *
 * The owner asked for a browser test that goes RED on the shape he kept
 * describing — a vertical line between the two areas, a field narrower
 * than 700px on a 1440px screen, the project row under the field instead
 * of above it, the power control outside the field — and GREEN on the
 * fix. Checked out against main as it stood before this round (merge
 * #352, commit cfd996d7), this file fails every one of its own checks;
 * against this branch, it passes all of them. Both runs are in the PR
 * body.
 *
 * ONE PRODUCTION BUILD, ONE SIGNED-IN SESSION (scripts/lib/mock-
 * supabase.mjs — the same stand-in every other *.prodtest.mjs in this
 * tree already uses), desktop and phone.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

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

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54372,
  tableRows: {
    code_sessions: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        operation: "generate",
        title: "Συνάρτηση περιθωρίου",
        input: "function margin() {}",
        language: "javascript",
        target_language: null,
        output: "function margin() {}",
        status: "done",
        source: "run",
        created_at: "2026-10-23T08:00:00Z",
        updated_at: "2026-10-23T08:00:00Z",
      },
    ],
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
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
};

const servers = [];
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
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => {
        const r = http.get(`${origin}/api/health`, () => res());
        r.on("error", rej);
      });
      return origin;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("the production server did not start");
}

// Reads borderInlineEndWidth/borderInlineStartWidth rather than
// borderRightWidth/borderLeftWidth so the check means the same thing
// whichever writing direction the page is in — the session that signs
// this run is always "el" (Greek, left-to-right), but the property name
// should say what it actually checks.
async function inlineBorder(locator, side) {
  return locator.evaluate((el, s) => getComputedStyle(el)[s], side === "end" ? "borderInlineEndWidth" : "borderInlineStartWidth");
}

// null, not a hang or a thrown TimeoutError, when the element this round
// of the layout does not have at all — older code than this file is
// exactly the case this test exists to fail ON, not crash on.
async function boxOrNull(locator) {
  if ((await locator.count()) === 0) return null;
  try {
    return await locator.boundingBox({ timeout: 2000 });
  } catch {
    return null;
  }
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
  const ORIGIN = await start(base);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [{ ...supa.authCookie, url: ORIGIN, httpOnly: false, secure: false, sameSite: "Lax" }, { name: "NEXT_LOCALE", value: "el", url: ORIGIN }].map(
        ({ domain, path, ...c }) => c
      )
    );
    const page = await context.newPage();
    // A REAL FINGER ON THE PHONE, A MOUSE ON THE DESKTOP (same pattern as
    // tool-shell.prodtest.mjs) — scripts/tests/interaction-coverage.test.mjs
    // holds a ratchet on prodtests that drive the page with a mouse only;
    // the send button is pressed here, not a bare Enter, so this file
    // genuinely exercises the touch path on its phone pass.
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }

    await page.goto(`${ORIGIN}/dashboard/coding`, { waitUntil: "networkidle" });

    // ---- "ΚΑΜΙΑ κάθετη γραμμή" ----
    const history = page.locator('[data-testid="coding-history"]');
    const main = page.locator('[data-testid="coding-main"]');
    check(
      "no border on the sessions column's own trailing edge",
      (await history.count()) === 1 && (await inlineBorder(history, "end")) === "0px",
      `coding-history count=${await history.count()}, borderInlineEndWidth=${(await history.count()) ? await inlineBorder(history, "end") : "n/a"}`
    );
    check(
      "...and none on the unified area's own leading edge",
      (await main.count()) === 1 && (await inlineBorder(main, "start")) === "0px",
      `coding-main count=${await main.count()}, borderInlineStartWidth=${(await main.count()) ? await inlineBorder(main, "start") : "n/a"}`
    );

    // ---- "Πεδίο φαρδύ... μέγιστο περίπου 800px" (on desktop; the phone
    // viewport itself is narrower than 700px, so the floor only applies
    // there) ----
    const field = page.locator("textarea").first();
    const fieldBox = await boxOrNull(field);
    if (device.label === "desktop") {
      check(`the field is at least 700px wide (${fieldBox?.width ?? 0}px)`, (fieldBox?.width ?? 0) >= 700);
    } else {
      check("the field exists on the phone", fieldBox !== null);
    }

    // ---- "ΠΑΝΩ από το πεδίο: ... ανέβασμα φακέλου" ----
    const projectRow = page.locator('[data-testid="coding-project-row"]');
    const projectBox = await boxOrNull(projectRow);
    check(
      "the project row (upload folder) sits ABOVE the field, not below it",
      projectBox !== null && fieldBox !== null && projectBox.y + projectBox.height <= fieldBox.y + 2,
      `project row bottom=${projectBox ? projectBox.y + projectBox.height : "n/a"}, field top=${fieldBox?.y}`
    );

    // ---- "ΚΑΤΩ ΔΕΞΙΑ μέσα στο πεδίο: «Ισχύς»" ----
    const power = page.locator('[data-testid="coding-power"]');
    const powerBox = await boxOrNull(power);
    check(
      "the power control (Ισχύς) sits INSIDE the field, in its right half",
      powerBox !== null &&
        fieldBox !== null &&
        powerBox.x >= fieldBox.x + fieldBox.width / 2 &&
        powerBox.x + powerBox.width <= fieldBox.x + fieldBox.width + 2,
      `power x=${powerBox?.x}, field x=${fieldBox?.x} width=${fieldBox?.width}`
    );
    check(
      "...and near the field's own bottom edge, not floating above it",
      powerBox !== null && fieldBox !== null && Math.abs(powerBox.y + powerBox.height - (fieldBox.y + fieldBox.height)) <= 60,
      `power bottom=${powerBox ? powerBox.y + powerBox.height : "n/a"}, field bottom=${fieldBox ? fieldBox.y + fieldBox.height : "n/a"}`
    );

    // ---- "Δεξιά στήλη κώδικα ΜΟΝΟ όταν υπάρχει κώδικας" ----
    check("no code panel before anything was asked for", (await page.locator('[data-testid="coding-work"]').count()) === 0);
    await page.route("**/api/coding/run", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          id: null,
          output: "function f() {\n  return 1;\n}",
          outputKind: "code",
          isEdit: false,
          resultLanguage: "javascript",
          creditsCharged: 3,
          workspaceModulesUsed: 0,
          chatTurnsUsed: 0,
        }),
      })
    );
    if (fieldBox !== null) {
      // ON THE PHONE, THE SESSIONS PANEL OPENS OVER THE WHOLE SCREEN BY
      // DEFAULT (the owner's own spec: "στο κινητό ανοίγει πάνω από τη
      // σελίδα") — its backdrop sits above the composer, so a real finger
      // closes it first, same as any person would, rather than this test
      // tapping blind through an overlay no finger could reach past.
      if (device.touch) await press(page.locator('[data-testid="coding-history-toggle"]'));
      await field.fill("A function that returns 1");
      if (device.touch) {
        await press(page.locator('button[type="submit"]').first());
      } else {
        await page.keyboard.press("Enter");
      }
      try {
        await page.locator('[data-testid="coding-work"]').waitFor({ state: "visible", timeout: 10000 });
      } catch {
        // checked by the count assertion right below either way
      }
    }
    check("...and it appears once there is code", (await page.locator('[data-testid="coding-work"]').count()) === 1);
    if (device.label === "desktop" && (await page.locator('[data-testid="coding-work"]').count()) === 1) {
      const work = page.locator('[data-testid="coding-work"]');
      check(
        "still no border between the conversation and the code, once both are on screen",
        (await inlineBorder(work, "start")) === "0px",
        `coding-work borderInlineStartWidth=${await inlineBorder(work, "start")}`
      );
    }

    await context.close();
  }

  await browser.close();
  cleanup();
  console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
  if (failures.length) console.log(failures.map((f) => "  - " + f).join("\n"));
  // AN EXPLICIT EXIT ON THE SUCCESS PATH TOO (scripts/tests/prodtest-
  // hygiene.test.mjs) — leaving a pass to the event loop draining hangs
  // the run if a handle (the browser, the stand-in server) is retained.
  process.exit(failures.length === 0 ? 0 : 1);
} catch (err) {
  console.error(err);
  cleanup();
  process.exit(1);
}
