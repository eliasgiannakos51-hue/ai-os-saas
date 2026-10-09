#!/usr/bin/env node
/*
 * CAN library.test.mjs SEE THE LIBRARY BREAK?
 *
 * Somebody else's things shown, a broken table read as "nothing made",
 * failed things listed, a page's tags searched as its words, a deck's
 * slides not searched at all, an accent that hides a match, the newest
 * not first, every page's text read on every visit, the Library shown
 * with its switch off, an old item read without its owner, a link that
 * opens the tool on the wrong item, a tool's table left out, and the
 * search's own words escaped away.
 *
 * Run: node scripts/tests/library.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/library.test.mjs";
const LOAD = "src/lib/library/load.ts";
const SOURCES = "src/lib/library/sources.ts";
const REQUESTED = "src/lib/library/requested.ts";
const TIMELINE = "src/app/dashboard/timeline/page.tsx";
const FILTERS = "src/components/timeline/timeline-filters.tsx";
const SLIDES_PAGE = "src/app/dashboard/presentations/page.tsx";
const SITE_SHELL = "src/components/website-builder/website-shell.tsx";
const RESEARCH_SHELL = "src/components/research/research-shell.tsx";
const EL = "messages/el.json";
const VIEW = "src/components/library/library-view.tsx";

const MUTANTS = [
  {
    // 2026-10-08: nothing could be read, and the page said nothing was made.
    name: "a failed load reads as «nothing made yet»",
    file: VIEW,
    from: "{items.length === 0 && failed.length > 0 ? null : items.length === 0 ? (",
    to: "{items.length === 0 ? (",
    expect: "a tool that did not load is never followed by",
  },
  {
    name: "the owner is left to RLS alone",
    file: LOAD,
    from: '        .eq("user_id", userId)\n',
    to: "",
    expect: "every query carries the owner",
  },
  {
    name: "a table that fails reads as nothing made",
    file: LOAD,
    from: "        failed.push(source.kind);\n",
    to: "",
    expect: "a table that fails is reported",
  },
  {
    name: "what failed to be made is listed",
    file: LOAD,
    from: "        if (!source.keep(row)) continue;\n",
    to: "",
    expect: "what failed to be made is left out",
  },
  {
    name: "the newest are not first across tools",
    file: LOAD,
    from: "    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())\n",
    to: "",
    expect: "newest first across tools",
  },
  {
    name: "every page's text is read on every visit",
    file: LOAD,
    from: "const columns = searching ? `${source.columns}, ${source.contentColumns}` : source.columns;",
    to: "const columns = `${source.columns}, ${source.contentColumns}`;",
    expect: "without a search, no page text",
  },
  {
    name: "an accent hides a match",
    file: LOAD,
    from: "if (!matchesSearch(haystack, query)) continue;",
    to: "if (!haystack.includes(query)) continue;",
    expect: "without the accent",
  },
  {
    name: "a page's tags are searched as its words",
    file: SOURCES,
    from: 'if (column === "html_content") parts.push(textOfHtml(text(value)));',
    to: 'if (column === "html_content") parts.push(text(value));',
    expect: "a page's tags are not its words",
  },
  {
    name: "what is inside a deck or a list of posts is not searched",
    file: SOURCES,
    from: "    else stringsIn(value, parts);\n",
    to: "    else void stringsIn;\n",
    expect: "a deck is found by a bullet",
  },
  {
    name: "Posts are left out of the Library",
    file: SOURCES,
    from: '  {\n    kind: "posts",\n    table: "generated_posts",',
    to: '  {\n    kind: "posts",\n    table: "generated_posts_gone",',
    expect: "every table a tool inserts into is a Library source",
  },
  {
    name: "any string is taken as an id",
    file: REQUESTED,
    from: 'return typeof value === "string" && UUID.test(value) ? value : null;',
    to: 'return typeof value === "string" ? value : null;',
    expect: "an id is a UUID or nothing",
  },
  {
    name: "the Library is shown with its switch off",
    file: TIMELINE,
    from: 'if (library && searchParams.view !== "entries") {',
    to: 'if (true && searchParams.view !== "entries") {',
    expect: "drawn only with the switch on",
  },
  {
    name: "a filter on the entries jumps back to the Library",
    file: FILTERS,
    from: '    if (entriesView) params.set("view", "entries");\n',
    to: "",
    expect: "the filters stay on the entries tab",
  },
  {
    name: "Slides: an old deck is read without its owner",
    file: SLIDES_PAGE,
    from: '      .eq("id", wanted)\n      .eq("user_id", user.id)\n',
    to: '      .eq("id", wanted)\n',
    expect: "presentations: an item older than the list is read by id AND owner",
  },
  {
    name: "Site: the link opens the tool, not the site",
    file: SITE_SHELL,
    from: "useState<string | null>(opened);",
    to: "useState<string | null>(null);",
    expect: "website-shell.tsx opens on the asked item",
  },
  {
    name: "Research: a report from a link opens without its sections",
    file: RESEARCH_SHELL,
    from: "    if (askedId) void refresh(askedId);\n",
    to: "",
    expect: "research-shell.tsx opens on the asked item",
  },
  {
    name: "Greek escapes the search's words",
    file: EL,
    from: '"title": "Τίποτα δεν λέει «{query}»",',
    to: "\"title\": \"Τίποτα δεν λέει '{query}'\",",
    expect: "el: the search is named",
  },
];

runMutations({
  name: "library",
  gate: GATE,
  targets: [LOAD, SOURCES, REQUESTED, TIMELINE, FILTERS, SLIDES_PAGE, SITE_SHELL, RESEARCH_SHELL, EL, VIEW],
  mutants: MUTANTS,
});
