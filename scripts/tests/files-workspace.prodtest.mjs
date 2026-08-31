// The File Workspace, in a real production build, in a real browser.
//
// WHAT WAS REPORTED. "/dashboard/files is incomprehensible. The user does
// not understand how it works and cannot ask a question."
//
// Reading the page against that: every piece existed and none of them said
// what to do with it. Upload, then a card grid, then a Collections box,
// then — below all of it — an "Ask my documents" panel. Nothing told you
// the three things were a SEQUENCE, so the Ask panel was the last thing on
// a page you had to scroll past everything else to reach. Selection was a
// 11px checkbox inside each card with no highlight and no count anywhere
// you were looking. The Ask button was 12px text at the bottom of the last
// panel, and it disabled itself silently when nothing was ticked.
//
// So this checks the things a lost user actually needs, measured rather
// than argued: that the three steps are stated and the current one is
// marked, that the empty state says what the page is FOR, that the Ask
// control is on screen and explains why it is disabled, that example
// questions can be clicked, that selection is unmissable and counted, and
// that a file still being read says so.
//
// Screenshots at 1280 and 375, which is the only honest way to answer
// "does it look incomprehensible".
//
// Run: node scripts/tests/files-workspace.prodtest.mjs [--out DIR] [--before]
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

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

// --before captures screenshots of the OLD page and skips the assertions
// that describe the new one. It exists so the before/after pair comes from
// the same harness rather than from two different setups.
const SHOTS_ONLY = process.argv.includes("--before");
const prefix = SHOTS_ONLY ? "before" : "after";
const outDir = path.resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "files-shots"
);
mkdirSync(outDir, { recursive: true });

const USER_ID = "00000000-0000-4000-8000-000000000001";

const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// Three files covering the three states a user meets: readable, still
// being read, and unreadable. The middle one is the state the page had no
// way of explaining.
const FILES = [
  {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    user_id: USER_ID,
    filename: "Symvasi-Enoikiasis.pdf",
    file_type: "pdf",
    size_bytes: 284_312,
    page_count: 12,
    char_count: 41_233,
    processing_status: "ready",
    error: null,
    uploaded_at: "2026-02-01T09:00:00Z",
  },
  {
    id: "bbbbbbbb-2222-4222-8222-222222222222",
    user_id: USER_ID,
    filename: "Timologia-2025.xlsx",
    file_type: "xlsx",
    size_bytes: 91_004,
    page_count: null,
    char_count: 8_120,
    processing_status: "ready",
    error: null,
    uploaded_at: "2026-02-02T11:30:00Z",
  },
  {
    id: "cccccccc-3333-4333-8333-333333333333",
    user_id: USER_ID,
    filename: "Scanned-Contract.pdf",
    file_type: "pdf",
    size_bytes: 1_204_998,
    page_count: 4,
    char_count: 0,
    processing_status: "failed",
    error: "No readable text — this looks like a scan without OCR.",
    uploaded_at: "2026-02-03T14:15:00Z",
  },
];

// Flipped by the test so the same server can serve an empty account.
let serveEmpty = false;

// STORAGE IS REAL HERE, not a blanket 200. The old mock answered every
// unknown path with `200 {}` — which is exactly how "upload works, 42/42
// PASS" was reported while the real deployment could not store a file at
// all. This mock keeps object bytes, honours "the bucket does not exist",
// and REFUSES paths it does not implement, so a code path that talks to
// storage is exercised for real or fails loudly.
let bucketExists = true;
const objects = new Map(); // path inside user-files -> Buffer
let storagePosts = 0;
const unexpected = [];

const TABLE_ROWS = () => ({
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000 }],
  user_files: serveEmpty ? [] : FILES,
  file_collections: [],
  file_collection_items: [],
  favorites: [],
  rate_limit_log: [],
});

// A browser upload arrives as multipart/form-data (storage-js wraps a File
// in FormData); a server-side Buffer upload arrives raw. Real Supabase
// storage unwraps the former — so this mock must too, or the bytes it
// "stores" are the multipart envelope and every later read of the object
// is garbage.
function extractMultipartFile(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return buf;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let largest = null;
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const part = buf.subarray(pos + boundary.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString();
      const partBody = part.subarray(headerEnd + 4, part.length - 2); // strip trailing \r\n
      if (/filename=/i.test(headers)) return partBody;
      if (largest === null || partBody.length > largest.length) largest = partBody;
    }
    pos = next;
  }
  return largest ?? buf;
}

const supa = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, "http://x");
    // The browser talks to this server cross-origin (the app runs on
    // another port), so the direct-upload path needs real CORS answers.
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    };
    const json = (code, data, extra = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...cors, ...extra });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }

    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });

    // ---- storage: implemented, not faked --------------------------------
    if (url.pathname.startsWith("/storage/v1/object/user-files/")) {
      const objectPath = decodeURIComponent(url.pathname.slice("/storage/v1/object/user-files/".length));
      if (!bucketExists) {
        return json(400, { statusCode: "404", error: "not_found", message: "Bucket not found" });
      }
      if (req.method === "POST" || req.method === "PUT") {
        // Only a BROWSER request carries an Origin header. Counting those
        // alone is what lets the test tell "the direct path worked" apart
        // from "it silently fell back to the server route".
        if (req.headers.origin) storagePosts++;
        const ctype = req.headers["content-type"] ?? "";
        objects.set(
          objectPath,
          ctype.startsWith("multipart/form-data") ? extractMultipartFile(body, ctype) : body
        );
        return json(200, { Key: `user-files/${objectPath}` });
      }
      if (req.method === "GET") {
        const stored = objects.get(objectPath);
        if (!stored) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
        res.writeHead(200, { "Content-Type": "application/octet-stream", ...cors });
        return res.end(stored);
      }
      if (req.method === "DELETE") {
        objects.delete(objectPath);
        return json(200, []);
      }
    }
    if (url.pathname === "/storage/v1/object/user-files" && req.method === "DELETE") {
      if (!bucketExists) {
        return json(400, { statusCode: "404", error: "not_found", message: "Bucket not found" });
      }
      try {
        for (const p of JSON.parse(body.toString()).prefixes ?? []) objects.delete(p);
      } catch {
        /* empty body */
      }
      return json(200, []);
    }
    if (url.pathname.startsWith("/storage/v1/")) {
      // A storage call this mock does not implement must FAIL the test,
      // never silently succeed — that silence was the harness bug.
      unexpected.push(`${req.method} ${url.pathname}`);
      return json(500, { message: `mock: unimplemented storage path ${url.pathname}` });
    }

    // ---- PostgREST ------------------------------------------------------
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);

      // TELEMETRY THE SHELL SENDS ON EVERY PAGE, answered truthfully
      // rather than 500'd.
      //
      // Measured: fifty unexpected calls on a files-workspace run, of
      // which the distinct kinds were pwa_client_stats, nav_events,
      // voice_usage_this_month and record_production_error. The last is
      // not independent traffic — it is the app REPORTING that the other
      // three came back 500. One stale allowlist, one red check, and a
      // large number that looked like a product problem.
      //
      // ANSWERING THEM MAKES THIS SUITE STRONGER, not weaker: an
      // unexpected call after this is a real one.
      if (table === "rpc/voice_usage_this_month") {
        return json(200, [{ transcribe_seconds: 0, speak_seconds: 0 }]);
      }
      if (table === "rpc/record_production_error") {
        // Answered so the recorder cannot itself fail, and NOT allowed
        // to pass silently: reaching this now means something really
        // did go wrong.
        unexpected.push(`production error recorded: ${body.toString().slice(0, 120)}`);
        return json(200, null);
      }
      if (table === "nav_events" || table === "pwa_client_stats") {
        if (req.method === "POST") return json(201, []);
        return json(200, [], { "Content-Range": "0-0/0" });
      }

      if (req.method === "POST" && table === "user_files") {
        let row;
        try {
          row = JSON.parse(body.toString());
        } catch {
          return json(400, { message: "bad body" });
        }
        row.id = `dddddddd-4444-4444-8444-${String(FILES.length + 1).padStart(12, "0")}`;
        row.uploaded_at = new Date().toISOString();
        FILES.unshift(row);
        return json(201, row);
      }
      if (req.method === "POST" && table === "rate_limit_log") return json(201, []);
      if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
        if (table !== "rate_limit_log") unexpected.push(`${req.method} ${url.pathname}`);
        return json(500, { message: `mock: unimplemented write to ${table}` });
      }
      const rows = TABLE_ROWS()[table] ?? [];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows, { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
    }

    unexpected.push(`${req.method} ${url.pathname}`);
    json(500, { message: `mock: unimplemented path ${url.pathname}` });
  });
});

const SUPA_PORT = 54341;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: user(),
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
  NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
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
if (!(await waitForServer())) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}\n`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

async function openFiles(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/files`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(900);
  return { context, page };
}

try {
  // -------------------------------------------------------------------
  console.log("== screenshots ==");
  {
    const { context, page } = await openFiles(1280, 900);
    await page.screenshot({ path: path.join(outDir, `${prefix}-1280-files.png`), fullPage: true });
    await context.close();
  }
  {
    const { context, page } = await openFiles(375, 812);
    await page.screenshot({ path: path.join(outDir, `${prefix}-375-files.png`), fullPage: true });
    await context.close();
  }
  serveEmpty = true;
  {
    const { context, page } = await openFiles(1280, 900);
    await page.screenshot({ path: path.join(outDir, `${prefix}-1280-empty.png`), fullPage: true });
    await context.close();
  }
  serveEmpty = false;
  console.log(`  screenshots written to ${outDir}`);

  if (SHOTS_ONLY) {
    console.log("\n--before: screenshots only, assertions skipped.");
  } else {
    const { context, page } = await openFiles(1280, 900);

    // -----------------------------------------------------------------
    console.log("\n== 1. the three steps are stated, and one is current ==");
    const steps = page.locator('[data-testid="files-steps"]');
    check("a step flow is on the page", (await steps.count()) > 0 && (await steps.isVisible()));
    const stepItems = page.locator('[data-testid="files-steps"] li');
    check(`there are exactly three steps (${await stepItems.count()})`, (await stepItems.count()) === 3);
    const stepText = await steps.innerText();
    check("step 1 is about uploading", /upload/i.test(stepText), stepText);
    check("step 2 is about choosing which files", /choose|select/i.test(stepText), stepText);
    check("step 3 is about asking", /ask/i.test(stepText), stepText);
    // With files present but nothing ticked, the user is on step 2.
    const current = page.locator('[data-testid="files-steps"] li[aria-current="step"]');
    check("exactly one step is marked current", (await current.count()) === 1);
    check(
      `and with files uploaded but none selected it is step 2 ("${(await current.innerText()).replace(/\n/g, " ")}")`,
      /choose|select/i.test(await current.innerText())
    );

    console.log("\n== 2. selection is unmissable and counted ==");
    const firstCheckbox = page.locator('input[type="checkbox"]:not([disabled])').first();
    check("a file has a real checkbox", (await firstCheckbox.count()) > 0);
    const cb = await firstCheckbox.boundingBox();
    // 11px was the old size. A tick target has to be a tick target.
    check(`the checkbox is a usable size (${Math.round(cb.width)}px)`, cb.width >= 16);
    await firstCheckbox.check();
    await page.waitForTimeout(250);

    const counter = page.locator('[data-testid="files-selected-count"]');
    check("a selection counter appears", (await counter.count()) > 0 && (await counter.isVisible()));
    check(`it says how many (${(await counter.innerText()).trim()})`, /1/.test(await counter.innerText()));
    const selectedCard = page.locator('[data-selected="true"]');
    check("the selected file's card is visibly marked", (await selectedCard.count()) === 1);

    await page.locator('input[type="checkbox"]:not([disabled])').nth(1).check();
    await page.waitForTimeout(250);
    check(`the counter follows the selection (${(await counter.innerText()).trim()})`, /2/.test(await counter.innerText()));
    check("and the step marker has moved to step 3", /ask/i.test(await page.locator('[data-testid="files-steps"] li[aria-current="step"]').innerText()));

    console.log("\n== 3. the Ask control is findable ==");
    const askBtn = page.locator('[data-testid="files-ask-button"]');
    check("the Ask button exists", (await askBtn.count()) > 0);
    check("it is visible", await askBtn.isVisible());
    const label = (await askBtn.innerText()).trim();
    check(`it has real text, not just an icon ("${label}")`, label.length >= 3);
    const ab = await askBtn.boundingBox();
    check(`it is a proper target (${Math.round(ab.width)}x${Math.round(ab.height)}px)`, ab.height >= 40 && ab.width >= 90);

    console.log("\n== 4. a disabled Ask says WHY ==");
    // Nothing typed yet, two files ticked.
    check("with no question typed the button is disabled", !(await askBtn.isEnabled()));
    const why = page.locator('[data-testid="files-ask-disabled-reason"]');
    check("and a reason is shown", (await why.count()) > 0 && (await why.isVisible()));
    const reasonTyped = (await why.innerText()).trim();
    check(`the reason mentions the question ("${reasonTyped}")`, /question/i.test(reasonTyped));

    // Now the other direction: a question typed, nothing selected.
    await page.locator('input[type="checkbox"]:not([disabled])').first().uncheck();
    await page.locator('input[type="checkbox"]:not([disabled])').nth(1).uncheck();
    await page.locator('[data-testid="files-question"]').fill("What does the contract say about cancellation?");
    await page.waitForTimeout(250);
    check("with nothing selected the button is disabled", !(await askBtn.isEnabled()));
    const reasonSelect = (await why.innerText()).trim();
    check(`and the reason now names the missing selection ("${reasonSelect}")`, /file/i.test(reasonSelect));
    check("the two reasons are different messages", reasonTyped !== reasonSelect);

    console.log("\n== 5. example questions, and they are clickable ==");
    // The chips moved into the shared component every AI surface now uses
    // (components/ai/example-prompts.tsx), so the test id is the shared
    // one. The behaviour this checks is unchanged — and one assertion is
    // added, because the shared version brings something this page did
    // not have: a line saying what it will NOT do.
    const examples = page.locator('[data-testid="examples-files"] [data-testid="ai-example"]');
    const exampleCount = await examples.count();
    check(`there are 2-4 examples (${exampleCount})`, exampleCount >= 2 && exampleCount <= 4);
    const questionBox = page.locator('[data-testid="files-question"]');
    check("the placeholder mentions the selected files", /selected/i.test(await questionBox.getAttribute("placeholder")));
    const exampleText = (await examples.first().innerText()).trim();
    await questionBox.fill("");
    await examples.first().click();
    await page.waitForTimeout(250);
    check(
      `clicking an example fills the box ("${exampleText.slice(0, 40)}...")`,
      (await questionBox.inputValue()).trim() === exampleText
    );
    // The most common wrong expectation about this page is that it
    // searches the web. It does not — file-ask sends no tools at all —
    // and the page now says so next to the examples.
    const limits = (await page.locator('[data-testid="examples-files"] [data-testid="ai-limits"]').innerText()).trim();
    check(`the limits line is on the page ("${limits.slice(0, 50)}")`, limits.length > 20);
    check("...and it says the web is not searched", /web/i.test(limits), limits);

    console.log("\n== 6. both remaining states are explained ==");
    // A file that could not be read must say so on its own card, not only
    // as a status word.
    const cardsText = await page.locator('[data-testid="files-list"]').innerText();
    check("the unreadable file explains itself", /scan without OCR/i.test(cardsText), cardsText.slice(0, 400));
    check(
      "and says it cannot be asked about",
      /cannot be asked|not be asked/i.test(cardsText)
    );
    // The counter must not count a file that cannot answer.
    check(
      "the unreadable file's checkbox is disabled",
      (await page.locator('input[type="checkbox"][disabled]').count()) >= 1
    );

    await page.locator('input[type="checkbox"]:not([disabled])').first().check();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, "after-1280-selected.png"), fullPage: true });
    await context.close();

    console.log("\n== 7. the empty state teaches instead of reporting ==");
    serveEmpty = true;
    const { context: ec, page: empty } = await openFiles(1280, 900);
    const emptyText = await empty.locator("main").innerText();
    check("it names the file types", /PDF/i.test(emptyText) && /(Word|Excel)/i.test(emptyText), emptyText.slice(0, 500));
    check("it gives a concrete example question", /e\.g\.|π\.χ\./i.test(emptyText), emptyText.slice(0, 500));
    check("it is not the bare 'no files yet'", !/^No files yet\.?$/im.test(emptyText.trim()));
    // Two upload buttons is correct, not a duplicate: the drop zone keeps
    // its own at all times, and the empty state carries a second, larger
    // one where a first-time user is actually looking. They get separate
    // ids so a test can name which one it means.
    const uploadBtn = empty.locator('[data-testid="files-empty-upload"]');
    check("the empty state has its own upload button", (await uploadBtn.count()) === 1 && (await uploadBtn.isVisible()));
    const ub = await uploadBtn.boundingBox();
    check(`and it is a primary-sized target (${Math.round(ub.width)}x${Math.round(ub.height)}px)`, ub.height >= 40);
    check(
      "the drop zone still has one too",
      (await empty.locator('[data-testid="files-upload-button"]').count()) === 1
    );
    // With nothing uploaded, step 1 is where the user is.
    check(
      "and step 1 is the current step",
      /upload/i.test(await empty.locator('[data-testid="files-steps"] li[aria-current="step"]').innerText())
    );
    await ec.close();
    serveEmpty = false;

    console.log("\n== 8. the same page at 375px ==");
    const { context: mc, page: mobile } = await openFiles(375, 812);
    check("the steps are still on screen", await mobile.locator('[data-testid="files-steps"]').isVisible());
    check("so is the Ask button", await mobile.locator('[data-testid="files-ask-button"]').isVisible());
    const overflow = await mobile.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check(
      `no horizontal overflow (${overflow.scrollWidth}/${overflow.clientWidth})`,
      overflow.scrollWidth <= overflow.clientWidth + 1
    );
    await mc.close();

    // -----------------------------------------------------------------
    // The two sections below exist because of a production incident: the
    // old mock answered every storage call with `200 {}`, so this file
    // said 42/42 PASS while the real deployment could not store a file at
    // all. An upload now has to TRAVEL — browser to bucket to row — and a
    // missing bucket has to produce the message that names the fix.
    console.log("\n== 9. an upload actually travels: browser → storage → row ==");
    {
      const { context: upc, page: up } = await openFiles(1280, 900);
      const postsBefore = storagePosts;
      await up.setInputFiles('input[type="file"]', "scripts/tests/fixtures/browser-print.pdf");
      const toast = up.locator('[role="status"]', { hasText: "is ready" });
      await toast.first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
      check("the success toast appears", (await toast.count()) > 0,
        `toasts on page: ${await up.locator('[role="status"]').allInnerTexts().then((t) => t.join(" | ")).catch(() => "?")}`);
      check(
        `the bytes reached the bucket over the direct path (${storagePosts - postsBefore} POSTs)`,
        storagePosts - postsBefore === 1
      );
      check("the object is still in the bucket (register kept it)", objects.size === 1);
      check(
        "the row was written and carries the extracted text",
        FILES.some((f) => f.filename === "browser-print.pdf" && f.processing_status === "ready" && (f.char_count ?? 0) > 0),
        JSON.stringify(FILES[0])
      );
      const card = up.locator('[data-testid="files-list"]', { hasText: "browser-print.pdf" });
      check("and the new file's card is on the page", (await card.count()) === 1);
      await up.screenshot({ path: path.join(outDir, "after-1280-uploaded.png"), fullPage: true });
      await upc.close();
    }

    console.log("\n== 10. a missing bucket says so, by name ==");
    {
      bucketExists = false;
      const { context: bc, page: bp } = await openFiles(1280, 900);
      await bp.setInputFiles('input[type="file"]', "scripts/tests/fixtures/browser-print.pdf");
      const errToast = bp.locator('[role="status"]', { hasText: "bucket" });
      await errToast.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      const toastText = await bp
        .locator('[role="status"]')
        .allInnerTexts()
        .then((t) => t.join(" | "))
        .catch(() => "");
      // Not "could not be uploaded" — the message must NAME the missing
      // bucket and point at the repair, or the next production incident
      // is undiagnosable again. Weakening this to the generic message is
      // the mutation this check exists to catch.
      check(
        `the error names the missing bucket ("${toastText.slice(0, 90)}")`,
        /'user-files' bucket is missing/.test(toastText)
      );
      check("and points at the repair", /storage repair SQL/i.test(toastText));
      bucketExists = true;
      await bc.close();
    }

    console.log("\n== 11. the mock saw nothing it does not implement ==");
    check(
      `no unexpected backend calls (${unexpected.length})`,
      unexpected.length === 0,
      unexpected.slice(0, 10).join("\n        ")
    );
  }
} catch (err) {
  failures.push("unhandled error");
  console.log(`  FAIL  unhandled error\n        ${err.stack ?? err.message}`);
} finally {
  await browser.close();
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
