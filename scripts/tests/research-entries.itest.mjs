// THE WHOLE PIPELINE, END TO END, WITH THE MODEL STUBBED.
//
// V4.6. "Verification: research with sample data that cites BOTH web AND
// my own entries. And the [E] links open the right record."
//
// WHAT IS REAL HERE AND WHAT IS NOT, first, because the difference is the
// whole value of the file:
//
//   REAL — buildSynthesisInput, synthesisSystemPrompt, checkCitations,
//   annotateDanglingCitations, collateEntrySources and
//   researchReportToDocumentHtml. Every one is the shipped function,
//   called with the arguments run-research.ts calls it with.
//
//   STUBBED — the model. A real synthesis is a paid API call that
//   answers differently every run, so this supplies the markdown a model
//   would return and checks what the pipeline DOES with it.
//
//   NOT PROVEN — that the model actually cites entries when asked. That
//   is a fact about a model, it costs money to observe, and no stub can
//   establish it. What this file proves is that IF it cites them, the
//   citation survives the check, reaches the document, and points at the
//   right row; and that if it invents one, it is caught. Those are the
//   parts that are ours.
//
// Run: node scripts/tests/research-entries.itest.mjs
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const { buildSynthesisInput, synthesisSystemPrompt } = await loadTs("src/lib/research/research.ts");
const { collateEntrySources } = await loadTs("src/lib/research/entry-sources.ts");
const { checkCitations, annotateDanglingCitations } = await loadTs("src/lib/verification/citations.ts");
const { researchReportToDocumentHtml } = await loadTs("src/lib/research/report-to-html.ts");

// --- the fixture, shaped like the sample data ------------------------
const FINANCE_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const IDEAS_ID = "bbbbbbbb-2222-4222-8222-222222222222";

const SOURCES = [
  { url: "https://example.test/saas-pricing-2026", title: "SaaS pricing benchmarks 2026" },
  { url: "https://example.test/churn-study", title: "A churn study" },
];
const FINDINGS = [
  {
    question: "What are typical SaaS price points in 2026?",
    summary: "Median seat price sits near €29/month across the sampled vendors.",
    sources: SOURCES,
  },
];
const READS = [
  {
    slug: "finance",
    title: "Finance",
    shown: 2,
    omitted: 0,
    rows: [
      { id: FINANCE_ID, headline: "March subscription revenue €4,120", atMs: Date.UTC(2026, 2, 31) },
      { id: IDEAS_ID, headline: "Raise the starter tier to €39", atMs: Date.UTC(2026, 3, 2) },
    ],
  },
];
const entries = collateEntrySources(READS);
const accountSummary = "- Finance: 2 entries, most recent 2026-04-02\n- Nothing recorded yet in: Competitors";

// ---------------------------------------------------------------------
console.log("== 1. the prompt carries both lists, and says which is which ==");
const input = buildSynthesisInput({
  topic: "Should I raise my prices?",
  findings: FINDINGS,
  sources: SOURCES,
  entries,
  accountSummary,
});
check("the web sources are numbered [1..n]", input.includes("[1] SaaS pricing benchmarks 2026"), "");
check("the entries are numbered [E1..En]", input.includes("[E1] Finance (2026-03-31) — March subscription revenue"), "");
check("the account's flat shape is there", input.includes("Nothing recorded yet in: Competitors"), "");
// THE TWO LISTS ARE LABELLED, not just adjacent. A model handed two
// numbered lists with no heading between them merges them.
check(
  "the entry list says not to renumber into the web list",
  input.includes("cite these as [E1], [E2], ... NOT as [1], [2]"),
  ""
);
const system = synthesisSystemPrompt("en", entries.length);
check("the system prompt names the real ceiling", system.includes("[E1] to [E2]"), system.slice(0, 400));
check(
  "...and tells the model an entry is about the user, not the world",
  system.includes("your own finance entries show X [E3]") || system.includes("not about the world"),
  ""
);
// AND THE EMPTY CASE. No entries means no [E] instructions at all, so a
// report with none cannot be told about a list it does not have.
check(
  "with no entries, the system prompt says nothing about [E]",
  !synthesisSystemPrompt("en", 0).includes("[E1]"),
  ""
);

// ---------------------------------------------------------------------
console.log("\n== 2. a report citing BOTH kinds passes the check ==");
const GOOD = [
  "## What the market does",
  "Median seat price is near €29/month [1], and churn rises above €40 [2].",
  "",
  "## What your own numbers say",
  "Your March subscription revenue was €4,120 [E1], and you have already written down the idea of a €39 starter tier [E2].",
  "",
  "## What could not be established",
  "Nothing was found about your competitors' current pricing.",
].join("\n");
const good = checkCitations(GOOD, SOURCES.length, entries.length);
check(`the mixed report is ok (${good.markers.length} web, ${good.entryMarkers.length} entry)`, good.ok, JSON.stringify(good.issues));
check("both web markers were seen", JSON.stringify(good.markers) === JSON.stringify([1, 2]), JSON.stringify(good.markers));
check("both entry markers were seen", JSON.stringify(good.entryMarkers) === JSON.stringify([1, 2]), JSON.stringify(good.entryMarkers));
check(
  "the annotator leaves every marker in a good report untouched",
  annotateDanglingCitations(GOOD, SOURCES.length, entries.length) === GOOD,
  ""
);

// ---------------------------------------------------------------------
console.log("\n== 3. a report inventing an entry is caught, and marked ==");
const BAD = GOOD.replace("[E2]", "[E9]");
const bad = checkCitations(BAD, SOURCES.length, entries.length);
check("the invented [E9] fails the check", !bad.ok, JSON.stringify(bad.issues));
check(
  "...and is named as an ENTRY problem, not a web one",
  bad.issues.some((i) => i.kind === "dangling" && i.namespace === "entry" && i.marker === 9),
  JSON.stringify(bad.issues)
);
const annotated = annotateDanglingCitations(BAD, SOURCES.length, entries.length);
check("the invented marker is marked in the prose", annotated.includes("[E9]⚠"), "");
check("the VALID [E1] beside it is not", annotated.includes("[E1] ") || annotated.includes("[E1],"), annotated);
check("...and neither is a valid [1]", !annotated.includes("[1]⚠"), annotated);

// ---------------------------------------------------------------------
console.log("\n== 4. the document links the entry to its record ==");
const html = researchReportToDocumentHtml({
  markdown: GOOD,
  sources: SOURCES,
  entries,
  disclosure: "Written with AI.",
  sourcesHeading: "Sources",
  entriesHeading: "Your entries",
});
check("the web bibliography is rendered", html.includes("[1] <a href=\"https://example.test/saas-pricing-2026\""), "");
check("the entry bibliography is rendered separately", html.includes("<h2>Your entries</h2>"), "");
// THE POINT OF THE WHOLE EXERCISE: the marker resolves to the ROW.
check(
  "[E1] links to the exact record, not the module list",
  html.includes(`<li>[E1] <a href="/dashboard/finance?record=${FINANCE_ID}">`),
  html.slice(html.indexOf("Your entries"), html.indexOf("Your entries") + 300)
);
check(
  "[E2] links to its own record",
  html.includes(`href="/dashboard/finance?record=${IDEAS_ID}"`),
  ""
);
// INTERNAL LINKS DO NOT OPEN A NEW TAB. They go to the page next door.
check(
  "the entry links stay in the app",
  !html.slice(html.indexOf("Your entries"), html.indexOf("<h2>Sources")).includes("target=\"_blank\""),
  ""
);
check(
  "the web links DO open a new tab",
  html.slice(html.indexOf("<h2>Sources")).includes('target="_blank"'),
  ""
);
// AND THE EMPTY CASE, which is most reports: no entries, no section.
const noEntries = researchReportToDocumentHtml({
  markdown: "## X\nA claim [1].",
  sources: SOURCES,
  disclosure: "Written with AI.",
  sourcesHeading: "Sources",
});
check("a report with no entries has no entry section at all", !noEntries.includes("Your entries"), "");

// ---------------------------------------------------------------------
console.log("\n== 5. the address the [E] link uses is one something reads ==");
// NOT ASSERTED AGAIN HERE — PROVED ELSEWHERE, and named so the chain is
// followable. scripts/tests/deep-links.test.mjs walks the import graph
// from the page /dashboard/<module> resolves to and requires a reader
// for `?record=`. Without that, every link above would be a citation
// that renders, looks right, and lands on a list — which is the failure
// this whole citation scheme exists to avoid.
import { readFileSync } from "node:fs";
const deepLinks = readFileSync("scripts/tests/deep-links.test.mjs", "utf8");
check(
  "deep-links.test.mjs defends ?record= by name",
  deepLinks.includes('readsParamAt("/dashboard/finance", "record")'),
  "the gate that keeps this link working no longer names it"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
