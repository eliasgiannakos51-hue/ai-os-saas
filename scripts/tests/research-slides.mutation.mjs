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
 * or spending a large amount with no second press.
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
    from: "  if (researchId === null) {\n    const verdict = checkDescription(description);",
    to: "  if (false) {\n    const verdict = checkDescription(description);",
    expect: "...and a typed description is still held to the field's limits",
  },
  {
    name: "a large amount is spent with no second press",
    file: SEND,
    from: '    if (estimate.needsConfirmation && state !== "confirm") {',
    to: '    if (false && state !== "confirm") {',
    expect: "...a large one asks once more",
  },
];

runMutations({
  name: "research-slides",
  gate: GATE,
  targets: [CITED, BRIEF, ROUTE, SEND],
  mutants: MUTANTS,
});
