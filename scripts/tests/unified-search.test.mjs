// ONE SEARCH — the pure half, and the strings the compiler cannot see.
//
// The database half of this feature is proved in
// scripts/tests/unified-search.dbtest.mjs against a real PostgreSQL:
// accent folding, ranking, RLS, the GIN index, timing. Nothing here
// duplicates that.
//
// What IS here is everything that would compile and typecheck clean and
// still be wrong at runtime:
//
//   * the RPC's parameter names, which are strings on both sides
//   * every href the index stores, checked against the routes that
//     actually exist (a search result that 404s is worse than no result)
//   * every module_slug the index stores, checked against the label map
//   * every translation key the palette builds by interpolation
//     (`kinds.${kind}`, `dates.${range}`) in all ten locales
//   * the snippet parser, which is the ONLY thing standing between
//     database text and the DOM
//
// Run: node scripts/tests/unified-search.test.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const S = await loadTs("src/lib/search/unified-search.ts");
const {
  SEARCH_KINDS, isSearchKind, DATE_RANGES, sinceForRange,
  MIN_QUERY_LENGTH, MAX_QUERY_LENGTH, groupResults, flattenGroups, snippetSegments,
} = S;

const MIGRATION = "supabase/migrations/20260824000000_unified_search.sql";
const sql = readFileSync(MIGRATION, "utf8");

/**
 * The migration with its `--` comments removed.
 *
 * WHY THIS EXISTS. Every "the grant is there" assertion below used to
 * run against the raw text, and commenting a grant OUT left the words
 * intact — so `grant select on public.search_index to authenticated`
 * still matched a line that no longer runs, and the mutation suite
 * proved it: two mutants that deleted real grants stayed green.
 *
 * A `--` inside a string literal is not a comment, so the quote count
 * before it decides.
 */
const sqlCode = sql
  .split("\n")
  .map((line) => {
    for (let i = 0; i < line.length - 1; i += 1) {
      if (line[i] === "-" && line[i + 1] === "-") {
        const quotes = (line.slice(0, i).match(/'/g) ?? []).length;
        if (quotes % 2 === 0) return line.slice(0, i);
      }
    }
    return line;
  })
  .join("\n");
const paletteSrc = readFileSync("src/components/dashboard/command-palette.tsx", "utf8");
const routeSrc = readFileSync("src/app/api/search/route.ts", "utf8");

// --------------------------------------------------------------------
// The migration's spec list, parsed rather than retyped.
//
// Retyping it is how the test and the thing it tests drift apart: the
// twenty-second row gets added to the migration and the test keeps
// passing over the twenty-one it remembers.
// --------------------------------------------------------------------
function parseSpecs(text) {
  const start = text.indexOf("specs constant text[][]");
  if (start === -1) throw new Error("specs array not found in " + MIGRATION);
  const open = text.indexOf("array[", start);
  const close = text.indexOf("\n  ];", open);
  const body = text.slice(open + "array[".length, close);
  const rows = [];
  for (const m of body.matchAll(/\[([^\]]*)\]/g)) {
    const cells = m[1]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .map((c) => c.replace(/^'/, "").replace(/'$/, ""));
    if (cells.length !== 7) continue;
    const [table, kind, titleCol, bodyCol, href, moduleSlug, timeCol] = cells;
    rows.push({ table, kind, titleCol, bodyCol, href, moduleSlug, timeCol });
  }
  return rows;
}
const SPECS = parseSpecs(sql);

console.log("\n1. Kinds");
ok("SEARCH_KINDS has no duplicates", new Set(SEARCH_KINDS).size === SEARCH_KINDS.length);
for (const kind of SEARCH_KINDS) ok(`isSearchKind("${kind}")`, isSearchKind(kind) === true);
for (const bad of ["Module", "MODULE", "modules", "", " module", "__proto__", "constructor", "toString"]) {
  ok(`isSearchKind rejects ${JSON.stringify(bad)}`, isSearchKind(bad) === false);
}
for (const bad of [null, undefined, 0, 1, {}, [], ["module"], true]) {
  ok(`isSearchKind rejects ${JSON.stringify(bad) ?? String(bad)}`, isSearchKind(bad) === false);
}

console.log("\n2. Migration specs cover the kinds, and nothing else");
{
  const specKinds = [...new Set(SPECS.map((s) => s.kind))].sort();
  // A ratchet. A row that vanishes from the spec list takes a whole
  // source of results with it and nothing else notices.
  ok("parsed the whole spec list", SPECS.length === 29, `parsed ${SPECS.length}`);
  for (const kind of specKinds) {
    ok(`migration kind "${kind}" is a SEARCH_KIND`, SEARCH_KINDS.includes(kind));
  }
  for (const kind of SEARCH_KINDS) {
    ok(`SEARCH_KIND "${kind}" is produced by at least one table`,
      SPECS.some((s) => s.kind === kind),
      `no spec row has kind=${kind}, so the chip would never appear`);
  }
  // A spec whose table does not exist is SKIPPED by the migration's
  // `continue`, silently. That is the right behaviour for a
  // partially-migrated database and the wrong thing to be unaware of.
  const schemaFiles = readdirSync("supabase/migrations").map((f) =>
    readFileSync(`supabase/migrations/${f}`, "utf8"));
  for (const spec of SPECS) {
    const created = schemaFiles.some((t) =>
      new RegExp(`create table (if not exists )?(public\\.)?${spec.table}\\b`).test(t));
    ok(`table ${spec.table} is created by some migration`, created);
  }
  const dupes = SPECS.map((s) => s.table).filter((t, i, a) => a.indexOf(t) !== i);
  ok("no table is indexed twice", dupes.length === 0, dupes.join(","));
}

console.log("\n3. Every href the index stores resolves to a real route");
{
  const modSlugs = [...readFileSync("src/lib/modules.ts", "utf8")
    .matchAll(/^\s*slug: "([^"]+)"/gm)].map((m) => m[1]);
  const buildSlugs = [...readFileSync("src/lib/build-modules.ts", "utf8")
    .matchAll(/^\s*slug: "([^"]+)"/gm)].map((m) => m[1]);

  // /dashboard/[module] is a real page ONLY for a slug getModule()
  // resolves; anything else hits its notFound(). A static directory
  // under src/app is a page on its own.
  function resolves(href) {
    if (existsSync(`src/app${href}/page.tsx`)) return "static";
    const m = /^\/dashboard\/([^/]+)$/.exec(href);
    if (m && modSlugs.includes(m[1])) return "[module]";
    if (m && buildSlugs.includes(m[1])) return "build";
    return null;
  }

  for (const href of [...new Set(SPECS.map((s) => s.href))]) {
    ok(`href ${href} resolves`, resolves(href) !== null,
      "src/app" + href + "/page.tsx does not exist and no module config claims the slug — this link 404s");
  }
}

console.log("\n4. Every module_slug has a label in every locale");
{
  const keys = await loadTs("src/lib/search/module-title-keys.ts");
  const MAP = keys.MODULE_TITLE_KEYS;
  const slugs = [...new Set(SPECS.map((s) => s.moduleSlug).filter(Boolean))];
  ok("the spec list carries module slugs", slugs.length >= 20, String(slugs.length));
  const locales = readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  ok("ten locales", locales.length === 10, locales.join(","));
  const messages = Object.fromEntries(
    locales.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
  const lookup = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  for (const slug of slugs) {
    const key = MAP[slug];
    ok(`module_slug "${slug}" has a title key`, typeof key === "string" && key.length > 0,
      "the filter chip would show the raw slug");
    if (!key) continue;
    // CROSS-PRODUCT, not a sample: every slug in every locale.
    for (const locale of locales) {
      const value = lookup(messages[locale], key);
      ok(`${locale}: ${key}`, typeof value === "string" && value.trim().length > 0);
    }
  }
  // The map must not claim slugs the index never stores — a chip for a
  // module that cannot appear is dead weight that outlives the module.
  for (const slug of Object.keys(MAP)) {
    ok(`title key "${slug}" corresponds to an indexed module`, slugs.includes(slug));
  }
}

console.log("\n5. Every interpolated translation key exists in every locale");
{
  const locales = readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  const messages = Object.fromEntries(
    locales.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
  // The palette builds these with template literals — `kinds.${kind}` —
  // which check-i18n.js cannot see, because there is no literal key in
  // the source to find. So they are enumerated from the same arrays the
  // component interpolates.
  const needed = [
    "filters.type", "filters.module", "filters.date", "filters.all",
    "kinds.page",
    ...SEARCH_KINDS.map((k) => `kinds.${k}`),
    ...DATE_RANGES.map((r) => `dates.${r}`),
  ];
  for (const locale of locales) {
    const search = messages[locale]?.dashboard?.search;
    ok(`${locale} has dashboard.search`, !!search);
    if (!search) continue;
    for (const dotted of needed) {
      const value = dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), search);
      ok(`${locale}: dashboard.search.${dotted}`,
        typeof value === "string" && value.trim().length > 0);
    }
    // No stragglers: a key here that the component never asks for is a
    // string ten translators were paid for and nobody reads.
    const flat = [];
    for (const [group, entries] of Object.entries(search)) {
      for (const leaf of Object.keys(entries)) flat.push(`${group}.${leaf}`);
    }
    for (const dotted of flat) {
      ok(`${locale}: dashboard.search.${dotted} is used`, needed.includes(dotted));
    }
  }
  // "page" is not a SEARCH_KIND — it is the sidebar-nav group heading —
  // and if it ever became one the heading would be duplicated.
  ok("kinds.page is not also a SEARCH_KIND", !SEARCH_KINDS.includes("page"));
}

console.log("\n6. sinceForRange");
{
  const now = Date.UTC(2026, 7, 22, 12, 0, 0);
  ok("any -> null", sinceForRange("any", now) === null);
  const cases = { "7d": 7, "30d": 30, "365d": 365 };
  for (const [range, days] of Object.entries(cases)) {
    const got = sinceForRange(range, now);
    const want = new Date(now - days * 86_400_000).toISOString();
    ok(`${range} -> now minus ${days} days`, got === want, `${got} !== ${want}`);
  }
  ok("DATE_RANGES starts at any", DATE_RANGES[0] === "any");
  ok("every DATE_RANGE except any returns a timestamp",
    DATE_RANGES.filter((r) => r !== "any").every((r) => typeof sinceForRange(r, now) === "string"));
  ok("an unknown range is treated as any time", sinceForRange("weekly", now) === null);
  // The ordering is what the filter MEANS: a longer range must reach
  // further back, or "1 year" would return less than "7 days".
  const stamps = ["7d", "30d", "365d"].map((r) => Date.parse(sinceForRange(r, now)));
  ok("longer ranges reach further back", stamps[0] > stamps[1] && stamps[1] > stamps[2]);
  ok("no range reaches into the future", stamps.every((s) => s < now));
}

console.log("\n7. Query length bounds");
{
  ok("MIN_QUERY_LENGTH is 2", MIN_QUERY_LENGTH === 2);
  ok("MAX_QUERY_LENGTH is above MIN", MAX_QUERY_LENGTH > MIN_QUERY_LENGTH);
  // Both ends have to be enforced where the request is BUILT and where
  // it is READ; either alone is a hole.
  ok("the route enforces MIN", /q\.length < MIN_QUERY_LENGTH/.test(routeSrc));
  ok("the route truncates at MAX", /slice\(0, MAX_QUERY_LENGTH\)/.test(routeSrc));
  ok("the palette does not send below MIN", /q\.length < MIN_QUERY_LENGTH/.test(paletteSrc));
}

console.log("\n8. groupResults / flattenGroups");
{
  const r = (kind, rank, id, moduleSlug = null) => ({
    kind, rank, sourceTable: "t", sourceId: id, title: id, snippet: "",
    href: "/x", occurredAt: "2026-01-01T00:00:00Z", moduleSlug,
  });

  // Deliberately out of SEARCH_KINDS order and out of rank order.
  const input = [
    r("help", 9, "h1"), r("module", 1, "m-low"), r("file", 5, "f1"),
    r("module", 7, "m-high"), r("chat", 3, "c1"), r("module", 4, "m-mid"),
  ];
  const before = JSON.stringify(input);
  const groups = groupResults(input);
  ok("input is not mutated", JSON.stringify(input) === before);

  // The fixture is built in the order help,module,file,module,chat,module
  // ON PURPOSE: an implementation that emitted groups in the order it
  // first met them would give help,module,file,chat and pass a laxer
  // assertion about "the groups are there".
  ok("groups follow SEARCH_KINDS order",
    groups.map((g) => g.kind).join(",") === "module,file,chat,help",
    groups.map((g) => g.kind).join(","));
  ok("empty kinds are omitted", groups.length === 4);
  ok("rank orders WITHIN a group, descending",
    groups[0].results.map((x) => x.sourceId).join(",") === "m-high,m-mid,m-low");

  const flat = flattenGroups(groups);
  ok("flatten preserves every row", flat.length === input.length);
  ok("flatten is the display order",
    flat.map((x) => x.sourceId).join(",") === "m-high,m-mid,m-low,f1,c1,h1");

  // THE POINT of grouping: a high-ranked file must NOT jump above a
  // low-ranked record, or the headings reorder between keystrokes.
  const mixed = flattenGroups(groupResults([r("file", 100, "f-huge"), r("module", 0.01, "m-tiny")]));
  ok("a lower-ranked module still precedes a higher-ranked file",
    mixed.map((x) => x.sourceId).join(",") === "m-tiny,f-huge");

  ok("unknown kinds are dropped", flattenGroups(groupResults([r("wat", 5, "x")])).length === 0);
  ok("an empty list gives no groups", groupResults([]).length === 0);
  ok("ties keep both rows", flattenGroups(groupResults([r("file", 2, "a"), r("file", 2, "b")])).length === 2);
}

console.log("\n9. snippetSegments — the only thing between the DB and the DOM");
{
  const seg = (s) => snippetSegments(s).map((x) => (x.match ? `[${x.text}]` : x.text)).join("");
  ok("empty", snippetSegments("").length === 0);
  ok("no markers", seg("plain text") === "plain text");
  ok("one marker", seg("a <<b>> c") === "a [b] c");
  ok("marker at the start", seg("<<a>> b") === "[a] b");
  ok("marker at the end", seg("a <<b>>") === "a [b]");
  ok("two markers", seg("<<a>> x <<b>>") === "[a] x [b]");
  ok("unterminated marker is literal", seg("a <<b") === "a <<b");
  ok("a lone closer is literal", seg("a >> b") === "a >> b");
  ok("empty marker produces no empty segment",
    snippetSegments("a <<>> b").every((s) => s.text.length > 0));
  ok("no segment is empty, ever",
    snippetSegments("<<a>><<b>>c").every((s) => s.text.length > 0));
  ok("adjacent markers stay separate",
    snippetSegments("<<a>><<b>>").filter((s) => s.match).length === 2);

  // HTML is DATA here, not markup. It has to survive as text — the
  // component renders these as text nodes, and the day one of them is
  // handed to dangerouslySetInnerHTML this is the assertion that was
  // already true and stops being enough.
  const evil = '<<script>>alert(1)</script>';
  const parts = snippetSegments(evil);
  ok("angle brackets are carried as text", parts.map((p) => p.text).join("").includes("</script>"));
  ok("only the <<…>> span is a match", parts.filter((p) => p.match).length === 1);
  // The ATTRIBUTE, not the word — this file's own comments explain why
  // the prop is absent, and a check that the word never appears would go
  // red for the explanation and green for the mistake.
  ok("nothing in the palette renders search text as HTML",
    !/dangerouslySetInnerHTML\s*=/.test(paletteSrc));

  // Length is preserved apart from the markers themselves — if it were
  // not, the parser would be dropping user text somewhere.
  const round = "x<<yy>>zzz<<w>>";
  ok("no text is lost",
    snippetSegments(round).map((p) => p.text).join("").length === round.length - 8);
}

console.log("\n10. The RPC contract — strings on both sides");
{
  // The route names these parameters; PostgREST matches them BY NAME. A
  // rename on either side is a 404 from the database at runtime and a
  // clean typecheck.
  const fnStart = sql.indexOf("create or replace function public.search_all");
  ok("search_all is defined", fnStart !== -1);
  const signature = sql.slice(fnStart, sql.indexOf(")\nreturns", fnStart));
  for (const param of ["p_query", "p_kinds", "p_module", "p_since", "p_limit"]) {
    ok(`search_all declares ${param}`, new RegExp(`\\b${param}\\b`).test(signature));
    ok(`the route passes ${param}`, new RegExp(`\\b${param}:`).test(routeSrc));
  }
  const passed = [...routeSrc.matchAll(/\bp_[a-z_]+:/g)].map((m) => m[0].slice(0, -1));
  for (const param of passed) {
    ok(`route param ${param} exists in the signature`,
      new RegExp(`\\b${param}\\b`).test(signature));
  }
  ok("the route calls search_all", /rpc\("search_all"/.test(routeSrc));
  ok("ONE rpc call, not one per table", (routeSrc.match(/\.rpc\(/g) ?? []).length === 1);

  // The columns the route reads off each row.
  const returnsStart = sql.indexOf("returns table", fnStart);
  const returns = sql.slice(returnsStart, sql.indexOf(")", returnsStart));
  for (const col of ["kind", "module_slug", "source_table", "source_id", "title", "snippet", "href", "occurred_at", "rank"]) {
    ok(`search_all returns ${col}`, new RegExp(`\\b${col}\\b`).test(returns));
    ok(`the route reads row.${col}`, new RegExp(`row\\.${col}\\b`).test(routeSrc));
  }
}

console.log("\n11. Security shape of the migration");
{
  const defStart = sqlCode.indexOf("create or replace function public.search_all");
  const searchAllDef = sqlCode.slice(defStart, sqlCode.indexOf("$$;", defStart));
  ok("search_all says SECURITY INVOKER out loud", /\bsecurity invoker\b/.test(searchAllDef),
    "invoker is the default, but a function whose entire security model is 'RLS scopes it' must not depend on a default nobody can see");
  ok("search_all is not SECURITY DEFINER", !/\bsecurity definer\b/.test(searchAllDef));
  ok("search_index has RLS enabled", /alter table public\.search_index enable row level security/.test(sqlCode));
  ok("authenticated is GRANTed select", /grant select on public\.search_index to authenticated/.test(sqlCode));
  ok("no write grant to authenticated",
    !/grant (insert|update|delete)[^;]*on public\.search_index to authenticated/.test(sqlCode));
  ok("no write policy on search_index",
    !/create policy[^;]*on public\.search_index\s+for (insert|update|delete)/.test(sqlCode));
  // The grants are applied by a DO loop over a list of signatures, so
  // the assertions are about THAT list and THAT order — matching literal
  // "grant execute on function public.search_all" would pass on a file
  // that granted nothing.
  // Anchored on CODE, not on the "-- 5. Grants" heading: sqlCode has
  // its comments removed, so an offset taken from the raw text points
  // somewhere else entirely in it.
  const grantBlock = sqlCode.slice(sqlCode.indexOf("foreach fn in array"));
  ok("found the grant loop", grantBlock.length > 0 && grantBlock.length < sqlCode.length);
  for (const fn of ["search_all(text, text[], text, timestamptz, integer)", "search_query(text)"]) {
    ok(`the grant loop lists ${fn.split("(")[0]}`, grantBlock.includes(`'${fn}'`));
  }
  const revokePublic = grantBlock.indexOf("revoke all on function public.%s from public");
  const revokeAnon = grantBlock.indexOf("revoke all on function public.%s from anon");
  const grantAuth = grantBlock.indexOf("grant execute on function public.%s to authenticated");
  ok("the loop revokes from public before granting", revokePublic !== -1 && revokePublic < grantAuth);
  ok("the loop revokes from anon before granting", revokeAnon !== -1 && revokeAnon < grantAuth);
  // The trigger function is SECURITY DEFINER and writes hrefs. Nobody
  // but the trigger may call it.
  ok("search_index_sync is revoked from anon",
    /revoke all on function public\.search_index_sync\(\) from anon/.test(grantBlock));
  ok("search_index_sync is revoked from authenticated",
    /revoke all on function public\.search_index_sync\(\) from authenticated/.test(grantBlock));
  ok("search_index_sync is never granted to authenticated",
    !/grant execute on function public\.search_index_sync\(\) to authenticated/.test(grantBlock));
  for (const forbidden of ["drop table", "truncate"]) {
    ok(`the migration contains no ${forbidden}`, !new RegExp(forbidden, "i").test(sql.replace(/^\s*--.*$/gm, "")));
  }
  ok("no unqualified delete",
    !/delete from public\.search_index\s*;/.test(sql));
  // Every UPDATE of the index carries a WHERE. An href reconciliation
  // that lost its predicate would rewrite every link in the table.
  //
  // The count is asserted first ON PURPOSE: the previous version of this
  // loop had a regex that matched nothing, so it iterated zero times and
  // reported nothing — a green check for an assertion that never ran.
  const updates = [...sqlCode.matchAll(/update public\.search_index set [^\n]*/g)].map((m) => m[0]);
  ok("the UPDATE scan found the statements it is scanning", updates.length === 1,
    `matched ${updates.length}`);
  for (const stmt of updates) {
    ok("the update is qualified: " + stmt.slice(0, 60), / where /.test(stmt));
  }
  ok("the href reconciliation exists and is qualified by source_table",
    /update public\.search_index set href = %L where source_table = %L/.test(sqlCode));
}

console.log("\n12. The palette's own wiring");
{
  ok("results are grouped before they are listed", /flattenGroups\(groupResults\(/.test(paletteSrc));
  ok("the request is debounced", /setTimeout\(async \(\) => \{[\s\S]*?\}, 200\)/.test(paletteSrc));
  ok("a stale response cannot overwrite a newer one", /token !== searchTokenRef\.current/.test(paletteSrc));
  ok("the cache is bounded", /searchCacheRef\.current\.size > 40/.test(paletteSrc));
  ok("the cache key includes the filters", /params\.set\("kinds"/.test(paletteSrc) && /params\.set\("module"/.test(paletteSrc));
  ok("since is bucketed so the cache can hit", /slice\(0, 13\) \+ ":00:00\.000Z"/.test(paletteSrc));
  ok("the selection resets when the filters change",
    /setActiveIndex\(0\);\s*\}, \[query, kindFilter, moduleFilter, dateFilter\]\)/.test(paletteSrc));
  ok("closing resets every filter",
    /setKindFilter\(""\);\s*setModuleFilter\(""\);\s*setDateFilter\("any"\);/.test(paletteSrc));
  // EVERY chip, not "at least four". The first version of this asserted
  // a floor, and the mutation that removed one chip's handler left five
  // of six — over the floor, green, and the arrow keys dead the moment
  // anybody clicked that chip.
  const chips = (paletteSrc.match(/className=\{chipClass\(/g) ?? []).length;
  const guarded = (paletteSrc.match(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/g) ?? []).length;
  ok("there are filter chips to check", chips >= 5, String(chips));
  ok("every chip keeps focus in the input", guarded === chips, `${guarded} handlers for ${chips} chips`);
  // Every kind gets an icon, or a row falls back to the generic one and
  // the grouping stops being readable at a glance.
  const iconBlock = paletteSrc.slice(paletteSrc.indexOf("const KIND_ICONS"), paletteSrc.indexOf("};", paletteSrc.indexOf("const KIND_ICONS")));
  for (const kind of SEARCH_KINDS) {
    ok(`KIND_ICONS has ${kind}`, new RegExp(`\\b${kind}:`).test(iconBlock));
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
