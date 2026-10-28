/*
 * «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» (the owner's message, 2026-10-28), Κομμάτι 1, IN
 * THE BUILT APP: list left, project right, real presses, desktop and
 * phone — no owner screenshot exists to compare against (flagged in
 * docs/NEEDS-FROM-ELIAS.md), so this is the stand-in docs/TOOL-RULES.md
 * rule 3 asks for: a real production build, real taps, in place of
 * Κομμάτι 1's own "στιγμιότυπο δίπλα στην εικόνα" check.
 *
 * NOTHING HERE TOUCHES THE MODEL OR CREDITS — Κομμάτι 1 is pure layout,
 * so there is no local Anthropic stand-in server, unlike
 * my-stuff-workspace.prodtest.mjs's own Κομμάτι 2 section.
 *
 * THE "projects" TABLE NEEDS REAL INSERT/DELETE, not the shared mock's
 * plain GET-shaped default (startMockSupabase's own `rowsFor` ignores the
 * HTTP method entirely) — the create form and the delete button both have
 * to actually change what the next read sees. handleProjects() below
 * mirrors my-stuff-workspace.prodtest.mjs's own handleSessions().
 *
 * Run: node scripts/tests/projects-workspace.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/projects-workspace.prodtest.mjs
 */
import http from "node:http";
import crypto from "node:crypto";
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

// Real uuids: isUuid()/projectEdgeFilter() (lib/projects/project.ts) both
// require the shape, not just any string, and load-project-detail.ts
// throws rather than silently reading nothing for one that is not.
const PROJECT_1 = "11111111-1111-1111-1111-111111111111";
const PROJECT_2 = "22222222-2222-2222-2222-222222222222";
const PROJECTS = [
  { id: PROJECT_1, user_id: MOCK_USER.id, name: "Καλοκαιρινή καμπάνια", goal: "Αύξηση πωλήσεων τον Αύγουστο", status: "active", primary_colour: null, secondary_colour: null, created_at: "2026-08-15T10:00:00Z" },
  { id: PROJECT_2, user_id: MOCK_USER.id, name: "Νέος ιστότοπος", goal: null, status: "active", primary_colour: null, secondary_colour: null, created_at: "2026-09-01T10:00:00Z" },
];
// Real members of PROJECT_1, one per Κομμάτι 3 count box (site/posts/
// images/documents — video has none, honestly, nothing writes ai_videos
// yet) — proves the detail pane's join (members resolved to headlines
// through the module registry) actually runs end to end in the built
// app, not just in projects.test.mjs's own pure-function checks, AND
// that the five boxes read real counts, not a hardcoded shape.
const IMAGES = [{ id: "im1", prompt: "Αφίσα για καλοκαιρινή προσφορά", status: "done", created_at: "2026-08-16T10:00:00Z" }];
const WEBSITES = [{ id: "w1", name: "Το καλοκαιρινό site", status: "done", created_at: "2026-08-17T10:00:00Z" }];
const POSTS = [{ id: "po1", description: "Σετ αναρτήσεων Αυγούστου", status: "done", created_at: "2026-08-18T10:00:00Z" }];
const DOCUMENTS = [{ id: "do1", title: "Προσφορά καλοκαιρινής καμπάνιας", created_at: "2026-08-19T10:00:00Z" }];
const ENTITY_LINKS = [
  { source_table: "generated_images", source_id: "im1", target_table: "projects", target_id: PROJECT_1, relationship_type: "in_project", created_at: "2026-08-16T10:05:00Z" },
  { source_table: "user_websites", source_id: "w1", target_table: "projects", target_id: PROJECT_1, relationship_type: "in_project", created_at: "2026-08-17T10:05:00Z" },
  { source_table: "generated_posts", source_id: "po1", target_table: "projects", target_id: PROJECT_1, relationship_type: "in_project", created_at: "2026-08-18T10:05:00Z" },
  { source_table: "user_documents", source_id: "do1", target_table: "projects", target_id: PROJECT_1, relationship_type: "in_project", created_at: "2026-08-19T10:05:00Z" },
];

function handleProjects({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
  if (table !== "projects") return false;
  const idParam = [...url.searchParams].find(([k]) => k === "id")?.[1];
  const id = idParam?.startsWith("eq.") ? idParam.slice(3) : null;
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") {
    // The real query is `.order("created_at", { ascending: false })` —
    // the route relies on the DATABASE for that order, so this stand-in
    // has to sort too, not just hold the rows in insertion order.
    const sorted = [...PROJECTS].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return answer(id ? sorted.filter((p) => p.id === id) : sorted), true;
  }
  if (req.method === "POST") {
    const row = {
      id: crypto.randomUUID(),
      user_id: MOCK_USER.id,
      status: "active",
      primary_colour: null,
      secondary_colour: null,
      created_at: new Date().toISOString(),
      ...JSON.parse(body || "{}"),
    };
    PROJECTS.push(row);
    return answer([row]), true;
  }
  if (req.method === "PATCH") {
    const hit = id ? PROJECTS.filter((p) => p.id === id) : [];
    for (const row of hit) Object.assign(row, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  if (req.method === "DELETE") {
    const idx = id ? PROJECTS.findIndex((p) => p.id === id) : -1;
    const removed = idx >= 0 ? PROJECTS.splice(idx, 1) : [];
    return answer(removed), true;
  }
  return false;
}

const supa = await startMockSupabase({
  port: 54416,
  tableRows: { projects: PROJECTS, entity_links: ENTITY_LINKS, generated_images: IMAGES, user_websites: WEBSITES, generated_posts: POSTS, user_documents: DOCUMENTS },
  handle: (ctx) => handleProjects(ctx),
});

let server;
let browser;
function cleanup() {
  // DETACHED + GROUP KILL, not server.kill(): `npx next start` spawns a
  // grandchild `next-server` process (scripts/tests/prodtest-hygiene.test.mjs's
  // own section 4).
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { browser?.close(); } catch {}
  try { supa.close(); } catch {}
}
process.on("exit", cleanup);

async function start(env) {
  const port = await new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port: p } = probe.address();
      probe.close(() => resolve(p));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}

/**
 * .first(), NOT A BARE LOCATOR, ON projects-detail-name/-goal AFTER A
 * RELOAD OR A CROSS-PROJECT page.goto() — found live, repeatedly: this
 * testid briefly resolves to TWO elements, one hidden, for a window
 * whose length is unpredictable (clear in under a second on one run,
 * still there after 20s of polling on another, same machine, same
 * seed). A direct fetch() of the exact same URL, ten times in a row,
 * NEVER showed the duplicate in the raw server HTML — so this is a
 * client-side rendering artifact, not a data bug, and the two copies
 * (confirmed by dumping both) always carry the IDENTICAL value. Given
 * that invariant, .first() reads/writes the right thing either way,
 * without depending on a window this file could not pin down a cause
 * for. Flagged in docs/PROGRESS.md for whoever next works the common
 * dashboard shell — it deserves a real root-cause, just not one this
 * round's own scope (Κομμάτι 3, the count boxes) is about.
 */
function one(page, selector) {
  return page.locator(selector).first();
}

async function open(origin, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [{ ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" }].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.first().evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.first().click();
    const box = await locator.first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}

const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ANTHROPIC_API_KEY: "placeholder-unused-by-this-screen",
  // The real free-plan cap is 1 (project-limits.ts) and this account's
  // own plan resolves to free (no subscription row in this mock) — the
  // two seeded projects are already over it, by design, and Κομμάτι 1 is
  // about the layout, not the cap (that is its own, already-covered
  // concern in projects.test.mjs §... "the plan's project cap"). Lifted
  // here so the create-a-project check below is not a false 402.
  PROJECT_LIMIT_FREE: "unlimited",
};

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
  const APP = await start(base);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  console.log("\n== desktop: the screen is list left, project right ==");
  {
    const { page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/projects`, { waitUntil: "load" });
    await page.locator('[data-testid="projects-list-row"]').first().waitFor({ timeout: 15_000 });

    check("both real projects are listed", (await page.locator('[data-testid="projects-list-row"]').count()) === 2);
    check(
      "newest-first: Νέος ιστότοπος (2026-09-01) leads over Καλοκαιρινή καμπάνια (2026-08-15)",
      (await page.locator('[data-testid="projects-list-row"]').first().innerText()).includes("Νέος ιστότοπος")
    );
    check("nothing is selected on first visit", (await page.locator('[aria-current="true"]').count()) === 0);
    check("the right pane asks to pick one, honestly — projects exist, nothing is just hidden", (await page.locator('[data-testid="projects-select-prompt"]').count()) === 1);
    check("...not the 'no projects yet' empty state, which would be the wrong message", (await page.locator('[data-testid="projects-empty-state"]').count()) === 0);

    const row1 = page.locator('[data-testid="projects-list-row"]').filter({ hasText: "Καλοκαιρινή καμπάνια" });
    await press(row1);
    await page.waitForURL(`${APP}/dashboard/projects?id=${PROJECT_1}`, { timeout: 10_000 });
    // Κομμάτι 2 made this an <input> (hand-editable, see below) — .inputValue(),
    // not .innerText(), which reads nothing off a form control.
    check("selecting a row shows ITS OWN name in the detail pane", (await one(page, '[data-testid="projects-detail-name"]').inputValue()) === "Καλοκαιρινή καμπάνια");
    check("...and the url names it, so a reload or a bookmark opens the same one", page.url() === `${APP}/dashboard/projects?id=${PROJECT_1}`);
    check("...and the selected row is the only one marked current", (await page.locator('[aria-current="true"]').count()) === 1);
    const detailText1 = await page.locator('[data-testid="projects-detail-pane"]').innerText();
    // Κομμάτι 2 moved the goal off static text into a <textarea> — innerText
    // on an ancestor does not surface a form control's value, so this is
    // .inputValue() on the field itself, same reason as the name above.
    check("its own goal text is shown", (await one(page, '[data-testid="projects-detail-goal"]').inputValue()) === "Αύξηση πωλήσεων τον Αύγουστο");
    check("its one real member (an image) is resolved to its own headline, not a blank row", detailText1.includes("Αφίσα για καλοκαιρινή προσφορά"));

    // Κομμάτι 3: the five count boxes — one real member each of site/
    // posts/images/documents (seeded above), none of video (honest 0,
    // nothing writes ai_videos yet).
    check("site: 1", (await page.locator('[data-testid="project-kind-count-site"]').innerText()).startsWith("1"));
    check("posts: 1", (await page.locator('[data-testid="project-kind-count-posts"]').innerText()).startsWith("1"));
    check("images: 1", (await page.locator('[data-testid="project-kind-count-images"]').innerText()).startsWith("1"));
    check("video: 0, honestly — nothing generates one yet", (await page.locator('[data-testid="project-kind-count-video"]').innerText()).startsWith("0"));
    check("documents: 1", (await page.locator('[data-testid="project-kind-count-documents"]').innerText()).startsWith("1"));

    const row2 = page.locator('[data-testid="projects-list-row"]').filter({ hasText: "Νέος ιστότοπος" });
    await press(row2);
    await page.waitForURL(`${APP}/dashboard/projects?id=${PROJECT_2}`, { timeout: 10_000 });
    const detailText2 = await page.locator('[data-testid="projects-detail-pane"]').innerText();
    check(
      "picking the OTHER project swaps the pane to ITS content",
      (await one(page, '[data-testid="projects-detail-name"]').inputValue()) === "Νέος ιστότοπος" && !detailText2.includes("Αφίσα για καλοκαιρινή προσφορά")
    );
    check("...and the first project's row is no longer current", (await row1.getAttribute("aria-current")) === null);
    // SCOPED TO THIS PROJECT ONLY — project 2 has none of the four
    // members project 1 does, so all five boxes read zero here, not a
    // leaked total from the account's other project.
    check("the OTHER project's own count boxes are all zero (nothing linked to it)",
      (await Promise.all(["site", "posts", "images", "video", "documents"].map((k) => page.locator(`[data-testid="project-kind-count-${k}"]`).innerText()))).every((s) => s.startsWith("0")));

    await page.locator('[data-testid="projects-new-name"]').fill("Φθινοπωρινή προσφορά");
    await page.locator('[data-testid="projects-new-goal"]').fill("Ξεπούλημα αποθέματος");
    await press(page.locator('[data-testid="projects-new-create"]'));
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="projects-detail-name"]'))?.value === "Φθινοπωρινή προσφορά",
      { timeout: 10_000 }
    );
    check("the created project is now in the list (3 total)", (await page.locator('[data-testid="projects-list-row"]').count()) === 3);
    check("...and it opens selected, as the thing that was just made", (await one(page, '[data-testid="projects-detail-name"]').inputValue()) === "Φθινοπωρινή προσφορά");

    page.once("dialog", (d) => d.accept());
    await press(page.locator('[data-testid="projects-list-item"]').filter({ hasText: "Νέος ιστότοπος" }).locator('[data-testid="projects-list-delete"]'));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="projects-list-row"]').length === 2);
    check("deleting a project removes it from the list (back to 2)", (await page.locator('[data-testid="projects-list-row"]').count()) === 2);
    // The owner's own ΔΕΝ ΚΑΝΕΙ rule — deleting a project must not delete its
    // member items — needs no UI proof here: this mock's DELETE handler
    // never touches entity_links or any member table, so a passing check
    // against it here could never go red. The real guarantee is proven
    // against the migration's actual SQL in projects.test.mjs §4 ("the
    // delete trigger touches only entity_links").

    await page.goto(`${APP}/dashboard/projects/${PROJECT_1}`, { waitUntil: "load" });
    await page.waitForURL(`${APP}/dashboard/projects?id=${PROJECT_1}`, { timeout: 10_000 });
    check("the old per-project address still opens the right one, through its own redirect", (await one(page, '[data-testid="projects-detail-name"]').inputValue()) === "Καλοκαιρινή καμπάνια");

    await page.goto(`${APP}/dashboard/projects?ask=${encodeURIComponent("Οργάνωσε τη μετακόμιση")}`, { waitUntil: "load" });
    check("?ask= is still read — it seeds the new-project goal field rather than going unread", (await page.locator('[data-testid="projects-new-goal"]').inputValue()) === "Οργάνωσε τη μετακόμιση");

    // == Κομμάτι 2: title + goal, hand-editable, persisting after refresh ==
    await press(row1);
    await page.waitForURL(`${APP}/dashboard/projects?id=${PROJECT_1}`, { timeout: 10_000 });
    const nameField = one(page, '[data-testid="projects-detail-name"]');
    const goalField = one(page, '[data-testid="projects-detail-goal"]');
    check("the goal field holds the project's own goal, editable (a <textarea>, not static text)", (await goalField.inputValue()) === "Αύξηση πωλήσεων τον Αύγουστο");

    await nameField.fill("Καμπάνια Νοεμβρίου");
    await nameField.blur();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="projects-list-row"][aria-current="true"]')?.textContent?.includes("Καμπάνια Νοεμβρίου"),
      { timeout: 10_000 }
    );
    check("renaming also updates the matching row in the sidebar list, not just the field itself", (await page.locator('[data-testid="projects-list-row"][aria-current="true"]').innerText()).includes("Καμπάνια Νοεμβρίου"));

    await goalField.fill("Αύξηση πωλήσεων τον Νοέμβριο");
    await goalField.blur();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="projects-detail-goal"]'))?.value === "Αύξηση πωλήσεων τον Νοέμβριο",
      { timeout: 10_000 }
    );

    // THE DIRECTIVE'S OWN WORDS: "persisting after refresh" — a reload
    // re-fetches from the (mock) database through the server component,
    // so this is the one check that actually proves the PATCH reached
    // the server rather than just updating local state that a reload
    // would have exposed as never having been saved. See one()'s own
    // comment above for why this reads through .first().
    await page.reload({ waitUntil: "load" });
    await one(page, '[data-testid="projects-detail-name"]').waitFor({ timeout: 10_000 });
    check("the renamed title survives a reload — it reached the server, not just the screen", (await nameField.inputValue()) === "Καμπάνια Νοεμβρίου");
    check("the edited goal survives a reload too", (await goalField.inputValue()) === "Αύξηση πωλήσεων τον Νοέμβριο");

    // AN EMPTY NAME IS REFUSED, like the create form's own checkProjectName
    // — the field reverts rather than silently saving a blank project.
    await nameField.fill("");
    await nameField.blur();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="projects-detail-name"]'))?.value === "Καμπάνια Νοεμβρίου",
      { timeout: 10_000 }
    );
    check("an emptied name reverts rather than saving blank", (await nameField.inputValue()) === "Καμπάνια Νοεμβρίου");

    // SWITCHING PROJECTS DOES NOT LEAK THE PREVIOUS ONE'S EDITED FIELDS —
    // the exact bug a missing `key` on <ProjectDetail> would cause (and,
    // until this round, silently did for the colour pickers too).
    const row3 = page.locator('[data-testid="projects-list-row"]').filter({ hasText: "Φθινοπωρινή προσφορά" });
    await press(row3);
    await page.waitForURL(`${APP}/dashboard/projects?id=*`, { timeout: 10_000 });
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="projects-detail-name"]'))?.value === "Φθινοπωρινή προσφορά",
      { timeout: 10_000 }
    );
    check("picking a different project shows ITS OWN name, not the previous one's edited value", (await one(page, '[data-testid="projects-detail-name"]').inputValue()) === "Φθινοπωρινή προσφορά");
    // Project 3 WAS given a goal at creation ("Ξεπούλημα αποθέματος",
    // above) — "never edited" means "never edited HERE", not empty.
    check("...and ITS OWN goal (from when it was made), not the previous one's", (await one(page, '[data-testid="projects-detail-goal"]').inputValue()) === "Ξεπούλημα αποθέματος");

    // RESTORE project 1's original name/goal — this section renamed it to
    // prove the save path works, and the phone section below still looks
    // it up by its ORIGINAL name (its own concern is layout, not naming).
    // By URL, not by pressing a row filtered on the OLD name text — that
    // text is exactly what this step just changed, out from under itself.
    await page.goto(`${APP}/dashboard/projects?id=${PROJECT_1}`, { waitUntil: "load" });
    await one(page, '[data-testid="projects-detail-name"]').waitFor({ timeout: 10_000 });
    await nameField.fill("Καλοκαιρινή καμπάνια");
    await nameField.blur();
    await goalField.fill("Αύξηση πωλήσεων τον Αύγουστο");
    await goalField.blur();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="projects-list-row"][aria-current="true"]')?.textContent?.includes("Καλοκαιρινή καμπάνια"),
      { timeout: 10_000 }
    );
    check("renaming back to the original also round-trips cleanly (not a one-way save)", (await nameField.inputValue()) === "Καλοκαιρινή καμπάνια" && (await goalField.inputValue()) === "Αύξηση πωλήσεων τον Αύγουστο");
  }

  console.log("\n== phone (390x844): list OR project, never both ==");
  {
    const { page, press } = await open(APP, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${APP}/dashboard/projects`, { waitUntil: "load" });
    await page.locator('[data-testid="projects-list-row"]').first().waitFor({ timeout: 15_000 });

    check("the list pane is visible", await page.locator('[data-testid="projects-list-pane"]').isVisible());
    check("the detail pane is NOT — no room for both at 390px", !(await page.locator('[data-testid="projects-detail-pane"]').isVisible()));
    const { width: pageWidth } = page.viewportSize();
    check("the page itself does not scroll sideways", (await page.evaluate(() => document.documentElement.scrollWidth)) <= pageWidth + 1);

    const row = page.locator('[data-testid="projects-list-row"]').filter({ hasText: "Καλοκαιρινή καμπάνια" });
    await press(row);
    await one(page, '[data-testid="projects-detail-name"]').waitFor({ timeout: 10_000 });
    check("selecting a project now shows ONLY the detail pane, full-screen", !(await page.locator('[data-testid="projects-list-pane"]').isVisible()) && (await page.locator('[data-testid="projects-detail-pane"]').isVisible()));
    const back = page.locator('[data-testid="projects-detail-back"]');
    const backBox = await back.boundingBox();
    check("the back control is a real touch target (>=44px)", backBox.width >= 44 && backBox.height >= 44);

    await press(back);
    await page.locator('[data-testid="projects-list-pane"]').waitFor({ timeout: 10_000 });
    check("the back arrow returns to the list, not a dead end", await page.locator('[data-testid="projects-list-pane"]').isVisible());
  }

  console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
  cleanup();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (err) {
  console.log("  FAIL  unexpected error\n        " + String(err?.stack ?? err));
  cleanup();
  process.exit(1);
}
