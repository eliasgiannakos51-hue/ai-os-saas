/*
 * THE SHEETS SCREEN, IN THE BUILT APP (the owner's «28. SHEETS: ΠΙΝΑΚΕΣ
 * ΜΕ ΠΡΑΓΜΑΤΙΚΟΥΣ ΤΥΠΟΥΣ», 2026-10-31, Κομμάτι 1), behind the switch
 * "sheets-tool".
 *
 * Run: node scripts/tests/sheets.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/sheets.prodtest.mjs
 *      SHOT_DIR=/tmp/sheets-shots node scripts/tests/sheets.prodtest.mjs
 *
 * WHY THIS FILE AND NOT ONLY THE GATE. docs/TOOL-RULES.md §3: a piece is
 * verified by real presses in a real build, on a computer AND on a phone
 * — code tests are not enough. And this screen has one claim no gate can
 * settle, because it is about the browser rather than about the source:
 *
 *   «10.000 γραμμές χωρίς κόλλημα» — his own quality bar.
 *
 * scripts/tests/sheets.test.mjs runs `visibleRows` and proves the WINDOW
 * is bounded. Only this file can prove the DOM is: it sweeps the whole
 * sheet, counts the rows the browser actually rendered at each stop, and
 * reads row 10000's own header at the bottom. A component that drew all
 * ten thousand would pass every check in the gate and fail here.
 *
 * No table beyond feature_flags and user_credits: this piece has no data
 * model yet (his Κομμάτι 5 needs one), only the screen.
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.sheets;

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

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54487, tableRows: { feature_flags: flags, user_credits: credits } });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

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
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  // SELECTING A RANGE IS A REAL DRAG ON BOTH DEVICES — mouse down/move/up
  // on a computer, a CDP touch sequence on a phone. The same reasoning as
  // 3d-tool.prodtest.mjs: a dispatchEvent touch is untrusted, so
  // onPointerEnter would never fire for it and the range would never grow.
  async function dragBetween(from, to) {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2, by = b.y + b.height / 2;
    if (!cdp) {
      await page.mouse.move(ax, ay);
      await page.mouse.down();
      await page.mouse.move(bx, by, { steps: 14 });
      await page.mouse.up();
      return;
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: ax, y: ay }] });
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: ax + ((bx - ax) * i) / steps, y: ay + ((by - ay) * i) / steps }] });
      await page.waitForTimeout(10);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(120);
  }
  return { context, page, press, dragBetween };
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
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height}: the screen ==`);
    setFlags({});
    const { context, page, press, dragBetween } = await open(ON, device);
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png`, fullPage: false });

    await page.goto(`${ON}/dashboard/sheets`, { waitUntil: "load" });
    await page.locator('[data-testid="tool-shell"]').first().waitFor({ timeout: 15_000 });
    check("the real screen opened, in the common shell", (await page.locator('[data-testid="coming-soon"]').count()) === 0);

    // ---- the empty landing: one question, one sentence, three examples
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    check("three examples, through the shell's own landing", (await page.locator('[data-testid="tool-shell-example"]').count()) === 3);
    check("...and the sentence saying what the tool is for is on screen",
      (await page.locator('[data-testid="tool-shell-empty"]').innerText()).includes(EL.empty.why.slice(0, 24)));
    check("the honest limits line is under the field",
      (await page.locator('[data-testid="sheets-limits"]').innerText()).trim().length > 20);
    await shot("1-empty");

    // ---- pressing an example sends it through the one field
    await press(page.locator('[data-testid="tool-shell-example"]').first());
    await page.locator('[data-testid="sheets-grid"]').waitFor({ timeout: 10_000 });
    check("an example opens the table", (await page.locator('[data-testid="sheets-formula-bar"]').count()) === 1);
    check("...and is answered honestly: the table from a description is his Κομμάτι 3",
      (await page.locator('[data-role="tool"]').last().innerText()).includes(EL.soon.slice(0, 30)));

    // ---- ο πίνακας: ten thousand rows, thirty of them in the DOM
    const grid = page.locator('[data-testid="sheets-grid"]');
    check("the sheet says it is ten thousand rows by twenty-six columns",
      (await grid.getAttribute("data-rows")) === "10000" && (await grid.getAttribute("data-columns")) === "26");
    check("twenty-six column letters are drawn, A to Z",
      (await page.locator('[data-testid="sheets-column-head"]').count()) === 26 &&
        (await page.locator('[data-testid="sheets-column-head"]').last().innerText()).trim() === "Z");
    const rowsNow = await page.locator('[data-testid="sheets-row-head"]').count();
    check(`only the rows in view are in the DOM (${rowsNow} of 10000)`, rowsNow > 0 && rowsNow < 200, String(rowsNow));
    await shot("2-table");

    // ---- μπάρα τύπων: it reads the selection, and a press moves it
    check("the formula bar starts on A1", (await page.locator('[data-testid="sheets-selection"]').innerText()).trim() === "A1");
    check("...and shows the cell's contents beside the reference",
      (await page.locator('[data-testid="sheets-formula-value"]').innerText()).includes(EL.formula.empty));
    await press(page.locator('[data-cell="C4"]'));
    check("pressing a cell moves the reference to it", (await page.locator('[data-testid="sheets-selection"]').innerText()).trim() === "C4");

    // ---- a real drag selects a range, and the bar counts it
    const refNow = async () => (await page.locator('[data-testid="sheets-selection"]').innerText()).trim();
    await press(page.locator('[data-cell="B3"]'));
    if (!device.touch) {
      // A MOUSE DRAG ACROSS THE CELLS. This is the gesture that works
      // with a pointer that reports `pointerenter` — and the one that
      // does NOT work on a phone, which is why the handle below exists.
      await dragBetween(page.locator('[data-cell="B3"]'), page.locator('[data-cell="D6"]'));
      const mouseRef = await refNow();
      check(`a mouse drag across the cells selects the range (${mouseRef})`, mouseRef === "B3:D6", mouseRef);
      await press(page.locator('[data-cell="B3"]'));
    }
    // THE CORNER HANDLE, ON BOTH DEVICES. On a phone this is the only
    // gesture that can grow a range: a touch pointer is captured by the
    // cell the finger went down on, so dragging across the grid never
    // reaches the other cells. Found here, on this profile, 2026-10-31.
    //
    // THE FAR CORNER IS DIFFERENT PER DEVICE, AND THAT IS THE HONEST
    // TEST RATHER THAN A WEAKER ONE. Column D starts at x=368 on a
    // 390px phone, so it is off the side of the screen, and dragging the
    // handle past the edge does NOT scroll the sheet yet — that is the
    // owner's Κομμάτι 4, where selection gets its own round
    // (docs/PROGRESS.md says so in as many words). So each device drags
    // to the farthest cell it can actually see, and the count is derived
    // from that corner rather than typed in.
    const corner = device.touch ? { cell: "C5", cells: 2 * 3 } : { cell: "D6", cells: 3 * 4 };
    await dragBetween(page.locator('[data-testid="sheets-handle"]'), page.locator(`[data-cell="${corner.cell}"]`));
    const ref = await refNow();
    check(`dragging the corner handle selects the range on a ${device.label}, both corners named (${ref})`,
      ref === `B3:${corner.cell}`, ref);
    check(`...and counts the ${corner.cells} cells it covers`,
      (await page.locator('[data-testid="sheets-selected-count"]').innerText()).includes(String(corner.cells)));
    check("...and every one of them is marked selected in the page itself",
      (await page.locator('[data-testid="sheets-cell"][aria-selected="true"]').count()) === corner.cells);
    await shot("3-range-selected");

    // ---- «10.000 γραμμές χωρίς κόλλημα»: the sweep, and row 10000
    // A LOOSE CEILING ON PURPOSE. 40 jumps in 30 seconds only fails on a
    // genuine hang, which is what «κόλλημα» means; a tight bound would be
    // a number about this machine rather than about the screen.
    const started = Date.now();
    let widestDom = 0;
    for (let i = 1; i <= 40; i++) {
      await grid.evaluate((el, frac) => { el.scrollTop = el.scrollHeight * frac; }, i / 41);
      await page.waitForTimeout(20);
      widestDom = Math.max(widestDom, await page.locator('[data-testid="sheets-row-head"]').count());
    }
    const swept = Date.now() - started;
    check(`sweeping the whole sheet never put more than 200 rows in the DOM (widest ${widestDom})`, widestDom < 200, String(widestDom));
    check(`...and the sweep did not hang (${swept} ms for 40 jumps)`, swept < 30_000, String(swept));
    await grid.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(120);
    const lastRow = (await page.locator('[data-testid="sheets-row-head"]').last().innerText()).trim();
    check("the bottom of the sheet really is row 10000", lastRow === "10000", lastRow);
    check(`...with still only the rows in view drawn (${await page.locator('[data-testid="sheets-row-head"]').count()})`,
      (await page.locator('[data-testid="sheets-row-head"]').count()) < 200);
    await shot("4-row-10000");
    await grid.evaluate((el) => { el.scrollTop = 0; });

    // ---- καρτέλες φύλλων: the «+» adds one AND opens it, twice over
    check("one sheet to begin with", (await page.locator('[data-testid="sheets-tab"]').count()) === 1);
    await press(page.locator('[data-testid="sheets-add"]'));
    check("the «+» adds a second sheet", (await page.locator('[data-testid="sheets-tab"]').count()) === 2);
    check("...and opens it", (await page.locator('[data-testid="sheets-tab"][aria-pressed="true"]').innerText()).includes("2"));
    // THE SECOND PRESS IS THE ONE THAT CATCHES THE STALE READ: adding
    // from outside the updater gets the number right once and wrong after.
    await press(page.locator('[data-testid="sheets-add"]'));
    check("a second «+» adds a third sheet", (await page.locator('[data-testid="sheets-tab"]').count()) === 3);
    check("...and opens the THIRD, not the one that was there before the press",
      (await page.locator('[data-testid="sheets-tab"][aria-pressed="true"]').innerText()).includes("3"));
    // MOVE THE SELECTION FIRST, OR THE NEXT CHECK PASSES FOR NOTHING.
    // `addSheet` already puts the anchor back at A1, so asking «is it
    // A1?» straight after two «+» presses is true whether or not the tab
    // press did anything at all. That vacuous shape is what CLAUDE.md
    // calls a number printed and never judged, and it hid a real bug
    // here on 2026-10-31: the screenshot taken one line later showed
    // Φύλλο 3 still open while the check was green.
    await press(page.locator('[data-cell="C4"]'));
    check("the selection really moved before the tab was pressed", (await refNow()) === "C4");
    await press(page.locator('[data-testid="sheets-tab"]').first());
    check("pressing the first tab opens it",
      (await page.locator('[data-testid="sheets-tab"][aria-pressed="true"]').innerText()).includes("1"));
    check("...and puts the selection back at A1", (await refNow()) === "A1");
    // SETTLE FIRST, BECAUSE THE BUG THIS CATCHES ARRIVES LATE. A setter
    // called from inside a React state updater fires again when the
    // updater is replayed, one render after the press — so an immediate
    // read saw «Φύλλο 1» open while the screen a moment later showed
    // «Φύλλο 3». Without this wait the check passed and the screenshot
    // taken one line below disagreed with it (2026-10-31).
    await page.waitForTimeout(300);
    // RANGED OVER EVERY TAB, not just the one that says it is open. The
    // style and `aria-pressed` come from the same expression, so reading
    // one tab cannot tell you the other two are not ALSO drawn open.
    const tabStates = await page
      .locator('[data-testid="sheets-tab"]')
      .evaluateAll((els) => els.map((e) => `${e.textContent.trim()}=${e.getAttribute("aria-pressed")}`).join(" "));
    check("exactly one tab is drawn open, and it is the first", tabStates === "Φύλλο 1=true Φύλλο 2=false Φύλλο 3=false", tabStates);
    await shot("5-sheets");

    // ---- ένα λευκό κουμπί «Λήψη», drawn and honest about not being wired
    const download = page.locator('[data-testid="sheets-download"]');
    check("Download is drawn in the work bar", (await download.count()) === 1);
    check("...and disabled, because xlsx and csv are his Κομμάτι 8", await download.isDisabled());
    check("...and says so when you look at it", (await download.getAttribute("title")) === EL.downloadSoon);

    // ---- the shell's own rules still hold on this screen
    check("still exactly one typable field: the shell's own",
      (await page.locator("main textarea").count()) === 1 &&
        (await page.locator('main input:not([type="checkbox"]):not([type="radio"]):not([type="file"])').count()) === 0);
    // THE PHONE BUG THE AGENTS ROUND FOUND: three labelled buttons in the
    // work bar left the title about 20px and it broke one letter per line.
    const titleBox = await page.locator('[data-testid="tool-shell-work"] p').first().boundingBox().catch(() => null);
    check(`the work bar's title has room to be read (${titleBox ? Math.round(titleBox.width) : "n/a"}px)`,
      !titleBox || titleBox.width > 60, titleBox ? String(titleBox.width) : "no title element");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: with the switch not open to this account, the address does not exist ==");
  {
    setFlags({ "sheets-tool": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/sheets`, { waitUntil: "load" });
    // THE PAGE, NOT THE STATUS LINE. A `notFound()` thrown while the
    // layout is already streaming reaches the browser inside a response
    // whose headers went out as 200, so the status says nothing about
    // what the reader sees — src/app/not-found.tsx is what they see, and
    // its own 404 heading is the thing to read.
    const heading = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    check("the address does not exist: the 404 page, no half-built screen, no «Notify me» nobody can answer",
      heading === "404" && (await page.locator('[data-testid="sheets-grid"]').count()) === 0 &&
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
