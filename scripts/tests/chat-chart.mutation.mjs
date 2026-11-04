#!/usr/bin/env node
/*
 * WOULD THE MODEL QUIETLY GETTING A SAY IN THE CHART BE NOTICED? WOULD THE
 * SWITCH BEING STEPPED AROUND BE NOTICED? WOULD THE STOP-GATE BEING
 * STEPPED OVER BE NOTICED?
 *
 * Chat Κομμάτι 1 is the owner's directive 30 («CHAT: ΓΡΑΦΗΜΑΤΑ,
 * ΔΙΑΓΡΑΜΜΑΤΑ ΚΑΙ ΚΑΡΤΕΣ ΜΕΣΑ ΣΤΗΝ ΑΠΑΝΤΗΣΗ», 2026-10-31) and its own
 * sentence is the thing hardest to keep true by accident: «Οι αριθμοί
 * υπολογίζονται με κώδικα, ποτέ από το μοντέλο.» Nothing on the screen
 * would look different if the model's own words leaked into which chart
 * gets drawn — the mutant that does exactly that is the one worth
 * reading first.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/chat-chart.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/chat-chart.test.mjs";
const CARRIER = "src/lib/chat/answer-chart.ts";
const ROUTE = "src/app/api/chat/route.ts";
const WORKSPACE = "src/components/chat/chat-workspace.tsx";
const COMPONENT = "src/components/chat/answer-chart.tsx";
const FLAGS = "src/lib/flags/flags.ts";

const MUTANTS = [
  // ---- the one sentence this whole piece exists to keep true ----------
  {
    name: "the model's own words get a vote in which chart is drawn",
    file: ROUTE,
    from: "chart = charts[0] ?? null;",
    to: 'chart = assistantText.includes("γράφημα") ? charts[0] ?? null : null;',
    expect: "never from anything the model wrote: the model's own text plays no part in which chart is picked",
  },
  // ---- the switch -------------------------------------------------------
  {
    name: "the flags.ts declaration disappears",
    file: FLAGS,
    from: '  "chat-charts": "Chat draws a chart under its answer',
    to: '  "chat-charts-renamed": "Chat draws a chart under its answer',
    expect: '"chat-charts" is declared as a switch',
  },
  {
    name: "a \"data\" attachment is let through with the switch off",
    file: ROUTE,
    from: '(!chatChartsOn && readAttachments.list.some((a) => a.kind === "data"))',
    to: "false",
    expect: 'and a "data" attachment is refused with the switch off',
  },

  // ---- the row the chart comes from is scoped to the caller ------------
  {
    name: "the data_analyses read drops the owner filter and leans on RLS alone",
    file: ROUTE,
    from: '.eq("id", dataAttachment.dataId)\n            .eq("user_id", user.id)',
    to: '.eq("id", dataAttachment.dataId)',
    expect: "from the ATTACHED row, scoped to the caller",
  },

  // ---- the stored and streamed text actually carry the chart -----------
  {
    name: "the chart is computed but never folded into what gets stored",
    file: ROUTE,
    from: "const finalText = attachAnswerChart(sourced.text, chart);",
    to: "const finalText = sourced.text; void chart;",
    expect: "the final text folds the chart into what gets stored",
  },
  {
    name: "the assistant row is saved with the un-charted text",
    file: ROUTE,
    from: "role: \"assistant\",\n          content: finalText,",
    to: 'role: "assistant",\n          content: sourced.text,',
    expect: "STORES it, so a reload shows the same chart",
  },

  // ---- the carrier itself --------------------------------------------
  {
    name: "a chart with no points still round-trips and gets drawn as an empty figure",
    file: CARRIER,
    from: "if (!Array.isArray(c.points) || c.points.length === 0) return false;",
    to: "if (!Array.isArray(c.points)) return false;",
    expect: "a chart with no points is rejected",
  },
  {
    name: "the carrier's own closing quote stops guarding against a quote inside a label",
    file: CARRIER,
    from: 'return `${text.replace(/\\s+$/, "")}\\n\\n[${LABEL}]: <> "${encoded}"\\n`;',
    to: 'return `${text.replace(/\\s+$/, "")}\\n\\n[${LABEL}]: <> ${encoded}\\n`;',
    expect: "a label containing a quote mark survives round-trip intact",
  },

  // ---- the component: the design's own tokens, one white button, a
  //      card that is not a caption ------------------------------------
  {
    name: "a bare hex colour replaces a design token",
    file: COMPONENT,
    from: 'const ACCENT = SLICE_COLOURS[0];',
    to: 'const ACCENT = "#4f46e5";',
    expect: "the design's own chart tokens, never a bare color",
  },
  {
    name: "the line chart loses its point markers, so \"σημεία\" is not actually drawn",
    file: COMPONENT,
    from: '          {shapes.line.map((p, i) => (\n            <circle key={i} data-testid="answer-chart-point" cx={p.x} cy={p.y} r={2.5} fill={ACCENT} />\n          ))}\n',
    to: "",
    expect: 'every line point gets a marker',
  },
  {
    name: "a second white button appears under the chart, on a page whose one is already spent",
    file: COMPONENT,
    from: '<p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{tc("cardTitle")}</p>',
    to: '<button className="bg-button text-[11px] font-semibold uppercase tracking-widest text-muted">{tc("cardTitle")}</button>',
    expect: "no second white button",
  },
  {
    name: "the card collapses into a caption on the figure, instead of its own element",
    file: COMPONENT,
    from: '<div data-testid="answer-chart-card" className="surface-tight mt-2">',
    to: '<div className="surface-tight mt-2">',
    expect: "the card is a SEPARATE element from the figure",
  },

  // ---- the wiring: strictly below MessageContent, never while live ----
  {
    name: "the chart is drawn above SourceCards instead of below it",
    file: WORKSPACE,
    from: '<SourceCards content={msg.content} />\n                      {/* A CHART + CARD UNDER THE ANSWER',
    to: '<AnswerChart content={msg.content} />\n                      <SourceCards content={msg.content} />\n                      {/* A CHART + CARD UNDER THE ANSWER',
    expect: "strictly after SourceCards",
  },

  // ---- nothing past the stop-gate --------------------------------------
  {
    name: "a «Κράτα το» save action appears under the chart, which is Κομμάτι 4's own piece",
    file: COMPONENT,
    from: "export function AnswerChart({ content }: { content: string }) {",
    to:
      "export function AnswerChart({ content }: { content: string }) {\n" +
      '  const saveAsSlide = () => fetch("/api/presentations/save", { method: "POST" });\n' +
      "  void saveAsSlide;",
    expect: "no «Κράτα το»",
  },
];

runMutations({
  name: "chat-chart",
  gate: GATE,
  targets: [CARRIER, ROUTE, WORKSPACE, COMPONENT, FLAGS],
  mutants: MUTANTS,
});
