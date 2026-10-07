#!/usr/bin/env node
/*
 * CAN site-pages.test.mjs SEE A SITE GET THE WRONG PAGES, LOSE A CHANGE,
 * OR DOWNLOAD BROKEN?
 *
 * A page count read out of the person's own sentence, or from the wrong
 * line, or past the cap; an undo that redoes, or reads the history out of
 * order, or runs with the switch off or on a site being made; an archive
 * with a wrong checksum, or pages that link to nothing; fewer pages than
 * asked passed off in silence; a first version without its pages; the
 * change sent to the home page from another page's tab; a part chosen on
 * one page changing another.
 *
 * Run: node scripts/tests/site-pages.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/site-pages.test.mjs";
const RUN = "scripts/tests/site-pages.itest.mjs";
const REQ = "src/lib/websites/page-request.ts";
const UNDO = "src/lib/websites/undo.ts";
const ROUTE = "src/app/api/websites/[id]/undo/route.ts";
const ZIP = "src/lib/websites/zip-store.ts";
const DL = "src/lib/websites/site-download.ts";
const PROC = "src/app/api/websites/generate/process/route.ts";
const NOTES = "src/lib/website-generation-notes.ts";
const SHELL = "src/components/website-builder/website-shell.tsx";

const MUTANTS = [
  {
    name: "a page count is read out of the person's own sentence",
    file: REQ,
    from: "  const matches = [...description.matchAll(/^PAGES REQUESTED: (\\d+)\\. Write exactly/gm)];",
    to: "  const matches = [...description.matchAll(/PAGES REQUESTED: (\\d+)\\. Write exactly/gm)];",
    expect: "...never from the person's own words in the middle of a line",
  },
  {
    name: "the first request wins over the last",
    file: REQ,
    from: "  const last = matches.at(-1);",
    to: "  const last = matches[0];",
    expect: "...from the last line when a brief was compiled twice",
  },
  {
    name: "more pages than a site may have are asked for",
    file: REQ,
    from: "  const n = Math.min(count, MAX_PAGES_PER_SITE);",
    to: "  const n = count;",
    expect: "more than a site may have is held to the cap",
  },
  {
    name: "undo twice redoes",
    file: UNDO,
    from: "      if (stack.length > 1) stack.pop();",
    to: "      stack.push(row);",
    expect: "undo twice goes back two changes — it never redoes",
  },
  {
    name: "the history is read in the order it arrives",
    file: UNDO,
    from: "  const ordered = [...rows].sort(",
    to: "  const ordered = [...rows]; [].sort(",
    expect: "the history is read in the order it happened, whatever order it arrives in",
  },
  {
    name: "undo runs with the switch off",
    file: ROUTE,
    from: '    if (!(await isFeatureOn("site-pages", user))) return fail("not_enabled", 403);\n',
    to: "",
    expect: "the route is behind the switch",
  },
  {
    name: "undo runs on a site being made",
    file: ROUTE,
    from: '    if (site.status !== "completed") return fail("busy", 409);\n',
    to: "",
    expect: "...a site being made or changed is refused",
  },
  {
    name: "the archive carries a wrong checksum",
    file: ZIP,
    from: "    local.setUint32(14, crc, true);",
    to: "    local.setUint32(14, crc ^ 1, true);",
    expect: "the archive reads back: names (UTF-8), contents, checksums, the end record",
  },
  {
    name: "the downloaded pages link to nothing",
    file: DL,
    from: "    if (page === null) return whole;",
    to: "    return whole;",
    expect: "...whose links to each other are the files",
  },
  {
    name: "the files are not .html, so nothing opens them",
    file: DL,
    from: "const fileOf = (slug: string) => (slug ? `${slug}.html` : \"index.html\");",
    to: "const fileOf = (slug: string) => (slug ? slug : \"index.html\");",
    gate: RUN,
    expect: "...the files are the site's pages",
  },
  {
    name: "fewer pages than asked are passed off in silence",
    file: PROC,
    from: '      if (pagesAsked !== null && pagesMade < pagesAsked) notes.push({ kind: "pagesShort", asked: pagesAsked, made: pagesMade });\n',
    to: "",
    expect: "the worker compares what was asked with what was made",
  },
  {
    name: "the note says fewer when there were not fewer",
    file: NOTES,
    from: '    } else if (n.kind === "pagesShort" && isNonNegativeInt(n.asked) && isNonNegativeInt(n.made) && n.made >= 1 && n.asked > n.made) {',
    to: '    } else if (n.kind === "pagesShort" && isNonNegativeInt(n.asked) && isNonNegativeInt(n.made) && n.made >= 1) {',
    expect: "the note is read back, and only when fewer were made",
  },
  {
    name: "the first version keeps only the home page",
    file: PROC,
    from: "      version_number: FIRST_VERSION_NUMBER,\n      html_content: htmlContent,\n",
    to: "      version_number: FIRST_VERSION_NUMBER,\n      html_content: htmlContent,\n      __first: true,\n",
    expect: "the first version keeps the whole site, so undo never loses pages",
  },
  {
    name: "a change said on another page's tab goes to the home page",
    file: SHELL,
    from: "section: part, ...(pages ? { pageSlug: slug } : {}) });",
    to: "section: part });",
    expect: "the change goes to the open page",
  },
  {
    name: "a part chosen on one page is kept on another",
    file: SHELL,
    from: "box.siteId === current.id && box.slug === pageSlug && box.index < boxes.length",
    to: "box.siteId === current.id && box.index < boxes.length",
    expect: "a chosen part belongs to its page: another page forgets it",
  },
];

runMutations({
  name: "site-pages",
  gate: GATE,
  targets: [REQ, UNDO, ROUTE, ZIP, DL, PROC, NOTES, SHELL],
  mutants: MUTANTS,
});
