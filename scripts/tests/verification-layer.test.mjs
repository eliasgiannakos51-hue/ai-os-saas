// THE SECOND PASS, AND WHETHER IT IS ACTUALLY IN THE PATH.
//
// The brief for this layer is "a second pass over critical outputs: HTML
// validity, broken links, citation format, invented numbers — quality
// that rises WITHOUT a better model". Three of those four already
// existed and were already wired; this file proves that (a module that
// exists and is never called is the failure this whole workstream is
// about) and adds the fourth.
//
// WHAT WAS MISSING, measured rather than assumed. Deep research gets the
// hard half right: sources come from Anthropic's own citation blocks, so
// the URLs are pages that were really read. Nothing checked the other
// half. Rendering a body that reads "the market grew 40% [2]. Analysts
// disagree [7]." with two sources produced a document containing [1],
// [2] and [7] — the [7] indistinguishable from the working markers and
// pointing at nothing.
//
// Run: node scripts/tests/verification-layer.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const v = await loadTs("src/lib/verification/citations.ts");
const render = await loadTs("src/lib/research/report-to-html.ts");

// =====================================================================
console.log("== 1. the check finds what the renderer would ship ==");
{
  const markdown = "The market grew 40% [2]. Analysts disagree [7].";
  const sources = [
    { title: "A", url: "https://example.com/a" },
    { title: "B", url: "https://example.com/b" },
  ];
  const r = v.checkCitations(markdown, sources.length);
  ok("the dangling marker is found", r.issues.some((i) => i.kind === "dangling" && i.marker === 7), JSON.stringify(r));
  ok("and the report is not ok", r.ok === false);
  // THE REGRESSION THIS EXISTS FOR: the renderer really does emit it.
  const html = render.researchReportToDocumentHtml({
    markdown, sources, disclosure: "AI-generated", sourcesHeading: "Sources",
  });
  ok("the un-annotated document really does contain the dead marker", /\[7\]/.test(html));
  const annotated = render.researchReportToDocumentHtml({
    markdown: v.annotateDanglingCitations(markdown, sources.length),
    sources, disclosure: "AI-generated", sourcesHeading: "Sources",
  });
  ok("annotated, the dead marker is flagged", /\[7\]⚠/.test(annotated), annotated.slice(0, 200));
  // ASSERTED ON THE ANNOTATED MARKDOWN, NOT THE DOCUMENT. The renderer
  // prints its own "[1] Title" bibliography, so a whole-document scan for
  // an unmarked [2] found the one in the source list and passed even when
  // every marker in the prose had been flagged.
  const annotatedProse = v.annotateDanglingCitations(markdown, sources.length);
  ok("the working marker is untouched in the prose", annotatedProse.includes("[2].") && !annotatedProse.includes("[2]⚠"),
    annotatedProse);
  ok("exactly one marker is flagged", (annotatedProse.match(/⚠/g) ?? []).length === 1, annotatedProse);
  // The bibliography numbering must not pick up the mark either.
  ok("the source list is not annotated", !/<li>\[\d+\]⚠/.test(annotated));
}

// =====================================================================
console.log("\n== 2. it does not cry wolf ==");
{
  ok("a fully cited report is ok", v.checkCitations("Claim [1]. Other [2].", 2).ok);
  ok("an unused source is not a failure", v.checkCitations("Only [1] used.", 2).ok);
  // A report ABOUT code contains [0] and [1] as array indices.
  const code = "Use the value:\n\n```js\nconst x = arr[0] + arr[1];\n```\n\nAs shown [1].";
  const r = v.checkCitations(code, 1);
  ok("array indices inside a fence are not citations", r.ok, JSON.stringify(r));
  ok("...and neither is [0]", !v.checkCitations("arr[0] is first [1].", 1).markers.includes(0));
  ok("inline code is stripped too", v.checkCitations("The `arr[3]` idiom, see [1].", 1).ok);
}

// =====================================================================
console.log("\n== 3. IT IS IN THE PATH — the part that gets skipped ==");
// A verification module nobody calls is the exact failure this workstream
// was written to end, so the wiring is asserted, not assumed.
{
  const runner = readFileSync("src/lib/research/run-research.ts", "utf8");
  ok("run-research imports the check", /from "@\/lib\/verification\/citations"/.test(runner));
  // ON THE TEXT THAT IS ACTUALLY RENDERED. This named synthesis.markdown
  // until the truncation notice arrived; the notice is part of the
  // finished document, so the citation check has to see the same string
  // the reader does, not the one before it was appended.
  ok("...and calls it on the text that will be rendered",
    /checkCitations\(reportMarkdown, sources\.length\)/.test(runner));
  ok("...which is the synthesis plus any truncation notice",
    /const reportMarkdown = synthesis\.truncated/.test(runner));
  ok("...before the document is rendered, not after",
    runner.indexOf("checkCitations(") < runner.indexOf("researchReportToDocumentHtml({"));
  ok("a failing check is logged, not swallowed", /stage: "citation_check"/.test(runner));
  ok("and the rendered markdown is the annotated one",
    /annotateDanglingCitations\(reportMarkdown, sources\.length\)/.test(runner));
}

// =====================================================================
console.log("\n== 4. the three that already existed are still wired ==");
// Cross-product over the generation AND edit paths, not one of them: an
// output is only verified if every route that produces it verifies it.
{
  const PATHS = [
    ["generate", "src/app/api/websites/generate/process/route.ts"],
    ["edit", "src/app/api/websites/edit/route.ts"],
  ];
  // ANCHORED ON THE CLOSING QUOTE. `/website-invented-numbers/` matched
  // `website-invented-numbers-disabled` too, so renaming the import to a
  // module that does not exist left this green — the same substring trap
  // that let a renamed Unsplash rule through earlier in this codebase.
  const CHECKS = [
    ["invented numbers", /["']@\/lib\/website-invented-numbers["']/],
    ["link safety", /["']@\/lib\/website-link-safety["']/],
    ["security scan", /["']@\/lib\/(website-html-security-scan|website-security-review)["']/],
  ];
  for (const [route, file] of PATHS) {
    const src = readFileSync(file, "utf8");
    for (const [name, re] of CHECKS) {
      ok(`${route}: ${name} runs`, re.test(src), file);
    }
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
