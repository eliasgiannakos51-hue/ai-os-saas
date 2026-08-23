#!/usr/bin/env node
/*
 * CAN THE SEARCH GATE GO RED?
 *
 * A search that returns nothing is obvious in ten seconds. Everything
 * else about this feature fails QUIETLY:
 *
 *   A LINK THAT 404s still typechecks, still renders, still highlights.
 *   /dashboard/ideas was exactly that, and the gate that would have
 *   caught it did not exist until this workstream.
 *
 *   A GRANT THAT DISAPPEARS makes every signed-in browser's search fail
 *   while every test running as the table owner passes.
 *
 *   A RANK SORT THAT REVERSES puts the worst match first. Nothing goes
 *   red anywhere; the results are simply wrong, in an order nobody can
 *   distinguish from "the database's idea of relevance".
 *
 *   A TRANSLATION KEY THAT ONE LOCALE LACKS shows a raw dotted key to
 *   the users of that language and nobody else.
 *
 * So each mutation below re-introduces one real defect — most of them
 * defects this codebase has actually shipped in one form or another —
 * and the run fails if the gate stays green.
 *
 * Run: node scripts/tests/unified-search.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/unified-search.test.mjs";

const LIB = "src/lib/search/unified-search.ts";
const KEYS = "src/lib/search/module-title-keys.ts";
const SQL = "supabase/migrations/20260824000000_unified_search.sql";
const ROUTE = "src/app/api/search/route.ts";
const PALETTE = "src/components/dashboard/command-palette.tsx";
const EN = "messages/en.json";
const EL = "messages/el.json";

const MUTANTS = [
  // ------------------------------------------------------------------
  // RANKING AND GROUPING. Wrong order is the failure mode that looks
  // exactly like working software.
  // ------------------------------------------------------------------
  {
    name: "results within a group are ranked worst-first",
    file: LIB,
    from: "[...list].sort((a, b) => b.rank - a.rank)",
    to: "[...list].sort((a, b) => a.rank - b.rank)",
  },
  {
    name: "results within a group are not ranked at all",
    file: LIB,
    from: "[...list].sort((a, b) => b.rank - a.rank)",
    to: "[...list]",
  },
  // NOT MUTATED, and worth saying why. Two changes here are EQUIVALENT
  // MUTANTS — they alter the source and cannot alter the behaviour — so
  // a suite that included them would be demanding a test that cannot
  // exist:
  //
  //   `[...list]` -> `list`. `list` is built inside groupResults; it is
  //   never the caller's array, so sorting it in place is unobservable.
  //   The copy stays because the day someone hands this a cached array
  //   it stops being unobservable.
  //
  //   dropping `if (!isSearchKind(result.kind)) continue;`. The output
  //   loop iterates SEARCH_KINDS, so an unknown kind put into the map is
  //   never read back out. The guard stays because it is the layer that
  //   would still hold if that loop changed — and the mutation below
  //   breaks THAT loop instead, which is observable.
  {
    name: "the group ORDER changes, so headings move between keystrokes",
    file: LIB,
    from: '  "module",\n  "file",',
    to: '  "file",\n  "module",',
  },
  {
    name: "groups are emitted in the order they were first seen",
    file: LIB,
    from: "  for (const kind of SEARCH_KINDS) {\n    const list = byKind.get(kind);",
    to: "  for (const kind of byKind.keys()) {\n    const list = byKind.get(kind);",
  },
  {
    name: "only the first group is shown",
    file: LIB,
    from: "  return groups.flatMap((g) => g.results);",
    to: "  return groups.length > 0 ? groups[0].results : [];",
  },

  // ------------------------------------------------------------------
  // THE SNIPPET PARSER — the only thing between database text and the
  // DOM. Every hole here is a rendering bug or an escaping bug.
  // ------------------------------------------------------------------
  {
    name: "the snippet is not parsed, so <<…>> is shown raw",
    file: LIB,
    from: "  const out: { text: string; match: boolean }[] = [];",
    to: "  return [{ text: snippet, match: false }];\n  const out: { text: string; match: boolean }[] = [];",
  },
  {
    name: "an unterminated << is treated as a match marker",
    file: LIB,
    from: "    if (close === -1) break;",
    to: "    if (false) break;",
  },
  {
    name: "empty segments are emitted",
    file: LIB,
    from: "  return out.filter((s) => s.text.length > 0);",
    to: "  return out;",
  },

  // ------------------------------------------------------------------
  // THE DATE FILTER.
  // ------------------------------------------------------------------
  {
    name: '"1 year" reaches back one month',
    file: LIB,
    from: 'range === "365d" ? 365 : 0',
    to: 'range === "365d" ? 30 : 0',
  },
  {
    name: '"Any time" silently becomes "today"',
    file: LIB,
    from: "  if (days === 0) return null;",
    to: "  if (days < 0) return null;",
  },
  {
    name: "a one-letter query is sent to the database",
    file: LIB,
    from: "export const MIN_QUERY_LENGTH = 2;",
    to: "export const MIN_QUERY_LENGTH = 1;",
  },
  {
    name: "isSearchKind coerces, so an array of one kind is a kind",
    file: LIB,
    from: 'return typeof value === "string" && (SEARCH_KINDS as readonly string[]).includes(value);',
    to: "return (SEARCH_KINDS as readonly string[]).includes(String(value));",
  },

  // ------------------------------------------------------------------
  // THE MIGRATION. Links, grants and the shape of the index.
  // ------------------------------------------------------------------
  {
    name: "the ideas rows point at /dashboard/ideas again, which 404s",
    file: SQL,
    from: "['ideas','module','name','problem','/dashboard','ideas','created_at'],",
    to: "['ideas','module','name','problem','/dashboard/ideas','ideas','created_at'],",
  },
  {
    name: "search_all stops declaring SECURITY INVOKER",
    file: SQL,
    from: "security invoker\nset search_path = public, pg_catalog",
    to: "set search_path = public, pg_catalog",
  },
  {
    name: "search_all becomes SECURITY DEFINER, ignoring RLS",
    file: SQL,
    from: "security invoker\nset search_path = public, pg_catalog",
    to: "security definer\nset search_path = public, pg_catalog",
  },
  {
    name: "the select grant on search_index disappears",
    file: SQL,
    from: "grant select on public.search_index to authenticated;",
    to: "-- grant select on public.search_index to authenticated;",
  },
  {
    name: "authenticated gains write access to the index",
    file: SQL,
    from: "grant select on public.search_index to authenticated;",
    to: "grant select on public.search_index to authenticated;\ngrant insert on public.search_index to authenticated;",
  },
  {
    name: "the href reconciliation loses its WHERE",
    file: SQL,
    from: "'update public.search_index set href = %L where source_table = %L and href <> %L',",
    to: "'update public.search_index set href = %L',",
  },
  {
    name: "help articles stop being indexed",
    file: SQL,
    from: "    ['help_articles','help','title','body','/help','','created_at']",
    to: "    ['chat_conversations','chat','title','','/dashboard/chat','','created_at']",
  },
  {
    name: "the grant loop stops revoking from anon",
    file: SQL,
    from: "    execute format('revoke all on function public.%s from anon', fn);",
    to: "    -- execute format('revoke all on function public.%s from anon', fn);",
  },
  {
    name: "the trigger function becomes callable by any signed-in user",
    file: SQL,
    from: "  execute 'revoke all on function public.search_index_sync() from authenticated';",
    to: "  execute 'grant execute on function public.search_index_sync() to authenticated';",
  },

  // ------------------------------------------------------------------
  // THE ROUTE. Parameter names are strings on both sides of PostgREST.
  // ------------------------------------------------------------------
  {
    name: "the RPC's query parameter is renamed on one side only",
    file: ROUTE,
    from: "      p_query: q,",
    to: "      p_q: q,",
  },
  {
    name: "the route stops truncating the query",
    file: ROUTE,
    from: '.trim().slice(0, MAX_QUERY_LENGTH)',
    to: ".trim()",
  },
  {
    name: "the route stops enforcing the minimum query length",
    file: ROUTE,
    from: "    if (q.length < MIN_QUERY_LENGTH) return NextResponse.json({ ok: true, results: [] });",
    to: "    if (q.length < 0) return NextResponse.json({ ok: true, results: [] });",
  },
  {
    name: "the route stops reading the rank, so nothing can be ordered",
    file: ROUTE,
    from: "        rank: Number(row.rank ?? 0),",
    to: "        rank: 0,",
  },

  // ------------------------------------------------------------------
  // THE PALETTE.
  // ------------------------------------------------------------------
  {
    name: "results are listed ungrouped, in whatever order they arrived",
    file: PALETTE,
    from: "flattenGroups(groupResults(contentResults))",
    to: "contentResults",
  },
  {
    name: "the debounce grows to most of a second",
    file: PALETTE,
    from: "    }, 200);",
    to: "    }, 800);",
  },
  {
    name: "a slow answer for an old query can overwrite a newer one",
    file: PALETTE,
    from: "        if (token !== searchTokenRef.current) return;",
    to: "        if (false) return;",
  },
  {
    name: "the cache is unbounded",
    file: PALETTE,
    from: "        if (searchCacheRef.current.size > 40) searchCacheRef.current.clear();",
    to: "        if (false) searchCacheRef.current.clear();",
  },
  {
    name: "the kind filter is left out of the cache key",
    file: PALETTE,
    from: '    if (kindFilter) params.set("kinds", kindFilter);',
    to: "    if (false) return;",
  },
  {
    name: "the selection is not reset when a filter narrows the list",
    file: PALETTE,
    from: "  }, [query, kindFilter, moduleFilter, dateFilter]);\n\n  function handleInputKeyDown",
    to: "  }, [query]);\n\n  function handleInputKeyDown",
  },
  {
    name: "closing the palette keeps the last filters",
    file: PALETTE,
    from: '    setKindFilter("");\n    setModuleFilter("");\n    setDateFilter("any");',
    to: '    setModuleFilter("");\n    setDateFilter("any");',
  },
  {
    name: "the chips steal focus, so the arrow keys stop working",
    file: PALETTE,
    from: "                onMouseDown={(e) => e.preventDefault()}\n                onClick={() => {\n                  setKindFilter(\"\");",
    to: '                onClick={() => {\n                  setKindFilter("");',
  },
  {
    name: "one kind loses its icon",
    file: PALETTE,
    from: "  mission: Target,",
    to: "",
  },
  {
    name: "the snippet is rendered as HTML",
    file: PALETTE,
    from: "                    <span className=\"mt-0.5 block truncate text-[11px] text-muted\">",
    to: "                    <span dangerouslySetInnerHTML={{ __html: result.snippet }} className=\"mt-0.5 block truncate text-[11px] text-muted\">",
  },

  // ------------------------------------------------------------------
  // THE LABELS. A missing key is invisible in nine locales out of ten.
  // ------------------------------------------------------------------
  {
    name: "one kind loses its heading in English",
    file: EN,
    from: '        "help": "Help"',
    to: '        "helpArticles": "Help"',
  },
  {
    name: "one date range loses its label in Greek only",
    file: EL,
    from: '        "365d": "1 έτος"',
    to: '        "365d": ""',
  },
  {
    name: "a translation key is added that nothing renders",
    file: EN,
    from: '        "365d": "1 year"',
    to: '        "365d": "1 year",\n        "all": "Everything"',
  },
  {
    name: "the ideas module loses its filter-chip label",
    file: KEYS,
    from: '  ideas: "sidebar.items.ideas",',
    to: "",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // CAUGHT IS DECIDED BY THE EXIT CODE, not by the text.
  //
  // This used to be `let detail = null` … `if (detail)`, which asks "did
  // we manage to find a line saying FAIL in the child's stdout" and
  // treats a no as "the mutation was missed". A gate that exits non-zero
  // while its stdout arrives empty or truncated — which happened, twice,
  // on different mutants of the same run — was then reported as a HOLE
  // that is not there. An intermittently red mutation gate is worse than
  // none: it teaches you to re-run it until it is green.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
