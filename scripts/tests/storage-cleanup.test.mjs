// THE STORAGE SWEEP, RUN AGAINST A PROJECT THAT CAPS EVERY ANSWER.
//
// src/lib/websites/storage-cleanup.ts decides which uploaded photographs
// nothing needs and deletes them, every night, with the service-role key.
// Until 2026-11-05 each of its five in-use reads was one request with
// `.limit(50_000)`, and a hosted project answers at most max_rows (1,000
// by default) whatever the limit says. Past row 1,000 of any table that
// carries HTML, the photographs those rows embed looked unreferenced, and
// the sweep deleted them a day later.
//
// Everything here EXECUTES the sweep, through the real supabase-js
// client, against scripts/tests/lib/postgrest-max-rows.mjs — which caps
// each response the way PostgREST does, silently. Reading the source for
// `.range(` would pass a loop that stops on the first short page, and that
// loop is the same defect on a project whose max_rows is lower than the
// page asked for (§2).
//
//   1. an in-use list longer than 1,000 rows is read to the end
//   2. ...and so is one on a project with a max_rows below the page size
//   3. a read that fails, or answers nothing, deletes nothing
//   4. a row inserted behind the cursor mid-read stops the run
//   5. a run that would delete a large share deletes nothing
//   6. the route only authenticates and reports; it reads nothing itself
//
// Run: node scripts/tests/storage-cleanup.test.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";
import { schemaSql, tablesWithColumn } from "./lib/schema-sql.mjs";
import { postgrestMaxRows } from "./lib/postgrest-max-rows.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const sweep = await loadTs("src/lib/websites/storage-cleanup.ts");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5);
const OLD = new Date(NOW - 10 * DAY).toISOString();
const USER = "11111111-1111-4111-8111-111111111111";
const url = (path) => `https://x.supabase.co/storage/v1/object/public/website-references/${path}`;

/** A uuid whose order has nothing to do with `i`, so the primary key's
 *  order and the insertion order disagree, as they do in Postgres. */
const idFor = (seed) => {
  const h = createHash("sha1").update(String(seed)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Tables carrying `n` sites, site i embedding photo i (every twentieth
 *  in a sub-page rather than the home page — few enough that losing the
 *  sub-pages stays under the ceiling, so §1 sees it as deletions). */
function world({ sites, orphans, extraFiles = [] }) {
  const tables = { published_sites: [], website_versions: [], site_versions: [], website_reference_images: [] };
  tables.user_websites = Array.from({ length: sites }, (_, i) =>
    i % 20 === 0
      ? { id: idFor(`w${i}`), html_content: "<html><body>home</body></html>", pages: [{ slug: "gallery", label: "Gallery", html: `<img src="${url(`${USER}/site-${i}.jpg`)}">` }] }
      : { id: idFor(`w${i}`), html_content: `<html><body><img src="${url(`${USER}/site-${i}.jpg`)}"></body></html>`, pages: null }
  );
  const files = [
    ...Array.from({ length: sites }, (_, i) => ({ path: `${USER}/site-${i}.jpg`, created_at: OLD })),
    ...Array.from({ length: orphans }, (_, i) => ({ path: `${USER}/orphan-${i}.jpg`, created_at: OLD })),
    ...extraFiles,
  ];
  return { tables, files };
}

function clientFor(standIn) {
  return createClient("http://stand-in.invalid", "service-role-stand-in", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: standIn.fetch },
  });
}

async function run(w, { maxRows = 1000, onRequest = null, dryRun = false } = {}) {
  const standIn = postgrestMaxRows({ tables: w.tables, files: w.files, maxRows, onRequest });
  let report = null;
  let thrown = null;
  try {
    report = await sweep.runStorageCleanup(clientFor(standIn), { nowMs: NOW, dryRun });
  } catch (err) {
    thrown = err;
  }
  return { report, thrown, removed: standIn.removed, requests: standIn.requests };
}

const inUseRemoved = (removed) => removed.filter((p) => !/\/orphan-\d+\.jpg$/.test(p));

console.log("== 1. an in-use list longer than 1,000 rows is read to the end ==");
{
  // 1,100 sites and 3 true orphans: 1,103 files, a ceiling of 110. The
  // old single read stops at 1,000 rows, so 100 live photographs look
  // orphaned — under the ceiling, which is why the ceiling alone is not
  // the fix and this world is sized to stay under it.
  const w = world({ sites: 1100, orphans: 3 });
  const r = await run(w);
  ok("the run completes", r.thrown === null && r.report?.ok === true, r.thrown ? String(r.thrown.message ?? r.thrown) : JSON.stringify(r.report)?.slice(0, 300));
  ok("...having read every row past the first 1,000", r.report?.rowsRead?.user_websites === 1100,
    `read ${r.report?.rowsRead?.user_websites} of 1100`);
  ok("no photograph a site embeds is deleted", inUseRemoved(r.removed).length === 0,
    `${inUseRemoved(r.removed).length} in-use photographs deleted, e.g. ${inUseRemoved(r.removed).slice(0, 3).join(", ")}`);
  const subPage = (p) => { const m = p.match(/site-(\d+)\.jpg$/); return m !== null && Number(m[1]) % 20 === 0; };
  ok("...including the ones in sub-pages", !r.removed.some(subPage), r.removed.filter(subPage).slice(0, 3).join(", "));
  ok("the three true orphans are deleted", r.removed.length === 3 && r.report?.deleted === 3,
    `removed ${r.removed.length}, reported ${r.report?.deleted}`);
  // THE STAND-IN IS WHAT MAKES THIS MEAN ANYTHING. If it stopped capping,
  // the single `.limit(50_000)` read this replaced would pass every check
  // above — so it is asked that exact question, through the same client.
  const probe = postgrestMaxRows({ tables: world({ sites: 1100, orphans: 0 }).tables, files: [] });
  const { data: once } = await clientFor(probe).from("user_websites").select("id").limit(50_000);
  ok("control: the stand-in caps a .limit(50_000) read at 1,000 rows, as PostgREST does",
    Array.isArray(once) && once.length === 1000, `answered ${once?.length} of 1100`);
}

console.log("\n== 2. ...and on a project whose max_rows is below the page asked for ==");
{
  // EVERY page comes back short of IN_USE_PAGE_SIZE here. A loop that
  // stops on a short page reads 100 rows and calls the rest unreferenced.
  const w = world({ sites: 450, orphans: 1 });
  const r = await run(w, { maxRows: 100 });
  ok("the run completes", r.thrown === null && r.report?.ok === true, r.thrown ? String(r.thrown.message ?? r.thrown) : JSON.stringify(r.report)?.slice(0, 300));
  ok("...having read all 450 rows, 100 at a time", r.report?.rowsRead?.user_websites === 450, `read ${r.report?.rowsRead?.user_websites}`);
  ok("...and deleted only the orphan", r.removed.length === 1 && inUseRemoved(r.removed).length === 0, r.removed.slice(0, 5).join(", "));
  ok("the page asked for is below the default cap", sweep.IN_USE_PAGE_SIZE > 0 && sweep.IN_USE_PAGE_SIZE <= 1000, String(sweep.IN_USE_PAGE_SIZE));
}

console.log("\n== 3. a read that fails, or answers nothing, deletes nothing ==");
for (const table of [...sweep.HTML_TABLES, sweep.REFERENCE_TABLE]) {
  const w = world({ sites: 600, orphans: 5 });
  // Rows in every table, so each one has a second page to fail on.
  for (const t of [...sweep.HTML_TABLES, sweep.REFERENCE_TABLE]) {
    if (t === "user_websites") continue;
    w.tables[t] = Array.from({ length: 300 }, (_, i) => ({ id: idFor(`${t}${i}`), html_content: "<p>x</p>", pages: null, image_url: `${USER}/site-${i}.jpg` }));
  }
  const r = await run(w, {
    onRequest: ({ kind, table: t, page }) =>
      kind === "read" && t === table && page === 2
        ? new Response(JSON.stringify({ message: "canceling statement due to statement timeout" }), { status: 500, headers: { "Content-Type": "application/json" } })
        : undefined,
  });
  ok(`${table}: a failure on its second page deletes nothing`, r.removed.length === 0 && r.report === null,
    `removed ${r.removed.length}; report ${JSON.stringify(r.report)?.slice(0, 120)}`);
  ok(`${table}: ...and the error says which read failed`, /reading .+ failed after \d+ rows/.test(String(r.thrown?.message)) && String(r.thrown?.message).includes(table),
    String(r.thrown?.message));
}
{
  const w = world({ sites: 600, orphans: 5 });
  // A 200 with no body: supabase-js reports data null AND error null.
  const r = await run(w, {
    onRequest: ({ kind, table, page }) => (kind === "read" && table === "user_websites" && page === 2 ? new Response("", { status: 200 }) : undefined),
  });
  ok("a page that answers no rows array deletes nothing", r.removed.length === 0 && r.report === null, `removed ${r.removed.length}`);
  ok("...and says so", /returned no rows array/.test(String(r.thrown?.message)), String(r.thrown?.message));
}
{
  const w = world({ sites: 20, orphans: 5 });
  const r = await run(w, {
    onRequest: ({ kind, table }) => (kind === "count" && table === "website_reference_images" ? new Response(null, { status: 200 }) : undefined),
  });
  ok("a count that comes back empty deletes nothing", r.removed.length === 0 && r.report === null && /returned no count/.test(String(r.thrown?.message)),
    String(r.thrown?.message ?? JSON.stringify(r.report)));
}
{
  const w = world({ sites: 20, orphans: 5 });
  const r = await run(w, {
    onRequest: ({ kind, prefix }) => (kind === "list" && prefix === USER ? new Response(JSON.stringify({ message: "boom" }), { status: 500, headers: { "Content-Type": "application/json" } }) : undefined),
  });
  ok("a folder that cannot be listed stops the run, deleting nothing", r.removed.length === 0 && r.report === null, `removed ${r.removed.length}`);
}

console.log("\n== 4. a row inserted behind the cursor mid-read stops the run ==");
{
  // A site saved while the sweep reads: its id sorts before the cursor,
  // so the keyset read never reaches it — and it is the only thing that
  // embeds a photograph uploaded days ago.
  const w = world({ sites: 600, orphans: 0, extraFiles: [{ path: `${USER}/late.jpg`, created_at: OLD }] });
  let inserted = false;
  const r = await run(w, {
    onRequest: ({ kind, table, page, tables }) => {
      if (!inserted && kind === "read" && table === "user_websites" && page === 2) {
        inserted = true;
        tables.user_websites.push({ id: "00000000-0000-4000-8000-000000000000", html_content: `<img src="${url(`${USER}/late.jpg`)}">`, pages: null });
      }
      return undefined;
    },
  });
  ok("the stand-in did insert it", inserted);
  ok("the photograph only that row embeds survives", !r.removed.includes(`${USER}/late.jpg`), r.removed.join(", "));
  ok("...because the run stopped before deleting anything", r.removed.length === 0 && r.report === null, `removed ${r.removed.length}`);
  ok("...and says how many rows it read against how many there are", /read 600 rows of user_websites, which holds 601/.test(String(r.thrown?.message)), String(r.thrown?.message));
}

console.log("\n== 5. a run that would delete a large share deletes nothing ==");
{
  ok("the ceiling is a small share", sweep.MAX_DELETE_SHARE > 0 && sweep.MAX_DELETE_SHARE <= 0.25, String(sweep.MAX_DELETE_SHARE));
  ok("...with a floor for a small bucket", sweep.deleteCeiling(20) === sweep.MIN_DELETE_CEILING && sweep.deleteCeiling(5_000) === 500,
    `${sweep.deleteCeiling(20)}, ${sweep.deleteCeiling(5_000)}`);

  // 30 live, 30 orphaned: half the bucket. Exactly what a lost reference
  // source looks like, and three times the ceiling.
  const w = world({ sites: 30, orphans: 30 });
  const r = await run(w);
  ok("half the bucket orphaned: nothing is deleted", r.removed.length === 0, `removed ${r.removed.length}`);
  ok("...and the run reports that it stopped, and why",
    r.report?.ok === false && r.report?.stopped === "ceiling" && r.report?.wouldDelete === 30 && r.report?.deleted === 0,
    JSON.stringify(r.report)?.slice(0, 300));
  const dry = await run(world({ sites: 30, orphans: 30 }), { dryRun: true });
  ok("...a dry run stops at the same place", dry.report?.stopped === "ceiling" && dry.removed.length === 0, JSON.stringify(dry.report)?.slice(0, 200));

  const under = await run(world({ sites: 200, orphans: 12 }), { dryRun: true });
  ok("a dry run under the ceiling reports what it would delete", under.report?.ok === true && under.report?.deleted === 12, JSON.stringify(under.report)?.slice(0, 200));
  ok("...and deletes nothing", under.removed.length === 0, `removed ${under.removed.length}`);
  ok("...without a single remove request", !under.requests.some((q) => q.startsWith("REMOVE")), under.requests.filter((q) => q.startsWith("REMOVE")).join(", "));
}

console.log("\n== 6. every table that carries HTML is read, and the route reads nothing itself ==");
{
  // The migrations are the population (user-photos.test.mjs holds the
  // same rule against the source text); here against the list the sweep
  // actually iterates.
  const htmlTables = tablesWithColumn(schemaSql(), "html_content");
  ok("the schema still has tables carrying HTML to find", htmlTables.length >= 4, htmlTables.join(", "));
  const unread = htmlTables.filter((t) => !sweep.HTML_TABLES.includes(t));
  ok("...and the sweep iterates every one of them", unread.length === 0, `not read: ${unread.join(", ")}`);
  ok("...and the reference rows too", sweep.REFERENCE_TABLE === "website_reference_images");

  const route = stripComments(readFileSync("src/app/api/cron/website-storage-cleanup/route.ts", "utf8"));
  ok("the route runs the sweep with the service-role client", /runStorageCleanup\(admin, \{ nowMs: Date\.now\(\), dryRun \}\)/.test(route));
  ok("...and has no read or delete of its own", !/\.from\(|\.remove\(|\.list\(/.test(route), route.match(/\.(from|remove|list)\([^)]*\)/)?.[0]);
  ok("...after authenticating", route.indexOf("checkCronAuth(request)") > 0 && route.indexOf("checkCronAuth(request)") < route.indexOf("createAdminClient()"));
  ok("a stopped run is logged, not only answered",
    /if \(!report\.ok\) \{[\s\S]{0,200}logApiError\(/.test(route), route.slice(route.indexOf("if (!report.ok)"), route.indexOf("if (!report.ok)") + 200));
  ok("...and answered as a failure", /return NextResponse\.json\(report, \{ status: 409 \}\);/.test(route));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
