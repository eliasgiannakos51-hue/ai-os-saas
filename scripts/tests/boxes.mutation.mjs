#!/usr/bin/env node
/*
 * CAN boxes.test.mjs SEE A CHANGE TO ONE BOX REACH THE REST?
 *
 * The model's whole answer kept instead of one slide or one part, the
 * deck's title taken from it, the mark left on the saved page, a part
 * that is not on the page let through to the money, the box not sent by
 * the shell, a picture search for the whole deck to change one slide,
 * and the preview given scripts so a box could be pressed inside it.
 *
 * Run: node scripts/tests/boxes.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/boxes.test.mjs";
const DECK = "src/lib/presentations/deck.ts";
const BOXES = "src/lib/website-boxes.ts";
const SLIDES_ROUTE = "src/app/api/presentations/[id]/edit/route.ts";
const SITE_ROUTE = "src/app/api/websites/edit/route.ts";
const SLIDES = "src/components/presentations/presentations-shell.tsx";
const SITE = "src/components/website-builder/website-shell.tsx";
const EL = "messages/el.json";

const MUTANTS = [
  {
    name: "the model's whole deck is kept instead of one slide",
    file: DECK,
    from: "  return { ...stored, slides: stored.slides.map((slide, i) => (i === index ? changed : slide)) };",
    to: "  return { ...stored, slides: edited.slides };",
    expect: "every other slide is the stored one",
  },
  {
    name: "the deck's title is taken from the model",
    file: DECK,
    from: "  return { ...stored, slides: stored.slides.map((slide, i) => (i === index ? changed : slide)) };",
    to: "  return { ...edited, slides: stored.slides.map((slide, i) => (i === index ? changed : slide)) };",
    expect: "so is the deck's title",
  },
  {
    name: "a slide past the end is accepted",
    file: DECK,
    from: 'value >= 0 && value < total ? value : "bad";\n}\n\n/**\n * The changed slide',
    to: 'value >= 0 && value <= total ? value : "bad";\n}\n\n/**\n * The changed slide',
    expect: "a slide index from a request",
  },
  {
    name: "a slide that wants another picture keeps the old one",
    file: DECK,
    from: '(source === "own" || after.imageQuery === before.imageQuery)',
    to: "(true)",
    expect: "searched for again",
  },
  {
    name: "the model's whole page is saved instead of one part",
    file: BOXES,
    from: "  return `${stored.slice(0, box.start)}${clean}${stored.slice(box.end)}`;",
    to: "  return edited.replace(MARKED, \"\");",
    expect: "every other byte is the stored page",
  },
  {
    name: "the mark reaches the saved page",
    file: BOXES,
    from: '  const clean = changed.replace(MARKED, "");',
    to: "  const clean = changed;",
    expect: "the mark does not reach the saved page",
  },
  {
    name: "a '>' inside an attribute ends the tag",
    file: BOXES,
    from: "const TAG = /<!--[\\s\\S]*?-->|<(\\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>/g;",
    to: "const TAG = /<!--[\\s\\S]*?-->|<(\\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;",
    expect: "does not end a tag",
  },
  {
    name: "the sections inside <main> are one box",
    file: BOXES,
    from: 'element.tag === "main" ?',
    to: 'element.tag === "none" ?',
    expect: "the boxes are the header",
  },
  {
    name: "Slides: a slide not in the deck reaches the money",
    file: SLIDES_ROUTE,
    from: '  if (box === "bad") return NextResponse.json({ error: "bad_slide" }, { status: 400 });',
    to: "",
    expect: "refused before any credits are held",
  },
  {
    name: "Slides: the whole deck is searched for pictures to change one slide",
    file: SLIDES_ROUTE,
    from: "resolveUnsplashImages({ ...boxed, slides: [slide] })",
    to: "resolveUnsplashImages({ ...boxed, slides: boxed.slides })",
    expect: "searched for that one slide only",
  },
  {
    name: "Slides: the model's deck is saved whole",
    file: SLIDES_ROUTE,
    from: "    let deck: Deck = boxed ?? outcome.deck;",
    to: "    let deck: Deck = outcome.deck;",
    expect: "the rest of the deck is the stored deck",
  },
  {
    name: "Site: the model's page is saved whole",
    file: SITE_ROUTE,
    from: "        updatedHtml = boxed;",
    to: "        void boxed;",
    expect: "the rest of the page is the stored page",
  },
  {
    name: "Site: the model is not shown which part",
    file: SITE_ROUTE,
    from: "section === null ? sourceHtml : (markBoxForEdit(sourceHtml, section) ?? sourceHtml),",
    to: "sourceHtml,",
    expect: "sees the part marked",
  },
  {
    name: "Site: a part that did not come back is charged as a failure without saying why",
    file: SITE_ROUTE,
    from: "      if (err instanceof Error && err.message === BOX_LOST) {",
    to: "      if (false) {",
    expect: "releases the hold and says so",
  },
  {
    name: "Slides: the change is sent without the slide",
    file: SLIDES,
    from: "...(box === null ? {} : { slideIndex: box })",
    to: "...{}",
    expect: "the change goes with the slide",
  },
  {
    name: "Slides: another deck keeps the old deck's slide chosen",
    file: SLIDES,
    from: "    setOpenDeck(next);\n    setBox(null);",
    to: "    setOpenDeck(next);",
    expect: "forgets the chosen slide",
  },
  {
    name: "Site: the change is sent without the part",
    file: SITE,
    from: "...(part === null ? {} : { section: part })",
    to: "...{}",
    expect: "the change goes with the part",
  },
  {
    name: "Site: the preview runs scripts so a part can be pressed inside it",
    file: SITE,
    from: 'srcDoc={chosen === null ? html : outlineBoxes(html, chosen)}\n                  sandbox=""',
    to: 'srcDoc={chosen === null ? html : outlineBoxes(html, chosen)}\n                  sandbox="allow-scripts"',
    expect: "stays without scripts",
  },
  {
    name: "Greek loses the sentence for a part that did not come back",
    file: EL,
    from: '"lost": "Το κουτί δεν γύρισε από την αλλαγή, οπότε δεν άλλαξε τίποτα. Δοκίμασε ξανά.",',
    to: '"lost": "",',
    expect: "el: the boxes' words",
  },
];

runMutations({
  name: "boxes",
  gate: GATE,
  targets: [DECK, BOXES, SLIDES_ROUTE, SITE_ROUTE, SLIDES, SITE, EL],
  mutants: MUTANTS,
});
