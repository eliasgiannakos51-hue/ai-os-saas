/*
 * THE SKILLS SCREEN, IN THE BUILT APP (the owner's «29. SKILLS: ΤΟ
 * ΜΑΘΑΙΝΕΙΣ ΜΙΑ ΦΟΡΑ», 2026-10-31, Κομμάτι 1), behind the switch
 * "skills-tool".
 *
 * Run: node scripts/tests/skills.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/skills.prodtest.mjs
 *      SHOT_DIR=/tmp/skills-shots node scripts/tests/skills.prodtest.mjs
 *
 * WHY THIS FILE AND NOT ONLY THE GATE. docs/TOOL-RULES.md §3: a piece is
 * verified by real presses in a real build, on a computer AND on a phone.
 * His Κομμάτι 1 is four words long — «λίστα, και πατάς για να ανοίξει» —
 * and the press is the half no gate can settle: skills-workspace.tsx
 * holds the selection in React state, so whether pressing a row really
 * opens it, and whether the phone's single column really hands over to
 * the details pane and back, is a question about a browser.
 *
 * AND ONE CLAIM THAT ONLY A BROWSER CAN SETTLE: «κανένα όνομα δεν
 * κόβεται». The gate can see that the name's class is `break-words` and
 * not `truncate`; only this file can measure the element and prove the
 * text is not overflowing its box at 390px. A long Greek skill name is
 * seeded for exactly that measurement.
 *
 * THE ROWS ARE SEEDED, NOT CREATED, and that is the shape of the round:
 * Κομμάτι 1 has no write path at all (the migration grants `select`
 * only), so the only way content exists is to put it in the table —
 * which is also the honest test of the loader's own defensive mapping,
 * since what it is handed here is jsonb with a hole in it.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.skills;

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

// A NAME LONG ENOUGH TO BREAK A ROW, in Greek, because that is the
// language the owner reads the screen in and the one whose words are
// longest. Nothing may cut it.
const LONG_NAME = "Προσφορά για πελάτη εξωτερικού με ΦΠΑ, έκπτωση όγκου και όρους πληρωμής 30 ημερών";

const skills = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: MOCK_USER.id,
    name: LONG_NAME,
    when_used: "Όταν κάποιος ζητά τιμή για πάνω από 10 κομμάτια",
    // A hole on purpose: a number among the steps and a file with no url.
    // The loader drops both (src/lib/skills/load.ts), and the screen must
    // show what is left rather than a blank line or a dead link.
    steps: ["Άνοιξε το πρότυπο προσφοράς", 42, "Συμπλήρωσε τα στοιχεία του πελάτη", "Στείλ' το με email"],
    files: [
      { name: "προσφορά-πρότυπο.docx", url: "https://example.test/template.docx" },
      { name: "χωρίς σύνδεσμο" },
    ],
    created_at: "2026-10-30T09:00:00Z",
  },
  {
    // THE SECOND ROW IS THE EMPTY ONE, and it is here because a section
    // that disappears when it has nothing reads as «a skill has no
    // files», which is a different claim from «nobody attached one yet».
    id: "22222222-2222-4222-8222-222222222222",
    user_id: MOCK_USER.id,
    name: "Απάντηση σε κριτική",
    when_used: "",
    steps: [],
    files: [],
    created_at: "2026-10-29T09:00:00Z",
  },
];

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54489,
  tableRows: { feature_flags: flags, user_credits: credits, user_skills: skills },
});
const setFlags = (audiences) =>
  flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

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
};

const SHOT_DIR = process.env.SHOT_DIR;
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
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}

async function open(origin, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", url: origin },
    ].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  // A REAL PRESS ON BOTH DEVICES — a click on a computer, a CDP touch
  // sequence on a phone. The same reasoning as sheets.prodtest.mjs: a
  // dispatchEvent touch is untrusted, so what it proves about a React
  // handler is less than nothing.
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
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
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height}: the list, and pressing a row ==`);
    setFlags({});
    const { context, page, press } = await open(ON, device);
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png`, fullPage: false });

    await page.goto(`${ON}/dashboard/skills`, { waitUntil: "load" });
    await page.locator('[data-testid="skills-workspace"]').waitFor({ timeout: 15_000 });
    check("the real screen opened, not a Coming Soon shell",
      (await page.locator('[data-testid="coming-soon"]').count()) === 0);
    check("the page carries its own name, not a borrowed header",
      (await page.locator("h1").first().innerText()).trim() === EL.name.trim());

    // ---- the list: both rows, and the name whole --------------------
    const rows = page.locator('[data-testid="skills-list-item"]');
    check(`both seeded skills are listed (${await rows.count()})`, (await rows.count()) === 2);
    check("the newest is first, which is the order the loader asks for",
      (await rows.first().innerText()).includes("Προσφορά για πελάτη"));
    // «ΚΑΝΕΝΑ ΟΝΟΜΑ ΔΕΝ ΚΟΒΕΤΑΙ», measured rather than asserted: the
    // element is allowed to be as tall as it likes and must not be wider
    // than its box, which is what an ellipsis or a clip would produce.
    const nameEl = rows.first().locator("span", { hasText: "Προσφορά για πελάτη" }).first();
    const overflow = await nameEl.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth, text: e.textContent }));
    check(`the long name is drawn whole, not cut (${overflow.scroll} vs ${overflow.client}px)`,
      overflow.scroll <= overflow.client + 1 && overflow.text.trim() === LONG_NAME, JSON.stringify(overflow));
    await shot("list");

    // ---- nothing is open yet ----------------------------------------
    if (!device.touch) {
      check("with nothing selected the right side says to pick one",
        (await page.locator('[data-testid="skills-details-empty"]').count()) === 1);
    }

    // ---- press a row: the four things a skill has --------------------
    await press(rows.first());
    await page.locator('[data-testid="skills-details"]').waitFor({ timeout: 5_000 });
    const details = page.locator('[data-testid="skills-details"]');
    // THREE THINGS, NOT A `true`. The `waitFor` above already throws if
    // the pane never arrives, so a check that only restated it would be
    // a tautology — which this repo's own gate-vacuity.test.mjs caught
    // here, in this file, on 2026-10-31. What is asserted instead is
    // what a press is FOR: the pane is open, the «pick one» placeholder
    // is gone, and the row that was pressed is the one marked current.
    check("pressing the row opened it, and that row is the one marked open",
      (await details.count()) === 1 &&
        (await page.locator('[data-testid="skills-details-empty"]').count()) === 0 &&
        (await rows.first().getAttribute("aria-current")) === "true");
    check("its name is the heading", (await details.locator("h2").innerText()).trim() === LONG_NAME);
    check("«πότε χρησιμοποιείται» is shown, in his own words",
      (await details.locator('[data-testid="skills-when-used"]').innerText()).includes("πάνω από 10 κομμάτια"));
    // THE STEPS, IN ORDER, AND WITHOUT THE HOLE. `42` was seeded among
    // them; the loader drops it, so three steps arrive in their original
    // order — which is what makes this a procedure rather than a list.
    const steps = details.locator('[data-testid="skills-step"]');
    check(`the steps are three, the number among them dropped (${await steps.count()})`,
      (await steps.count()) === 3);
    check("...and they are in the order they were taught",
      (await steps.first().innerText()).includes("Άνοιξε το πρότυπο") &&
        (await steps.last().innerText()).includes("Στείλ' το με email"));
    check("they are numbered, because a procedure has an order",
      (await details.locator("ol [data-testid=\"skills-step\"]").count()) === 3);
    // THE FILES, AND THE ONE THAT WAS NOT A FILE.
    const files = details.locator('[data-testid="skills-file"]');
    check(`one real file is linked, the url-less one dropped (${await files.count()})`, (await files.count()) === 1);
    check("...and it is a real link, opening away from the app",
      (await files.first().locator("a").getAttribute("href")) === "https://example.test/template.docx" &&
        (await files.first().locator("a").getAttribute("target")) === "_blank" &&
        (await files.first().locator("a").getAttribute("rel")) === "noreferrer");
    await shot("details");

    // ---- the empty skill: every section still says its own name -----
    // ON A PHONE YOU GO BACK FIRST, and that is the single column
    // working rather than a step to skip: with a skill open the list is
    // `hidden`, so the second row has no box at all and pressing it
    // throws. This run found that by trying — «Cannot read properties of
    // null (reading 'x')» at 390px, after the same press had worked at
    // 1440px — which is the whole argument for pressing both devices
    // instead of one and assuming the other.
    if (device.touch) {
      await press(page.locator('[data-testid="skills-details-back"]'));
      await page.locator('[data-testid="skills-list"]').waitFor({ state: "visible", timeout: 5_000 });
    }
    await press(rows.nth(1));
    await page.waitForTimeout(150);
    const second = page.locator('[data-testid="skills-details"]');
    check("the second skill replaced the first in the same pane",
      (await second.locator("h2").innerText()).trim() === "Απάντηση σε κριτική");
    for (const [label, testid, expected] of [
      ["πότε χρησιμοποιείται", "skills-when-used", EL.details.whenUsedEmpty],
      ["βήματα", "skills-steps", EL.details.stepsEmpty],
      ["αρχεία", "skills-files", EL.details.filesEmpty],
    ]) {
      const text = await second.locator(`[data-testid="${testid}"]`).innerText();
      check(`an empty «${label}» says so instead of vanishing`, text.includes(expected.trim()), text.trim());
    }
    await shot("details-empty-sections");

    // ---- the phone's one column -------------------------------------
    if (device.touch) {
      check("on a phone the list stepped aside while a skill is open",
        !(await page.locator('[data-testid="skills-list"]').isVisible()));
      const back = page.locator('[data-testid="skills-details-back"]');
      check("...and the back arrow is there", (await back.count()) === 1 && (await back.isVisible()));
      await press(back);
      await page.waitForTimeout(150);
      check("pressing it brings the list back", await page.locator('[data-testid="skills-list"]').isVisible());
      check("...and nothing is open any more",
        (await page.locator('[data-testid="skills-details"]').count()) === 0);
      await shot("phone-back-to-list");
    } else {
      check("on a computer the list stays beside the details, both at once",
        (await page.locator('[data-testid="skills-list"]').isVisible()) &&
          (await page.locator('[data-testid="skills-details"]').isVisible()));
    }

    // ---- the stop-gate, on screen -----------------------------------
    // Κομμάτι 2 is «Κάν' το skill». Until he writes «εγκρίνω» there is
    // nothing here that creates, edits or deletes one, and that is
    // checked in the rendered DOM rather than in the source.
    const writable = await page.locator("main input, main textarea, main [contenteditable=true]").count();
    check(`nothing on the screen can be typed into yet (${writable})`, writable === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: an account with no skills yet ==");
  {
    const kept = skills.splice(0, skills.length);
    setFlags({});
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/skills`, { waitUntil: "load" });
    await page.locator('[data-testid="skills-empty"]').waitFor({ timeout: 15_000 });
    const text = await page.locator('[data-testid="skills-empty"]').innerText();
    check("the empty list says what a skill IS, not just «nothing here»",
      text.includes(EL.empty.title.trim()) && text.includes(EL.empty.why.slice(0, 40)), text.trim());
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/desktop-empty.png`, fullPage: false });
    await context.close();
    skills.push(...kept);
  }

  console.log("\n== desktop: with the switch not open to this account, the address does not exist ==");
  {
    setFlags({ "skills-tool": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/skills`, { waitUntil: "load" });
    // THE PAGE, NOT THE STATUS LINE. A `notFound()` thrown while the
    // layout is already streaming reaches the browser inside a response
    // whose headers went out as 200 — src/app/not-found.tsx is what the
    // reader sees, and its own 404 heading is the thing to read.
    const heading = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    check("the address does not exist: the 404 page, and no half-built screen behind it",
      heading === "404" && (await page.locator('[data-testid="skills-workspace"]').count()) === 0 &&
        (await page.locator('[data-testid="coming-soon"]').count()) === 0, heading);
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
