#!/usr/bin/env node
/*
 * HOW MUCH OF AN "ARTIFACT PANEL" IS ALREADY THERE?
 *
 * Run: node scripts/artifact-census.mjs
 *
 * An artifact panel, as the word is used for Claude's, is four things
 * at once: you type in a box, the RESULT stands beside it rather than
 * under it, you change it by saying what to change, and you can take it
 * away. Any one of those on its own is not it.
 *
 * So the question "do we already have artifacts?" is four questions per
 * feature, and the honest answer is a table with holes in it rather
 * than a yes or a no. Each column is read from the component that draws
 * the screen and the routes that serve it — never from a list here.
 *
 * WHAT IT CANNOT SEE: whether the thing looks good, whether the preview
 * updates without a reload, whether the two panes are usable at 390px.
 * Those need a browser. This says which of the four parts EXIST.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The drawn Make rows, with the component that draws each one. The
// sidebar's own census (scripts/sidebar-census.mjs --rows) is where the
// list of rows comes from; the component is the one file each page
// renders.
const ROWS = [
  { name: "Website Builder", file: "src/components/website-builder/website-builder-workspace.tsx", editRoute: "src/app/api/websites/edit/route.ts" },
  { name: "Presentations", file: "src/components/presentations/presentations-workspace.tsx", editRoute: "src/app/api/presentations/[id]/edit/route.ts" },
  { name: "Posts", file: "src/components/posts/posts-workspace.tsx", editRoute: null },
  { name: "AI Coding", file: "src/components/coding/coding-workspace.tsx", editRoute: null },
  { name: "Documents", file: "src/components/documents/document-editor.tsx", editRoute: null },
  { name: "Data Analysis", file: "src/components/data-analysis/analysis-workspace.tsx", editRoute: null },
];

// 1. A PROMPT BOX. The thing you type into.
const hasPrompt = (src) => /<textarea/.test(src) || /type="text"/.test(src);

// 2. THE RESULT RENDERED, not merely stored. An iframe with srcDoc, a
//    list of slides, a list of posts, a code block — something that
//    paints what came back.
const RENDERS = [
  [/srcDoc=/, "iframe srcDoc"],
  [/slides?\.map\(/, "slides"],
  [/posts\.map\(/, "posts"],
  [/<CodeBlock/, "code block"],
  [/dangerouslySetInnerHTML/, "html"],
  [/<AnalysisChart/, "chart"],
  [/contentEditable/, "editable text"],
];

// 3. BESIDE IT, not under it. A two-column grid or a flex row that the
//    result sits in. Measured as "does the file contain a side-by-side
//    container at all" — a weak signal, and it is printed as one.
const sideBySide = (src) =>
  /(grid-cols-2|lg:grid-cols-2|md:grid-cols-2|lg:flex-row|xl:grid-cols-2)/.test(src);

// 4. CHANGE IT BY SAYING SO. A second prompt box whose route edits what
//    already exists — the half that makes it an artifact rather than a
//    result.
const changeInWords = (row, src) => {
  if (row.editRoute && existsSync(row.editRoute)) return `route ${row.editRoute.replace("src/app/api/", "").replace("/route.ts", "")}`;
  // Some screens edit in place instead of by instruction, which is a
  // different thing and named differently.
  if (/contentEditable/.test(src)) return "in place, not by words";
  return null;
};

// 5. TAKE IT AWAY.
const takeAway = (src) => /download|\.pptx|\.pdf|publish/i.test(src);

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("feature", 18) + pad("prompt", 8) + pad("renders", 16) + pad("beside", 8) + pad("change in words", 34) + "take away");
console.log("-".repeat(18 + 8 + 16 + 8 + 34 + 10));

let score = { prompt: 0, renders: 0, beside: 0, change: 0, away: 0 };
for (const row of ROWS) {
  if (!existsSync(row.file)) {
    console.log(pad(row.name, 18) + "— component not found: " + row.file);
    continue;
  }
  const src = strip(readFileSync(row.file, "utf8"));
  const rendered = RENDERS.filter(([re]) => re.test(src)).map(([, label]) => label);
  const change = changeInWords(row, src);
  const beside = sideBySide(src);
  const away = takeAway(src);
  if (hasPrompt(src)) score.prompt++;
  if (rendered.length) score.renders++;
  if (beside) score.beside++;
  if (change && !change.startsWith("in place")) score.change++;
  if (away) score.away++;
  console.log(
    pad(row.name, 18) +
      pad(hasPrompt(src) ? "yes" : "NO", 8) +
      pad(rendered.join("+") || "NO", 16) +
      pad(beside ? "yes" : "no", 8) +
      pad(change ?? "NO", 34) +
      (away ? "yes" : "no")
  );
}

console.log(
  `\n  of ${ROWS.length} drawn Make rows:\n` +
  `    a prompt box          ${score.prompt}\n` +
  `    the result rendered   ${score.renders}\n` +
  `    laid out side by side ${score.beside}   (weak signal — a two-column container exists in the file)\n` +
  `    changed by saying so  ${score.change}\n` +
  `    downloadable          ${score.away}`
);
console.log(
  "\nALL FOUR AT ONCE is what the word 'artifact' means, and the count\n" +
  "that matters is the one above the line, not any single column."
);
