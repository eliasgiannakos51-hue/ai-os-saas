// ONE SEARCH, MEASURED AGAINST A REAL POSTGRES.
//
// Everything in this file runs against the database the migrations
// actually build — no stub, no mock. That matters more here than usual:
// the whole workstream is a claim about what an index and a tsquery do,
// and a mock that answers "found it" to anything would let every one of
// these pass while the search box returned nothing.
//
// THE THREE THINGS THAT GO WRONG QUIETLY:
//
//   ACCENTS. "καφε" not finding "Καφές" is the defect this app already
//   had once, in nine components and one route. Upper-case Greek is
//   written without accents while lower case keeps them, so one word
//   typed two ordinary ways fails to match itself.
//
//   THE INDEX DRIFTING FROM THE DATA. A row edited or deleted whose
//   index entry stays behind is a search result that leads nowhere, or
//   worse, shows text the user has already removed.
//
//   SPEED, which is the reason for all of it. Twenty-four round trips
//   per keystroke cannot be fixed by a faster query.
//
// Run: node scripts/tests/unified-search.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

/** The LAST line of a multi-statement script.
 *
 *  psql echoes the tag of every statement it runs, so a script that sets
 *  a role before querying comes back as "SET\nSET\n<answer>" — and an
 *  assertion comparing that to "" passes for the wrong reason or fails
 *  for the wrong one. Only the final line is the result. */
function lastLine(out) {
  const lines = out.split("\n").filter((l) => l !== "");
  return lines.length === 0 ? "" : lines[lines.length - 1];
}

function sql(query) {
  const args = process.env.DATABASE_URL
    ? ["-d", process.env.DATABASE_URL]
    : ["-d", process.env.PGDATABASE];
  return execFileSync("psql", [...args, "-v", "ON_ERROR_STOP=1", "-tAc", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

sql(`insert into auth.users (id, email) values
  ('${USER}', 'search@test.local'), ('${OTHER}', 'other@test.local')
  on conflict (id) do nothing`);

console.log("== 1. the index fills itself, from every source ==");
{
  // Written to the SOURCE tables. Nothing here touches search_index —
  // if the triggers are not attached, every assertion below fails, which
  // is the point.
  sql(`insert into public.ideas (user_id, name, problem) values
    ('${USER}', 'Καφές specialty', 'Οι πελάτες θέλουν φρέσκο καβούρδισμα')`);
  sql(`insert into public.leads (user_id, lead_name, next_steps) values
    ('${USER}', 'Acme Ltd', 'Send the revised proposal on Monday')`);
  sql(`insert into public.chat_conversations (user_id, title) values
    ('${USER}', 'Πωλήσεις αυτόν τον μήνα')`);
  sql(`insert into public.user_files (user_id, filename, file_type, size_bytes, storage_path, extracted_text, processing_status)
    values ('${USER}', 'q3-report.pdf', 'pdf', 1024, '${USER}/a.pdf',
      'Revenue for the quarter reached forty two thousand euros across the Καφές product line', 'ready')`);
  sql(`insert into public.user_websites (user_id, name, html_content, description) values
    ('${USER}', 'Bakery site', '<html></html>', 'A neighbourhood bakery in Kalamaria')`);
  sql(`insert into public.ai_agents (user_id, name, description) values
    ('${USER}', 'Weekly digest', 'Summarises the week every Monday')`);
  sql(`insert into public.ai_missions (user_id, goal) values
    ('${USER}', 'Launch the mid tier by March')`);
  sql(`insert into public.help_articles (slug, locale, category, title, body) values
    ('billing', 'en', 'billing', 'How billing works', 'Credits are deducted when an action completes')
    on conflict do nothing`);

  const kinds = sql(`select string_agg(distinct kind, ',' order by kind) from public.search_index`);
  for (const kind of ["agent", "chat", "file", "help", "mission", "module", "website"]) {
    ok(`${kind} rows reached the index`, kinds.includes(kind), kinds);
  }
  ok("a module row carries its slug",
    sql(`select module_slug from public.search_index where source_table='ideas'`) === "ideas");
  ok("a help article belongs to nobody",
    sql(`select count(*) from public.search_index
         where source_table='help_articles' and user_id is not null`) === "0",
    sql(`select count(*) from public.search_index where source_table='help_articles'`));
  ok("everything else belongs to its owner",
    sql(`select count(*) from public.search_index where source_table <> 'help_articles' and user_id is null`) === "0");
}

console.log("\n== 2. accents, the defect this app already had once ==");
{
  const find = (q) =>
    sql(`select coalesce(string_agg(title, '|' order by title), '') from public.search_all(${q})`);
  // Verified on this database, not asserted from memory.
  ok("plain 'Καφές' matches itself", find(`'Καφές'`).includes("Καφές"));
  ok("unaccented lower case finds it", find(`'καφε'`).includes("Καφές"), find(`'καφε'`));
  ok("ALL CAPS, which Greek writes without accents, finds it",
    find(`'ΚΑΦΕΣ'`).includes("Καφές"), find(`'ΚΑΦΕΣ'`));
  ok("a final sigma matches a medial one", find(`'καφεσ'`).includes("Καφές"), find(`'καφεσ'`));
  // And in the other direction: the FOLDED form must find the accented row.
  ok("Latin accents fold too",
    sql(`select public.search_fold('Café Crème')`) === "cafe creme",
    sql(`select public.search_fold('Café Crème')`));
}

console.log("\n== 3. as you type: a prefix, not a whole word ==");
{
  const find = (q) => sql(`select coalesce(string_agg(title, '|'), '') from public.search_all('${q}')`);
  ok("three letters already match", find("bak").includes("Bakery site"), find("bak"));
  ok("...and so does one more", find("bake").includes("Bakery site"));
  ok("a whole word still matches", find("bakery").includes("Bakery site"));
  // EARLIER TERMS ARE WHOLE WORDS. "weekly dig" means a digest, not
  // everything containing either.
  ok("two terms are ANDed", find("weekly digest").includes("Weekly digest"));
  ok("...and a term that matches nothing removes the row",
    !find("weekly zzzz").includes("Weekly digest"), find("weekly zzzz"));
  // A QUERY OF PUNCTUATION IS NOT A SYNTAX ERROR.
  for (const nasty of [":*", "&", "|", "!", "( )", "'", "\\\\"]) {
    let threw = false;
    try { sql(`select count(*) from public.search_all('${nasty.replace(/'/g, "''")}')`); }
    catch { threw = true; }
    ok(`a query of ${JSON.stringify(nasty)} does not error`, !threw);
  }
  ok("an empty query finds nothing", sql(`select count(*) from public.search_all('')`) === "0");
}

console.log("\n== 4. it searches what a file SAYS, not just its name ==");
{
  const hits = sql(`select coalesce(string_agg(title || ':' || kind, '|'), '')
    from public.search_all('forty two thousand')`);
  ok("a phrase from inside a PDF finds the file", hits.includes("q3-report.pdf"), hits);
  ok("...as a file, not a module", hits.includes("q3-report.pdf:file"), hits);
  // AND THE TITLE STILL OUTRANKS THE BODY. Somebody typing "Καφές"
  // means the idea called that, not the report that mentions it.
  const ranked = sql(`select string_agg(title, '|' order by rank desc) from public.search_all('Καφές')`);
  ok("a title match outranks a body match",
    ranked.startsWith("Καφές specialty"), ranked);
}

console.log("\n== 5. filters ==");
{
  const count = (args) => Number(sql(`select count(*) from public.search_all(${args})`));
  ok("everything matching, unfiltered", count(`'Καφές'`) >= 2, String(count(`'Καφές'`)));
  ok("filtered to one kind", count(`'Καφές', array['module']`) === 1, String(count(`'Καφές', array['module']`)));
  ok("filtered to several kinds",
    count(`'Καφές', array['module','file']`) === 2, String(count(`'Καφές', array['module','file']`)));
  ok("filtered to a module", count(`'Καφές', null, 'ideas'`) === 1);
  ok("...a different module finds nothing", count(`'Καφές', null, 'sales'`) === 0);
  ok("filtered by date: everything is recent", count(`'Καφές', null, null, now() - interval '1 day'`) >= 2);
  ok("...and nothing is from tomorrow", count(`'Καφές', null, null, now() + interval '1 day'`) === 0);
  ok("the limit is respected", count(`'a', null, null, null, 1`) <= 1);
  // A limit is CLAMPED, not trusted: a caller asking for a million rows
  // is a caller who has found a way to make the database do their work.
  ok("an absurd limit is clamped", count(`'a', null, null, null, 100000`) <= 200);
}

console.log("\n== 6. RLS: a search is scoped to whoever is asking ==");
{
  // The policy is what scopes search_all — it is SECURITY INVOKER on
  // purpose — so this checks the policy itself rather than the function.
  sql(`insert into public.ideas (user_id, name) values ('${OTHER}', 'Secret competitor plan')`);
  const asUser = (q) =>
    lastLine(sql(`set local role authenticated;
      set local request.jwt.claim.sub = '${USER}';
      ${q}`));
  const asOther = asUser(`select coalesce(string_agg(title, '|'), '(none)') from public.search_index where title like 'Secret%';`);
  ok("one user cannot see another's row", asOther === "(none)", asOther);
  const ownRow = asUser(`select coalesce(string_agg(title, '|'), '(none)') from public.search_index where title like 'Καφές%';`);
  ok("...but can see their own", ownRow.includes("Καφές"), ownRow);
  const helpRow = asUser(`select coalesce(string_agg(title, '|'), '(none)') from public.search_index where kind = 'help';`);
  ok("...and the help articles, which belong to nobody", helpRow.includes("How billing works"), helpRow);
  // AND search_all ITSELF WORKS AS THAT ROLE. The policy is only half of
  // it: without a GRANT on the table the function fails with "permission
  // denied", and every test that queries as the table owner passes while
  // no real browser can search at all.
  const viaFunction = asUser(`select count(*) from public.search_all('Καφές');`);
  ok("...and search_all runs as an ordinary signed-in role",
    /^\d+$/.test(viaFunction) && Number(viaFunction) >= 1, viaFunction);
  // NOBODY MAY WRITE. An href is a link the product invites a user to
  // trust, so a user who could insert one could aim it anywhere.
  let wrote = true;
  try {
    sql(`set local role authenticated;
         set local request.jwt.claim.sub = '${USER}';
         insert into public.search_index (user_id, kind, source_table, source_id, title, href)
         values ('${USER}', 'module', 'fake', gen_random_uuid(), 'x', 'https://evil.test');`);
  } catch { wrote = false; }
  ok("a user cannot insert a row of their own", !wrote);
}

console.log("\n== 7. the index does not drift from the data ==");
{
  sql(`update public.ideas set name = 'Τσάι specialty' where name = 'Καφές specialty'`);
  ok("an edit updates the index",
    sql(`select count(*) from public.search_all('Τσάι')`) === "1",
    sql(`select count(*) from public.search_all('Τσάι')`));
  ok("...and the old text stops matching",
    sql(`select count(*) from public.search_all('Καφές', array['module'])`) === "0");
  // ONE ROW PER THING. An update that inserted instead of upserting
  // would show the same idea twice, with the older copy leading nowhere.
  ok("...without leaving a second copy behind",
    sql(`select count(*) from public.search_index where source_table='ideas' and user_id='${USER}'`) === "1");

  sql(`delete from public.ideas where name = 'Τσάι specialty'`);
  ok("a delete removes it from the index",
    sql(`select count(*) from public.search_index where source_table='ideas' and user_id='${USER}'`) === "0");
  ok("...and it stops being found", sql(`select count(*) from public.search_all('Τσάι')`) === "0");

  // A DELETED ACCOUNT TAKES ITS INDEX WITH IT.
  sql(`delete from auth.users where id = '${OTHER}'`);
  ok("deleting an account cascades to the index",
    sql(`select count(*) from public.search_index where user_id='${OTHER}'`) === "0");
}

console.log("\n== 8. speed, on more than a thousand rows ==");
{
  // 1,200 rows of realistic length, so the plan is chosen against a table
  // worth indexing rather than one Postgres would scan either way.
  sql(`insert into public.leads (user_id, lead_name, next_steps)
       select '${USER}', 'Lead ' || g, 'Follow up about the proposal, item number ' || g
       from generate_series(1, 1200) g`);
  const rows = sql(`select count(*) from public.search_index where user_id='${USER}'`);
  ok(`the index holds ${rows} rows`, Number(rows) >= 1200, rows);

  sql("analyze public.search_index");
  // THE INDEX IS ACTUALLY USED — measured by its own scan counter, not
  // read off a plan. search_all is a STABLE `language sql` function that
  // Postgres does not inline here, so EXPLAIN shows a bare "Function
  // Scan" and hides everything that matters. The counter does not care.
  //
  // A sequential scan that happens to be fast on 1,200 rows is a
  // sequential scan that is not fast on 100,000.
  const idxScans = () =>
    Number(sql(`select coalesce(idx_scan, 0) from pg_stat_user_indexes
                where indexrelname = 'search_index_document_idx'`));
  const before = idxScans();
  sql(`select count(*) from public.search_all('proposal item')`);
  const after = idxScans();
  ok("the GIN index is used, not a sequential scan", after > before, `${before} -> ${after}`);
  // And the query really does return the rows, so a used index that
  // matches nothing cannot pass this section.
  ok("...and it finds the seeded rows",
    Number(sql(`select count(*) from public.search_all('proposal item', null, null, null, 200)`)) === 200,
    sql(`select count(*) from public.search_all('proposal item', null, null, null, 200)`));

  const times = [];
  for (let i = 0; i < 7; i += 1) {
    const started = Date.now();
    sql(`select count(*) from public.search_all('propos')`);
    times.push(Date.now() - started);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  // MEASURED INCLUDING psql's OWN STARTUP, which is most of it — so this
  // is an upper bound on the query, not a measurement of it. The number
  // that matters to a person is the round trip from their browser, and
  // this environment cannot measure that.
  console.log(`        median ${median}ms per call, including psql startup (${times.join(",")})`);
  ok("a search over 1,200+ rows stays well under 200ms",
    median < 200, `${median}ms`);

  // THE MEDIAN OF FIVE, NOT ONE SAMPLE.
  //
  // This took a SINGLE `explain analyze` and required it under 50ms, and
  // it was flaky in the way that matters least and costs most: the same
  // unchanged code measured 40.6ms (pass) and 51.6ms (fail) minutes
  // apart, because this Postgres is a throwaway sharing a machine with
  // whatever else is running. A gate that cannot decide makes every
  // future red ambiguous — the next person to see it assumes flake, and
  // one day they are wrong.
  //
  // Five samples and the median is a STRICTLY BETTER MEASUREMENT of the
  // same claim, not a looser bound: a query that genuinely regressed
  // past 50ms fails all five, while one scheduler hiccup no longer
  // decides the build. The threshold is unchanged.
  const inners = [];
  for (let i = 0; i < 5; i += 1) {
    const ms = sql(`explain (analyze, format text) select * from public.search_all('propos')`)
      .match(/Execution Time: ([\d.]+) ms/)?.[1];
    if (ms !== undefined) inners.push(Number(ms));
  }
  inners.sort((a, b) => a - b);
  const inner = inners[Math.floor(inners.length / 2)];
  console.log(`        Postgres execution time: median ${inner}ms of ${inners.length} (${inners.join(", ")})`);
  ok("the timing was actually sampled", inners.length === 5, String(inners.length));
  ok("...and the query itself is a small fraction of that",
    Number(inner) < 50, `${inner}ms of ${inners.join(", ")}`);
}

console.log("\n== 9. every stored href, and re-running the migration ==");
{
  // A LINK IS THE PART OF A RESULT NOBODY CHECKS. It typechecks, it
  // renders, it is the right colour — and it 404s. /dashboard/ideas was
  // exactly that: /dashboard/[module] resolves through getModule(),
  // which does not know "ideas", so the row that opened the app's most
  // used module opened a not-found page. scripts/tests/unified-search.test.mjs
  // checks these against the routes on disk; this checks what the
  // DATABASE actually stored, which is a different thing.
  //
  // Section 7 deletes the idea it created, so this seeds its own —
  // asserting a `distinct href` over zero rows returns the empty string
  // and compares unequal, which is a failure for the wrong reason, and
  // would have been a PASS for the wrong reason had the expected value
  // been anything falsy.
  sql(`insert into public.ideas (user_id, name, problem)
       values ('${USER}', 'Href check idea', 'the link has to go somewhere real')`);
  const ideasRows = sql(`select count(*) from public.search_index where source_table = 'ideas'`);
  ok("there is an ideas row to check", Number(ideasRows) === 1, ideasRows);
  const ideasHref = sql(`select distinct href from public.search_index where source_table = 'ideas'`);
  ok("the ideas rows point at /dashboard", ideasHref === "/dashboard", JSON.stringify(ideasHref));

  const total = Number(sql(`select count(*) from public.search_index`));
  ok("there are rows to check hrefs on", total > 1000, String(total));
  ok("no stored href is empty",
    sql(`select count(*) from public.search_index where coalesce(href, '') = ''`) === "0");
  ok("every stored href is absolute",
    sql(`select count(*) from public.search_index where href not like '/%'`) === "0");

  // RE-APPLYING THE WHOLE MIGRATION, which is the only honest test of
  // "idempotent". A corrupted href is planted first so the reconciling
  // UPDATE has something to correct — otherwise a migration that
  // reconciled nothing would pass this too.
  const before = sql(`select count(*) from public.search_index`);
  sql(`update public.search_index set href = '/dashboard/ideas' where source_table = 'ideas'`);
  const args = process.env.DATABASE_URL
    ? ["-d", process.env.DATABASE_URL]
    : ["-d", process.env.PGDATABASE];
  execFileSync("psql", [...args, "-v", "ON_ERROR_STOP=1", "-q", "-f",
    "supabase/migrations/20260824000000_unified_search.sql"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  ok("re-running the migration corrects a stale href",
    sql(`select distinct href from public.search_index where source_table = 'ideas'`) === "/dashboard");
  ok("...and adds no duplicate rows",
    sql(`select count(*) from public.search_index`) === before, `${before} -> ${sql(`select count(*) from public.search_index`)}`);
  ok("...and the search still works afterwards",
    Number(sql(`select count(*) from public.search_all('propos', null, null, null, 200)`)) === 200);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
