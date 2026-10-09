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
 * one page changing another; and a failure said in the server's English
 * on a Greek screen — out of credits, a provider down, a change held back
 * or still running, a site that was not made; and a refusal in Chat's
 * Site pane read as «Request failed with 200».
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
const REQUESTS = "src/lib/website-builder/site-requests.ts";
const GENERATE = "src/app/api/websites/generate/route.ts";
const EDIT = "src/app/api/websites/edit/route.ts";
const PUBLISH = "src/components/publishing/publish-control.tsx";
const LIVE = "src/components/publishing/published-sites-list.tsx";

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
    name: "undo lands in the middle of an edit",
    file: ROUTE,
    from: "      .or(`editing_started_at.is.null,editing_started_at.lt.${staleClaimCutoff}`)\n",
    to: "",
    expect: "...never in the middle of an edit: the edit's own lock is respected",
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
  {
    name: "a site that was not made says the worker's English again",
    file: SHELL,
    from: '          say({ role: "tool", text: failedText(record) });',
    to: '          say({ role: "tool", text: record.error_message ?? failedText(record) });',
    expect: "no server sentence reaches the conversation: not error_message, not getErrorMessage",
  },
  {
    name: "a refused site says the route's sentence",
    file: SHELL,
    from: '        say({ role: "tool", text: describe(outcome.error).text });',
    to: '        say({ role: "tool", text: outcome.error.message });',
    expect: "a refusal to make a site is said through the shared error sentences",
  },
  {
    name: "a change held back says nothing about the credits",
    file: SHELL,
    from: '                  ? `${tShell("site.held")} ${tErrors("credits.notCharged")}`',
    to: '                  ? tShell("site.held")',
    expect: "...and so is a refused change, after its own four reasons",
  },
  {
    name: "a site that failed after it was written is promised free",
    file: SHELL,
    from: 'written ? tErrors("credits.unverified") : tErrors("credits.notCharged")',
    to: 'tErrors("credits.notCharged")',
    expect: "...free only when no whole document was written; a stop says what it cost",
  },
  {
    name: "out of credits is a site not made, with the server's sentence",
    file: REQUESTS,
    from: '    if (data.rateLimited) return { kind: "refused", error: refusedBeforeWork(data), ...routeSaid(data) };\n',
    to: "",
    expect: "...a refusal answered 200 is one before any work: short credits, or a limit",
  },
  {
    name: "short credits are said as a limit",
    file: REQUESTS,
    from: '  const short = data?.code === "insufficientCredits";',
    to: '  const short = false;',
    expect: "...a refusal answered 200 is one before any work: short credits, or a limit",
  },
  {
    name: "a held change is said as an unknown failure",
    file: REQUESTS,
    from: '          : data?.flagged === true\n            ? "held"\n',
    to: '          : false\n            ? "held"\n',
    expect: "...and a change's refusal names a held change and a busy site",
  },
  {
    name: "making a site without credits does not name the code",
    file: GENERATE,
    from: '          rateLimited: true,\n          code: "insufficientCredits",\n          message: insufficientCreditsMessage(check.remaining, estimatedCost),',
    to: '          rateLimited: true,\n          message: insufficientCreditsMessage(check.remaining, estimatedCost),',
    expect: "making a site: every credit refusal carries the code",
  },
  {
    name: "a site already being changed is not named",
    file: EDIT,
    from: "        busy: true,\n",
    to: "",
    expect: "...a site already being changed says so",
  },
  {
    name: "a provider failure on a change is not named",
    file: EDIT,
    from: '          code: "upstreamUnavailable",\n',
    to: "",
    expect: "...a provider failure is named, and says the hold went back",
  },
  {
    name: "a brief that is not a website shows the classifier's sentence",
    file: SHELL,
    from: '        say({ role: "tool", text: outcome.offTopic ? tShell("site.offTopic") : t("generateFailed") });',
    to: '        say({ role: "tool", text: outcome.message ?? t("generateFailed") });',
    expect: "a brief that is not a website is said in the reader's words, not the classifier's",
  },
  {
    name: "a refusal's message is ApiError's default again",
    file: REQUESTS,
    from: 'return new ApiError(status, { ...(data ?? {}), error: typeof prose === "string" ? prose : "" });',
    to: "return new ApiError(status, data);",
    expect: "Chat's Site pane says a refusal in the route's sentence or its own",
  },
  {
    name: "a refused publish shows the route's English",
    file: PUBLISH,
    from: '        addToast(refusalText(response.status, data), "error");',
    to: '        addToast(data?.error ?? refusalText(response.status, data), "error");',
    expect: "...and no publishing control shows the route's own sentence",
  },
  {
    name: "the plan's limit is said as a general failure",
    file: PUBLISH,
    from: '    if (data?.limitReached === true) return t("limitReached");\n',
    to: "",
    expect: "a refused publish is said from what the route names: the plan's limit, paid plans only, the security scan, today's limit",
  },
  {
    name: "a refused rollback on the live sites shows the route's English",
    file: LIVE,
    from: '      if (!data.ok) {\n        addToast(t("rollbackError"), "error");',
    to: '      if (!data.ok) {\n        addToast(data.error ?? t("rollbackError"), "error");',
    expect: "...and no publishing control shows the route's own sentence",
  },
];

runMutations({
  name: "site-pages",
  gate: GATE,
  targets: [REQ, UNDO, ROUTE, ZIP, DL, PROC, NOTES, SHELL, REQUESTS, GENERATE, EDIT, PUBLISH, LIVE],
  mutants: MUTANTS,
});
