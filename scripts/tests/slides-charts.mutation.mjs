#!/usr/bin/env node
/*
 * CAN slides-charts.test.mjs SEE A CHART THAT IS NOT THE FILE'S?
 *
 * The model's own numbers let through, a chart number off by one, a list
 * outside the fence, a column of names counted, float noise on a slide,
 * "Other" in English, a file with nothing to draw charged for, a file read
 * without its owner, the list left out of the price, a PowerPoint without
 * the chart or without its values, an edit that forgets the deck's charts,
 * bars of the wrong height, and a deck from a file that comes back without
 * a chart.
 *
 * Run: node scripts/tests/slides-charts.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/slides-charts.test.mjs";
const DECK = "src/lib/presentations/deck.ts";
const CHARTS = "src/lib/presentations/deck-charts.ts";
const PROMPT = "src/lib/presentations/prompt.ts";
const GENERATE = "src/lib/presentations/generate.ts";
const GEOMETRY = "src/lib/presentations/chart-geometry.ts";
const PPTX = "src/lib/presentations/pptx.ts";
const ROUTE = "src/app/api/presentations/generate/route.ts";
const SHELL = "src/components/presentations/presentations-shell.tsx";

const MUTANTS = [
  {
    name: "a chart the model wrote itself is drawn",
    file: DECK,
    from: "      ? chartByNumber(s.chart, options.charts)\n",
    to: "      ? (chartByNumber(s.chart, options.charts) ?? parseSlideChart(s.chart))\n",
    expect: "a chart the model wrote itself, with its own numbers, is no chart",
  },
  {
    name: "the chart number is read off by one",
    file: DECK,
    from: "value <= charts.length ? charts[value - 1] : null;",
    to: "value <= charts.length ? charts[value] ?? null : null;",
    expect: "a chart by its number is the chart the code computed",
  },
  {
    name: "a chart slide keeps six points beside its chart",
    file: DECK,
    from: ".slice(0, chart ? MAX_CHART_BULLETS : MAX_BULLETS);",
    to: ".slice(0, MAX_BULLETS);",
    expect: "points beside it",
  },
  {
    name: "a stored chart of any length is drawn",
    file: DECK,
    from: "    .slice(0, MAX_CHART_POINTS);\n",
    to: "    ;\n",
    expect: "a stored chart of 500 points is cut",
  },
  {
    name: "rows are counted by a column where every row differs",
    file: CHARTS,
    from: "const grouping = categories.filter((c) => c.unique < c.filled);",
    to: "const grouping = categories;",
    expect: "a file of names and addresses allows no chart",
  },
  {
    name: "a value keeps its float noise",
    file: CHARTS,
    from: "      value: clean(p.value),",
    to: "      value: p.value,",
    expect: "0.1 + 0.2 is 0.3",
  },
  {
    name: "the gathered point keeps buildChart's English name",
    file: CHARTS,
    from: "      label: gathered && i === built.points.length - 1 ? other : p.label,",
    to: "      label: p.label,",
    expect: "named in the deck's language",
  },
  {
    name: "a deck from a file can come back without a chart",
    file: CHARTS,
    from: "  if (charts.length === 0 || deck.slides.some((s) => s.chart)) return deck;",
    to: "  return deck;",
    expect: "gets the first one, before the closing slide",
  },
  {
    name: "the list of charts goes outside the fence",
    file: PROMPT,
    from: "${UNTRUSTED_OPEN}${chartList}${context}",
    to: "${chartList}${UNTRUSTED_OPEN}${context}",
    expect: "inside the untrusted markers",
  },
  {
    name: "a column name can close the fence",
    file: PROMPT,
    from: "`\\n${scrub(renderChartsForModel(charts))}\\n\\n---\\n`",
    to: "`\\n${renderChartsForModel(charts)}\\n\\n---\\n`",
    expect: "a marker inside a column name is removed",
  },
  {
    name: "an edit forgets the deck's charts",
    file: GENERATE,
    from: "    charts: deckCharts(params.deck),",
    to: "    charts: [],",
    expect: "the edit call resolves numbers against the deck's own charts",
  },
  {
    name: "a file with nothing to draw goes on to the model",
    file: ROUTE,
    from: '    if (charts.length === 0) return NextResponse.json({ error: "no_chart_data" }, { status: 422 });',
    to: "",
    expect: "refused before the breaker",
  },
  {
    name: "the file is read by id alone",
    file: ROUTE,
    from: '      .eq("id", dataId)\n      .eq("user_id", user.id)',
    to: '      .eq("id", dataId)',
    expect: "the file is read by id AND owner",
  },
  {
    name: "the list is left out of the price",
    file: ROUTE,
    from: "description.length + businessContext.length + deckChartsChars(charts)",
    to: "description.length + businessContext.length",
    expect: "the list is in the estimate",
  },
  {
    name: "a chart slide is exported as points",
    file: PPTX,
    from: "        if (slide.chart) addChartSlide(",
    to: "        if (slide.chart && false) addChartSlide(",
    expect: "chart parts, one per chart slide",
  },
  {
    name: "the PowerPoint chart hides its values",
    file: PPTX,
    from: "    showValue: true,",
    to: "    showValue: false,",
    expect: "every chart shows its values on it",
  },
  {
    name: "a bar is not as tall as its value",
    file: GEOMETRY,
    from: "h: Math.abs(yOf(v) - out.zero) };",
    to: "h: Math.abs(yOf(v) - out.zero) / 2 + 1 };",
    expect: "a bar's height is its value",
  },
  {
    name: "the file's id goes with the brief before it is read",
    file: SHELL,
    from: 'chartsFromFile && dataFile?.state === "ready" && dataFile.id ? { dataId: dataFile.id }',
    to: "dataFile?.id ? { dataId: dataFile.id }",
    expect: "its id with the brief once it is read",
  },
];

runMutations({ name: "slides-charts", gate: GATE, targets: [DECK, CHARTS, PROMPT, GENERATE, GEOMETRY, PPTX, ROUTE, SHELL], mutants: MUTANTS });
