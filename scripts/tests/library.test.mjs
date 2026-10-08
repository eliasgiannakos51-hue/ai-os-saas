/*
 * THE LIBRARY (MASTER 4.1, package 5): «φτιάχνω κάτι σε τρία εργαλεία και
 * τα βρίσκω και τα τρία εκεί».
 *
 * What this holds, against the code and the migrations rather than its
 * comments:
 *
 *   1. THE POPULATION. Every table a tool of the shell inserts into is a
 *      source of the Library, or is named below as a part of another row
 *      with the reason — both ways, so neither list can go stale.
 *   2. Every column a source reads exists in supabase/migrations/.
 *   3. loadLibrary, run against a fake database: every query carries the
 *      owner, a failing table is reported and not read as "nothing made",
 *      failed things are left out, the newest come first across tools, one
 *      kind reads one table, and a search finds what a thing SAYS — in a
 *      page's text but not its tags, inside a deck or a list of posts,
 *      with or without accents — and shows the words it was found by.
 *   4. The switch: the page reads it, draws the Library only when it is
 *      on, and keeps the entries one tab along.
 *   5. Pressing one opens it IN ITS TOOL ON THAT ITEM: each page passes
 *      the id to its shell, and an item older than the page's list is read
 *      on its own, by id AND owner.
 *   6. The words, in all ten languages.
 *
 * Run: node scripts/tests/library.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";
import { reachableFrom } from "../lib/route-graph.mjs";

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
const read = (p) => readFileSync(p, "utf8");
const code = (p) => stripComments(read(p));

const sources = await loadTs("src/lib/library/sources.ts");
const load = await loadTs("src/lib/library/load.ts");
const requested = await loadTs("src/lib/library/requested.ts");
const SOURCES = sources.LIBRARY_SOURCES;
const sourceTables = new Set(SOURCES.map((s) => s.table));

console.log("library");

// ---------------------------------------------------------------------
console.log("\n== 1. every table a tool of the shell writes to is in the Library ==");
// ---------------------------------------------------------------------
// The tools of the shell (MASTER 14.3) and Documents, by the API they
// write through — FOLLOWING IMPORTS, because Files inserts its row in
// lib/files/ingest.ts, not in the route. The population is every table
// that code inserts into.
const TOOL_ROUTES = ["websites", "presentations", "posts", "documents", "research", "data-analysis", "files"];
// Rows that are a PART of another row, not a thing somebody made.
const PART_OF_ANOTHER = {
  website_versions: "an earlier version of a site, reached from the site",
  website_reference_images: "a photo given to a site, shown with the site",
  site_versions: "a published version of a site, reached from the site",
  published_sites: "a site put online, reached from the site",
  website_form_submissions: "what a visitor sent through a published site, not something made here",
  data_analysis_questions: "a question asked of an analysis, shown with it",
  data_analysis_charts: "a chart of an analysis, shown with it",
  file_collections: "a folder of files, not a file",
  file_collection_items: "a file's place in a folder",
};
// What the same code writes ABOUT the work — money, logs, jobs, messages
// to the person — and is nobody's made thing.
const BOOKKEEPING = {
  agent_runs: "a log of an agent's run",
  automation_runs: "a log of an automation's run; what it saves goes to the Library as a user_documents row",
  ai_jobs: "the queue a long job runs through",
  ai_provider_log: "which model answered, for the owner",
  credit_transactions: "credits spent",
  user_credits: "the credit balance",
  usage_overage_ledger: "usage past the plan",
  usage_overage_settings: "the person's setting for usage past the plan",
  rate_limit_log: "the rate limit's own count",
  security_check_log: "a security check's result",
  email_send_log: "an email that was sent",
  integration_sync_log: "a connection's sync log",
  notification_channels: "where notifications go",
  notification_events: "a notification that was sent",
  user_notifications: "a notification in the bell",
  user_delivery_channels: "where a result is delivered",
  user_integrations: "a connected service",
  ai_missions: "a goal, the Goals tool's own record, reached from it",
};
function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const toolCode = reachableFrom(TOOL_ROUTES.flatMap((route) => filesUnder(join("src/app/api", route))));
const inserted = new Set();
for (const file of toolCode) {
  for (const m of code(file).matchAll(/from\("([a-z_]+)"\)\s*\.(?:insert|upsert)\(/g)) inserted.add(m[1]);
}
check(`the scan found the tools' tables (${inserted.size})`, inserted.size >= 7, [...inserted].join(", "));
const missing = [...inserted].filter((t) => !sourceTables.has(t) && !(t in PART_OF_ANOTHER) && !(t in BOOKKEEPING));
check("every table a tool inserts into is a Library source, a named part of another row, or bookkeeping", missing.length === 0, missing.join(", "));
const stale = [...Object.keys(PART_OF_ANOTHER), ...Object.keys(BOOKKEEPING)].filter((t) => !inserted.has(t));
check("every name on those two lists is still written by these tools", stale.length === 0, stale.join(", "));
const both = SOURCES.map((s) => s.table).filter((t) => t in PART_OF_ANOTHER || t in BOOKKEEPING);
check("no source is also excused", both.length === 0, both.join(", "));
const notWritten = SOURCES.filter((s) => !inserted.has(s.table)).map((s) => s.table);
check("every Library source is a table one of these tools really writes", notWritten.length === 0, notWritten.join(", "));
for (const table of ["user_websites", "ai_presentations", "generated_posts"]) {
  check(`the three tools of the acceptance are there: ${table}`, sourceTables.has(table));
}

// ---------------------------------------------------------------------
console.log("\n== 2. every column a source reads exists in the migrations ==");
// ---------------------------------------------------------------------
const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => read(join("supabase/migrations", f))).join("\n");
function columnsOf(table) {
  const cols = new Set();
  const create = new RegExp(`create table (?:if not exists )?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "gi");
  for (const m of migrations.matchAll(create)) {
    for (const line of m[1].split("\n")) {
      const col = line.trim().match(/^([a-z_]+)\s+[a-z]/i);
      if (col) cols.add(col[1].toLowerCase());
    }
  }
  const add = new RegExp(`alter table (?:if exists )?(?:public\\.)?${table}\\b[\\s\\S]*?;`, "gi");
  for (const m of migrations.matchAll(add)) {
    for (const c of m[0].matchAll(/add column (?:if not exists )?([a-z_]+)/gi)) cols.add(c[1].toLowerCase());
  }
  return cols;
}
for (const source of SOURCES) {
  const cols = columnsOf(source.table);
  const wanted = [...source.columns.split(","), ...source.contentColumns.split(","), source.timeColumn, "user_id"].map((c) => c.trim()).filter(Boolean);
  const absent = wanted.filter((c) => !cols.has(c));
  check(`${source.table}: ${wanted.length} columns all exist`, absent.length === 0, absent.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 3. loadLibrary against a fake database ==");
// ---------------------------------------------------------------------
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ROWS = {
  user_websites: [
    { id: "a1", user_id: ME, name: "Camping Νάξος", status: "completed", created_at: "2026-10-07T10:00:00Z", html_content: '<html><body class="hero"><h1>Καλώς ήρθατε</h1><p>Σκηνές δίπλα στη θάλασσα, με καφές το πρωί.</p></body></html>' },
    { id: "a2", user_id: ME, name: "Χαλασμένο", status: "failed", created_at: "2026-10-07T11:00:00Z", html_content: "" },
    { id: "a3", user_id: OTHER, name: "Κάποιου άλλου", status: "completed", created_at: "2026-10-07T12:00:00Z", html_content: "<p>καφές</p>" },
  ],
  ai_presentations: [
    { id: "b1", user_id: ME, title: "Παρουσίαση για επενδυτές", description: null, error: null, created_at: "2026-10-07T09:00:00Z", slides: { title: "Επενδυτές", slides: [{ title: "Αγορά", bullets: ["Τριπλάσια ζήτηση το καλοκαίρι"] }] } },
    { id: "b2", user_id: ME, title: "Απέτυχε", description: null, error: "model", created_at: "2026-10-07T09:30:00Z", slides: null },
  ],
  generated_posts: [
    { id: "c1", user_id: ME, description: "Ανακοίνωση εγκαινίων", status: "done", created_at: "2026-10-07T12:30:00Z", posts: { instagram: { text: "Ανοίγουμε το Σάββατο!" } } },
  ],
  user_documents: [],
  research_reports: [{ id: "d1", user_id: ME, topic: "Αγορά camping", status: "researching", created_at: "2026-10-07T07:00:00Z", sections: [] }],
  data_analyses: [],
  user_files: [],
};
function fakeSupabase({ failTable = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, eq: [], order: null, limit: null, select: null };
      calls.push(call);
      const q = {
        select(cols) { call.select = cols; return q; },
        eq(col, val) { call.eq.push([col, val]); return q; },
        order(col, opts) { call.order = [col, opts?.ascending]; return q; },
        limit(n) { call.limit = n; return q; },
        then(resolve) {
          if (table === failTable) return resolve({ data: null, error: { message: "relation does not exist" } });
          let rows = (ROWS[table] ?? []).filter((r) => call.eq.every(([c, v]) => r[c] === v));
          const [col] = call.order ?? [];
          rows = [...rows].sort((x, y) => String(y[col]).localeCompare(String(x[col])));
          return resolve({ data: rows.slice(0, call.limit ?? rows.length), error: null });
        },
      };
      return q;
    },
  };
}

{
  const db = fakeSupabase();
  const { items, failed } = await load.loadLibrary(db, ME, { kind: null, query: "" });
  check("every source is read once", db.calls.length === SOURCES.length, db.calls.map((c) => c.table).join(","));
  check("every query carries the owner, not RLS alone", db.calls.every((c) => c.eq.some(([col, v]) => col === "user_id" && v === ME)));
  check("every query is newest first by its own time column", db.calls.every((c) => {
    const s = SOURCES.find((x) => x.table === c.table);
    return c.order && c.order[0] === s.timeColumn && c.order[1] === false;
  }));
  check("every query is bounded", db.calls.every((c) => c.limit === load.PER_SOURCE_LIMIT));
  check("without a search, no page text, deck or file text is read", db.calls.every((c) => {
    const s = SOURCES.find((x) => x.table === c.table);
    return !s.contentColumns.split(",").some((col) => c.select.split(",").map((x) => x.trim()).includes(col.trim()));
  }));
  check("the three tools' things are all found", ["site", "slides", "posts"].every((k) => items.some((i) => i.kind === k)), items.map((i) => i.kind).join(","));
  check("what failed to be made is left out", !items.some((i) => i.id === "a2" || i.id === "b2"));
  check("a research still running is not in the Library yet", !items.some((i) => i.id === "d1"));
  check("nobody else's site", !items.some((i) => i.id === "a3"));
  // Posts are read third and are the newest, so only a real sort puts them first.
  check("newest first across tools", items.map((i) => i.id).join(",") === "c1,a1,b1", items.map((i) => i.id).join(","));
  check("each opens in its own tool, on that item", items.find((i) => i.id === "b1").href === "/dashboard/presentations?record=b1");
  check("nothing failed", failed.length === 0);
}
{
  const db = fakeSupabase({ failTable: "generated_posts" });
  const { items, failed } = await load.loadLibrary(db, ME, { kind: null, query: "" });
  check("a table that fails is reported by its kind", failed.join(",") === "posts", failed.join(","));
  check("...and the rest is still shown", items.some((i) => i.kind === "site"));
}
{
  const db = fakeSupabase();
  const { items } = await load.loadLibrary(db, ME, { kind: "slides", query: "" });
  check("one kind reads one table", db.calls.length === 1 && db.calls[0].table === "ai_presentations");
  check("...and shows only that kind", items.length === 1 && items[0].kind === "slides");
}
async function search(query) {
  const db = fakeSupabase();
  const out = await load.loadLibrary(db, ME, { kind: null, query });
  return { ...out, db };
}
{
  const { items, db } = await search("θαλασσα");
  check("a search reads the content columns", db.calls.some((c) => c.select.includes("html_content")));
  check('a site is found by what its page says, without the accent ("θαλασσα")', items.length === 1 && items[0].id === "a1", items.map((i) => i.id).join(","));
  check("...and shows the words it was found by", (items[0]?.snippet ?? "").includes("θάλασσα"), items[0]?.snippet);
}
check('a page\'s tags are not its words ("hero" is a class)', (await search("hero")).items.length === 0);
{
  const { items } = await search("τριπλασια ζητηση");
  check("a deck is found by a bullet inside a slide", items.length === 1 && items[0].id === "b1");
}
{
  const { items } = await search("Σαββατο");
  check("posts are found by the text of one post", items.length === 1 && items[0].id === "c1");
}
{
  const { items } = await search("ΚΑΦΕΣ");
  check('upper case without accents finds "καφές" in my site, and not in somebody else\'s', items.length === 1 && items[0].id === "a1", items.map((i) => i.id).join(","));
}
{
  const { items } = await search("επενδυτες");
  check("a match in the name shows no snippet", items.length === 1 && items[0].id === "b1" && items[0].snippet === null);
}
check("a search for nothing they made finds nothing", (await search("ποδήλατο")).items.length === 0);
{
  // A file's text as extraction stores it (lib/files/extract.ts): each page
  // behind a marker whose label is English. The snippet is the file's
  // words; a sheet's own name stays searchable (2026-10-08).
  ROWS.user_files.push({
    id: "e1", user_id: ME, filename: "Symvasi.pdf", processing_status: "ready", uploaded_at: "2026-10-07T06:00:00Z",
    extracted_text: "[[PAGE 1|Page 1]]\nΚείμενο.\n\n[[PAGE 2|Page 2]]\nΤο μίσθωμα είναι 4.820 ευρώ.\n\n[[PAGE 3|Πωλήσεις Ιουνίου]]\nΤέλος.",
  });
  const { items } = await search("μισθωμα");
  check("a file is found by what it says, its snippet its words with no page marker or English label",
    items.length === 1 && items[0].id === "e1" && (items[0].snippet ?? "").includes("4.820") && !/\[\[PAGE|Page \d/.test(items[0].snippet ?? ""), items[0]?.snippet);
  check("...the markers are not its words (\"page\" finds nothing), a sheet's own name is",
    (await search("page")).items.length === 0 && (await search("πωλησεις ιουνιου")).items.length === 1);
  ROWS.user_files.length = 0;
}
check("textOfHtml drops scripts and styles", sources.textOfHtml("<style>.x{}</style><script>var y</script><p>ναι</p>") === "ναι");
check("a long search is cut at the page (200 characters)", /searchParams\.q\.slice\(0, 200\)/.test(code("src/app/dashboard/timeline/page.tsx")));

// ---------------------------------------------------------------------
console.log("\n== 4. the switch ==");
// ---------------------------------------------------------------------
const timeline = code("src/app/dashboard/timeline/page.tsx");
check('the page reads the switch "library"', /const library = await isFeatureOn\("library", user\)/.test(timeline));
check("the Library is drawn only with the switch on, and not on the entries tab", /if \(library && searchParams\.view !== "entries"\) \{[\s\S]*?<LibraryView/.test(timeline));
check("the entries keep their filters on their tab", /<TimelineFilters[^>]*entriesView=\{library\}/.test(timeline));
const tabs = code("src/components/timeline/timeline-tabs.tsx");
check("with the switch on, the entries are one tab along", /href: library \? "\/dashboard\/timeline\?view=entries" : "\/dashboard\/timeline"/.test(tabs));
check("with it off, no Library tab", /\.\.\.\(library \? \[\{ id: "library"/.test(tabs));
check("the filters stay on the entries tab", /if \(entriesView\) params\.set\("view", "entries"\)/.test(code("src/components/timeline/timeline-filters.tsx")));
check('"library" is declared as a switch', /\n  library: "/.test(code("src/lib/flags/flags.ts")));

// ---------------------------------------------------------------------
console.log("\n== 5. pressing one opens it in its tool, on that item ==");
// ---------------------------------------------------------------------
check("an id is a UUID or nothing", requested.readRequestedId("33333333-3333-4333-8333-333333333333") === "33333333-3333-4333-8333-333333333333"
  && requested.readRequestedId("1 or 1=1") === null && requested.readRequestedId(["x"]) === null && requested.readRequestedId(undefined) === null);
const PAGES = [
  ["website-builder", "project", "user_websites", "WebsiteShell"],
  ["presentations", "record", "ai_presentations", "PresentationsShell"],
  ["posts", "record", "generated_posts", "PostsShell"],
  ["deep-research", "record", "research_reports", "ResearchShell"],
];
for (const [page, param, table, shell] of PAGES) {
  const src = code(`src/app/dashboard/${page}/page.tsx`);
  check(`${page}: the id is read from ?${param}=`, new RegExp(`readRequestedId\\((?:searchParams\\??\\.${param}|requestedRecord)\\)`).test(src));
  const flat = src.replace(/\s+/g, "");
  check(`${page}: an item older than the list is read by id AND owner`, new RegExp(`\\.from\\("${table}"\\)\\.select\\((?:[A-Z_]+|"\\*")\\)\\.eq\\("id",wanted\\)\\.eq\\("user_id",user\\.id\\)\\.maybeSingle\\(\\)`).test(flat));
  check(`${page}: the shell is given it`, new RegExp(`<${shell}[\\s\\S]*?initialOpenId=\\{wanted\\}`).test(src));
}
check("files: the shell is given the asked file", /<FilesShell initialFiles=\{rows\} initialOpenId=\{readRequestedId\(searchParams\.record\)\}/.test(code("src/app/dashboard/files/page.tsx")));
const SHELL_OPENS = [
  ["src/components/website-builder/website-shell.tsx", /useState<string \| null>\(opened\)[\s\S]*?useState<"site" \| "recent" \| null>\(opened \? "site" : null\)/],
  ["src/components/presentations/presentations-shell.tsx", /decks\.find\(\(d\) => d\.id === initialOpenId\)[\s\S]*?open \? "deck"/],
  ["src/components/posts/posts-shell.tsx", /history\.find\(\(row\) => row\.id === initialOpenId && row\.set\)[\s\S]*?asked \? "posts" : null/],
  ["src/components/research/research-shell.tsx", /initialReports\.find\(\(r\) => r\.id === initialOpenId\)[\s\S]*?asked \? "report" : null[\s\S]*?if \(askedId\) void refresh\(askedId\)/],
  ["src/components/files/files-shell.tsx", /initialFiles\.find\(\(f\) => f\.id === initialOpenId\)[\s\S]*?\[asked\.id\][\s\S]*?asked \? "files" : null/],
];
for (const [file, shape] of SHELL_OPENS) {
  check(`${file.split("/").pop()} opens on the asked item`, shape.test(code(file)));
}

// ---------------------------------------------------------------------
console.log("\n== 6. the words, in every language ==");
// ---------------------------------------------------------------------
const KEYS = ["description", "tab", "searchLabel", "searchPlaceholder", "searchButton", "searchScope", "kindsLabel", "all", "failed", "untitled", "empty.title", "empty.why", "noMatch.title", "noMatch.why", ...sources.LIBRARY_KINDS.map((k) => `kinds.${k}`)];
check(`the words to look for (${KEYS.length})`, KEYS.length >= 21);
for (const locale of readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))) {
  const lib = JSON.parse(read(`messages/${locale}.json`)).dashboard?.library ?? {};
  const get = (k) => k.split(".").reduce((o, p) => (o ? o[p] : undefined), lib);
  const empty = KEYS.filter((k) => typeof get(k) !== "string" || !get(k).trim());
  check(`${locale}: the Library's words (${KEYS.length})`, empty.length === 0, empty.join(", "));
  check(`${locale}: the search is named in "nothing says…", not escaped`, /\{query\}/.test(get("noMatch.title") ?? "") && !/'\{query\}'/.test(get("noMatch.title") ?? ""));
  check(`${locale}: the tools that failed are named`, /\{tools\}/.test(get("failed") ?? ""));
}
check("the Library says how far a search reaches, from the number the code uses", /60/.test(JSON.parse(read("messages/el.json")).dashboard.library.searchScope) && load.PER_SOURCE_LIMIT === 60);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
