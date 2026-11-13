#!/usr/bin/env node
/*
 * A CHART (AND A CARD) INSIDE A CHAT ANSWER — the owner's «30. CHAT:
 * ΓΡΑΦΗΜΑΤΑ, ΔΙΑΓΡΑΜΜΑΤΑ ΚΑΙ ΚΑΡΤΕΣ ΜΕΣΑ ΣΤΗΝ ΑΠΑΝΤΗΣΗ», 2026-10-31,
 * Κομμάτι 1 ONLY: «Γράφημα μέσα στην απάντηση: γραμμή, στήλες, σημεία, με
 * τα χρώματα του ΣΥΣΤΗΜΑΤΟΣ DESIGN. Οι αριθμοί υπολογίζονται με κώδικα,
 * ποτέ από το μοντέλο. ΜΟΝΟ ΕΔΩ: στιγμιότυπο ενός γραφήματος και μιας
 * κάρτας, και σταματάς μέχρι να γράψω «εγκρίνω».»
 *
 * Run: node scripts/tests/chat-chart.test.mjs
 *
 * Six things are held here:
 *
 *   1  the carrier (lib/chat/answer-chart.ts): a SlideChart round-trips
 *      through the stored text, and anything malformed is rejected rather
 *      than drawn
 *   2  the RENDERING, by the same react-markdown the chat uses: the
 *      carrier's reference definition never reaches the screen — exactly
 *      web-sources.test.mjs's own proof, on the mechanism it actually
 *      uses (`[n]: <url> "title"`). A first version of this file carried
 *      the chart as an HTML comment instead and asserted the same thing
 *      without rendering it; this section's own render check caught that
 *      react-markdown, with no rehype-raw, ESCAPES raw HTML to visible
 *      text rather than dropping it — the opposite of what was assumed.
 *   3  the switch: declared, and the route reads it before trusting a
 *      "data" attachment
 *   4  the wiring (comments stripped): the route computes the chart AFTER
 *      the model has answered, from the attached row, never from the
 *      model's own words, and the client draws it under the answer
 *   5  the component: the design's own chart tokens, no second white
 *      button on a page whose one is already spent, strictly below
 *      MessageContent (chat-measure.test.mjs's own rule)
 *   6  nothing past the stop-gate: no diagram (Κομμάτι 2), no card
 *      taxonomy beyond the one "how it was computed" card (Κομμάτι 3), no
 *      «Κράτα το» save action (Κομμάτι 4)
 */
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};
const code = (p) => readFileSync(p, "utf8");

const { attachAnswerChart, parseAnswerChart } = await loadTs("src/lib/chat/answer-chart.ts");

const chart = {
  kind: "bar",
  title: "Έσοδα ανά Περιοχή",
  points: [
    { label: "Αθήνα", value: 1200 },
    { label: 'Θεσσαλονίκη "quoted"', value: 800 }, // a quote mark would end a title early if this carried raw text
  ],
  gathered: false,
  source: { dataId: "11111111-1111-1111-1111-111111111111", file: "πωλήσεις.xlsx", x: "Περιοχή", y: "Έσοδα", aggregation: "sum", rows: 42 },
};

console.log("== 1. the carrier ==");
check("an answer with no chart is left exactly as it streamed", attachAnswerChart("Απλή απάντηση.", null) === "Απλή απάντηση.");
const withChart = attachAnswerChart("Ιδού τα έσοδα.", chart);
check("the chart is appended, not mixed into the prose", withChart.startsWith("Ιδού τα έσοδα.") && withChart.includes('[ionexa-chart]: <> "'));
check('a label containing a quote mark survives round-trip intact, never breaking the carrier\'s own closing "', withChart.includes('Θεσσαλονίκη "quoted"') === false, "the raw label must NOT appear in plain text — only inside the base64 payload");
const back = parseAnswerChart(withChart);
check("what is stored parses back to the same chart", JSON.stringify(back) === JSON.stringify(chart), JSON.stringify(back));
check("an answer without a carrier has no chart", parseAnswerChart("Απλή απάντηση χωρίς γράφημα.") === null);
check("a hand-edited, malformed payload is rejected, never thrown", parseAnswerChart('x\n\n[ionexa-chart]: <> "bm90anNvbg=="\n') === null);
check("a well-formed payload of the wrong shape is rejected", (() => {
  const encoded = Buffer.from(JSON.stringify({ kind: "pie" }), "utf8").toString("base64");
  return parseAnswerChart(`x\n\n[ionexa-chart]: <> "${encoded}"\n`) === null;
})());
check("a chart with no points is rejected — a chart of nothing is not a chart", (() => {
  const empty = { ...chart, points: [] };
  const encoded = Buffer.from(JSON.stringify(empty), "utf8").toString("base64");
  return parseAnswerChart(`x\n\n[ionexa-chart]: <> "${encoded}"\n`) === null;
})());
check("an unknown chart kind is rejected", (() => {
  const bad = { ...chart, kind: "scatter" };
  const encoded = Buffer.from(JSON.stringify(bad), "utf8").toString("base64");
  return parseAnswerChart(`x\n\n[ionexa-chart]: <> "${encoded}"\n`) === null;
})());

console.log("\n== 2. what react-markdown makes of it ==");
const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, withChart));
check("the carrier's reference definition never reaches the screen — removed from the document entirely, not merely hidden", !html.includes("ionexa-chart") && !html.includes("["), html);
check("the visible prose is still there", html.includes("Ιδού τα έσοδα."));

console.log("\n== 3. the switch ==");
const flags = code("src/lib/flags/flags.ts");
check('"chat-charts" is declared as a switch', /\n  "chat-charts": "/.test(flags));
const route = stripComments(code("src/app/api/chat/route.ts"));
check("the route reads it", /const chatChartsOn = await isFeatureOn\("chat-charts", user\);/.test(route));
check("...and a \"data\" attachment is refused with the switch off", /!chatChartsOn && readAttachments\.list\.some\(\(a\) => a\.kind === "data"\)/.test(route));

console.log("\n== 4. the wiring (comments stripped) ==");
check("the chart is computed AFTER the model has already answered — after attachWebSources, not before the tool-round loop reads lastRoundBlocks",
  route.indexOf("const sourced = attachWebSources(assistantText, lastRoundBlocks);") < route.indexOf("deckChartsFrom("));
check("...from the ATTACHED row, scoped to the caller", /\.from\("data_analyses"\)\s*\.select\("id, file_name, title, headers, rows, profile"\)\s*\.eq\("id", dataAttachment\.dataId\)\s*\.eq\("user_id", user\.id\)/.test(route));
check("...never from anything the model wrote: the model's own text plays no part in which chart is picked",
  !/assistantText[\s\S]{0,80}chart\s*=/.test(route) && /chart = charts\[0\] \?\? null;/.test(route));
check("the final text folds the chart into what gets stored", /const finalText = attachAnswerChart\(sourced\.text, chart\);/.test(route));
check("...STORES it, so a reload shows the same chart", /role: "assistant",\s*content: finalText,/.test(route));
check("...and sends it at the end of the stream when it differs from what streamed", /content: finalText !== assistantText \? finalText : undefined,/.test(route));
const client = stripComments(code("src/components/chat/chat-workspace.tsx"));
check("the thread draws the chart under every persisted answer", /<AnswerChart content=\{msg\.content\} \/>/.test(client));
check("...strictly after SourceCards, which is strictly after MessageContent — never wrapping or preceding either",
  client.indexOf("<MessageContent content={msg.content}") < client.indexOf("<SourceCards content={msg.content} />") &&
  client.indexOf("<SourceCards content={msg.content} />") < client.indexOf("<AnswerChart content={msg.content} />"));
check("...never in the live-streaming branch, which has no stored content to read a chart from",
  !/accumulatedText[\s\S]{0,400}<AnswerChart/.test(client));

console.log("\n== 5. the component ==");
const answerChart = stripComments(code("src/components/chat/answer-chart.tsx"));
check("renders nothing without a chart", /if \(!chart\) return null;/.test(answerChart));
check("the design's own chart tokens, never a bare color", /rgb\(var\(--chart-1\)\)/.test(answerChart) && !/#[0-9a-fA-F]{3,6}(?!\))/.test(answerChart));
check("every line point gets a marker — the directive's own \"σημεία\"", /<circle[\s\S]{0,80}data-testid="answer-chart-point"/.test(answerChart));
check("no second white button: this page's one is already spent on send (one-primary-action.test.mjs)", !/bg-button/.test(answerChart));
check("the card is a SEPARATE element from the figure, not a caption on it", /data-testid="answer-chart-figure"/.test(answerChart) && /data-testid="answer-chart-card"/.test(answerChart));
check("the card reuses presentations.chart's own already-translated sentence, rather than a duplicate key", /useTranslations\("presentations\.chart"\)/.test(answerChart) && /t\("source",/.test(answerChart));

console.log("\n== 6. nothing past the stop-gate ==");
// Κομμάτι 2 (διάγραμμα: ροή/χρονολόγιο/οργανόγραμμα), Κομμάτι 3 (κάρτες:
// σύγκριση/βήματα/συνταγή/χάρτης/καιρός/κουίζ) and Κομμάτι 4 («Κράτα το»)
// are all still to come — until «εγκρίνω», Κομμάτι 1 draws one chart and
// one explanatory card, nothing more.
check("no «Κράτα το» / save-as-Slide action exists on the answer yet", !/Κράτα το|saveAs(Slide|Document|Sheet)/i.test(answerChart));
check("no second card type (comparison/steps/recipe/map/weather/quiz) is wired into chat yet",
  !/comparison|recipe|quiz|weather|orgchart|timeline-diagram|flowchart/i.test(answerChart));
// A directory scan, not a hand-named path: gate-import-paths.test.mjs
// asserts every repository path WRITTEN into a gate exists, so naming
// one that must NOT exist yet would itself be a broken claim.
const chatComponents = readdirSync("src/components/chat");
check("no diagram component exists for chat yet", !chatComponents.some((f) => /diagram|flowchart|timeline|orgchart/i.test(f)), chatComponents.join(", "));

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length === 0 ? 0 : 1;
