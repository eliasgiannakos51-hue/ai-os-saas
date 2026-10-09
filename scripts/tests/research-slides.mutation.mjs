#!/usr/bin/env node
/*
 * CAN research-slides.test.mjs SEE A NUMBER OPEN THE WRONG PAGE, A DECK
 * INVENT ITS SOURCES, OR A REPORT REACH SLIDES IT SHOULD NOT?
 *
 * Numbers that link through a reference (so "[1][2]" opens one page), a
 * number with no source linked to nothing, a javascript: source linked, a
 * quote in a title breaking out; a brief without its numbers or without
 * its ceiling; sources slides numbered from one on every slide, or past the
 * deck's bounds, or left to the model; another person's report read, an
 * unfinished one presented, the switch ignored, a typed description let
 * past the field's limit; the button sending the text instead of the id,
 * or spending a large amount with no second press. And (since 2026-10-08)
 * every way back to English on a Greek Research screen: a stored reason no
 * longer recognised, a refusal said in the route's words, a failed plan
 * that no longer says it was the AI service — and a run the AI service never
 * answered blamed on the topic.
 *
 * Run: node scripts/tests/research-slides.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/research-slides.test.mjs";
const RUN = "scripts/tests/research-slides.itest.mjs";
const CITED = "src/lib/research/cited-markdown.ts";
const BRIEF = "src/lib/research/research-to-slides.ts";
const ROUTE = "src/app/api/presentations/generate/route.ts";
const SEND = "src/components/research/send-to-slides.tsx";
// In the reader's language (the package check of 2026-10-08).
const FAILURE = "src/lib/research/failure.ts";
const PLAN = "src/app/api/research/route.ts";
const RSHELL = "src/components/research/research-shell.tsx";
const RPAGE = "src/components/research/research-workspace.tsx";
const QUESTION = "src/lib/research/research.ts";
const RUNNER = "src/lib/research/run-research.ts";

const MUTANTS = [
  {
    name: "the numbers link through a reference, so [1][2] is one link",
    file: CITED,
    from: '    return `[\\\\[${digits}\\\\]](<${href.replace(/[<>\\s]/g, encodeURIComponent)}> "${title}")`;',
    to: "    return `[${digits}]`;",
    gate: RUN,
    expect: "every valid number is a link",
  },
  {
    name: "a number with no source is no longer marked",
    file: CITED,
    from: "  const marked = annotateDanglingCitations(body, sources.length, entryCount);",
    to: "  const marked = body;",
    expect: "a number past the list is marked, and is no link",
  },
  {
    name: "a javascript: source becomes a link",
    file: CITED,
    from: '    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;',
    to: "    return u.href;",
    expect: "only http(s) addresses are linked",
  },
  {
    name: "a quote in a title ends the link",
    file: CITED,
    from: '    const title = source.title.replace(/["\\\\]/g, "\'").slice(0, 200);',
    to: "    const title = source.title.slice(0, 200);",
    expect: "...and a quote in a title cannot end the link",
  },
  {
    name: "the brief stops asking for the numbers to stay",
    file: BRIEF,
    from: '      ? "Keep the source number [n] after every claim that has one in the report, exactly as written there — the numbered sources slides are added after yours, so do not write a sources slide yourself. "',
    to: '      ? ""',
    expect: "...asks for the numbers to stay and nothing to be added",
  },
  {
    name: "a long report is sent whole",
    file: BRIEF,
    from: "  if (body.length > room) {",
    to: "  if (false) {",
    expect: "is cut to",
  },
  {
    name: "every sources slide numbers from one",
    file: BRIEF,
    from: "    const first = p * MAX_BULLETS;",
    to: "    const first = 0;",
    expect: "...numbered as the report numbers them, across slides",
  },
  {
    name: "the sources slides go past the deck's ceiling",
    file: BRIEF,
    from: "  const used = Math.min(pages, room);",
    to: "  const used = pages;",
    expect: "with room for one slide, one is added and says how many it could not hold",
  },
  {
    name: "the model's own sources are trusted instead",
    file: ROUTE,
    from: "    let deck: Deck = withSourcesSlides(outcome.deck, reportSources);",
    to: "    let deck: Deck = outcome.deck;",
    expect: "the sources slides come from the stored list, after the model",
  },
  {
    name: "another person's report is read",
    file: ROUTE,
    from: '      .eq("id", researchId)\n      .eq("user_id", user.id)',
    to: '      .eq("id", researchId)',
    expect: "...by id AND owner",
  },
  {
    name: "an unfinished report is presented",
    file: ROUTE,
    from: '    const made = report.status === "ready" ? researchBrief(',
    to: "    const made = true ? researchBrief(",
    expect: "...only when it is finished",
  },
  {
    name: "the switch is ignored",
    file: ROUTE,
    from: '    if (!(await isFeatureOn("research-slides", user))) return NextResponse.json({ error: "not_enabled" }, { status: 403 });\n',
    to: "",
    expect: "the report is read only with the switch on",
  },
  {
    name: "a typed description is let past the field's limit",
    file: ROUTE,
    from: "  if (researchId === null) {\n    const verdict = checkDeckDescription(description);",
    to: "  if (false) {\n    const verdict = checkDeckDescription(description);",
    expect: "...and a typed description is still held to the field's limits",
  },
  {
    name: "a large amount is spent with no second press",
    file: SEND,
    from: '    if (estimate.needsConfirmation && state !== "confirm") {',
    to: '    if (false && state !== "confirm") {',
    expect: "...a large one asks once more",
  },
  {
    name: "a report that found nothing is no longer recognised, and says only that it failed",
    file: FAILURE,
    from: '  noFindings: "The searches did not return anything usable on this topic.",',
    to: '  noFindings: "The searches did not return anything.",',
    expect: "every sentence a failed report is stored with is said in the reader's language",
  },
  {
    name: "a question the AI service never answered is no longer marked",
    file: QUESTION,
    from: '      finding: { question: params.question.question, summary: "", sources: [], failed: true },',
    to: '      finding: { question: params.question.question, summary: "", sources: [] },',
    expect: "a question the AI service never answered is marked so (research.ts, the catch)",
  },
  {
    name: "a run the AI service never answered says the topic gave nothing",
    file: RUNNER,
    from: "    const serviceDown = findings.length > 0 && findings.every((f) => f.failed === true);",
    to: "    const serviceDown = false && findings.every((f) => f.failed === true);",
    expect: "...and a run where every question is so marked says the service did not answer, never that the topic gave nothing",
  },
  {
    name: "the service's sentence is no longer recognised, and says only that the report failed",
    file: FAILURE,
    from: '  unavailable: "The AI service did not answer the research questions. Please run it again in a moment.",\n',
    to: "",
    expect: "every sentence a failed report is stored with is said in the reader's language",
  },
  {
    name: "out of credits is said as a failed plan",
    file: FAILURE,
    from: '  if (body?.insufficientCredits === true || status === 402) return "noCredits";\n',
    to: "",
    expect: "a refused plan or start is said by what it is",
  },
  {
    name: "the plan route stops saying the AI service did not answer",
    file: PLAN,
    from: '          code: planned.reason === "api_error" ? "ai_unavailable" : "plan_unusable",\n',
    to: "",
    expect: "...the plan route says which kind of failed plan it was",
  },
  {
    name: "the shell says a failed report's stored English",
    file: RSHELL,
    from: '            say({ role: "tool", text: failures.failed(report.error) });',
    to: '            say({ role: "tool", text: report.error ?? failures.failed(report.error) });',
    expect: "shell: nothing a request answers, and no stored reason, is shown as it came",
  },
  {
    name: "the shell says the plan route's English",
    file: RSHELL,
    from: 'say({ role: "tool", text: named(data, response.status) ? failures.refused(data, response.status, "plan") : refusalText(response.status, data) });',
    to: 'say({ role: "tool", text: data?.error ?? failures.refused(data, response.status, "plan") });',
    expect: "shell: nothing a request answers, and no stored reason, is shown as it came",
  },
  {
    name: "the page lists a failed report with its stored English",
    file: RPAGE,
    from: "{failures.failed(report.error)}",
    to: "{report.error}",
    expect: "page: a failed report's line in the list says why, in the reader's language",
  },
];

runMutations({
  name: "research-slides",
  gate: GATE,
  targets: [CITED, BRIEF, ROUTE, SEND, FAILURE, PLAN, RSHELL, RPAGE, QUESTION, RUNNER],
  mutants: MUTANTS,
});
