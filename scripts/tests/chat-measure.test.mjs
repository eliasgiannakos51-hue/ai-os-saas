// THE CHAT MEASURE, AS A RULE RATHER THAN AS A RENDERING.
//
// V4.6 #12. scripts/tests/chat-measure.prodtest.mjs is the evidence: a
// real build, five widths, three languages, characters counted from Range
// rects and contrast read off screenshot pixels. It costs a `next build`
// plus fifteen page loads, which is the right price for evidence and the
// wrong price for a mutation suite — thirty minutes per mutation is not a
// gate anybody runs.
//
// So the parts of the rule that are STATIC live here, where breaking them
// costs a second: the class exists, it is capped at every breakpoint, the
// caps ascend, the font ascends with them, and the numbers in the comment
// are the numbers in the code.
//
// WHAT THIS FILE CANNOT SAY, stated so nobody reads a green run as more
// than it is: it cannot tell you how many characters a line holds. That
// is a fact about a font in a browser and only the prodtest measures it.
// What it can say is that the cap is still there and still ordered, which
// is the failure mode a refactor actually produces.
//
// Run: node scripts/tests/chat-measure.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const css = readFileSync("src/app/globals.css", "utf8");

// COMMENTS ARE NOT CODE. This file is largely about a class whose own
// comment quotes every number it declares, so a scan that reads the
// comment finds the rule whether or not the rule is there.
function stripCss(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}
const code = stripCss(css);

// ---------------------------------------------------------------------
console.log("== 0. the stripper, on a sample it must get right ==");
check(
  "a declaration inside a comment is not a declaration",
  !/max-width:\s*99ch/.test(stripCss("/* max-width: 99ch; */\n.x { color: red; }"))
);
check(
  "...and a real one still is",
  /max-width:\s*99ch/.test(stripCss(".x { max-width: 99ch; }"))
);
// THE SAME PROPERTY FOR THE TSX, because section 4 got this wrong once.
check(
  "a class named in a // comment is not a class",
  !/text-foreground\/90/.test(stripComments("// text-foreground/90 is gone\nconst x = 1;"))
);
check(
  "...and one in the markup still is",
  /text-foreground\/90/.test(stripComments('<div className="text-foreground/90" />'))
);

// ---------------------------------------------------------------------
console.log("\n== 1. the class exists and is the shared one ==");
const blocks = [...code.matchAll(/\.chat-measure\s*\{([^}]*)\}/g)].map((m) => m[1]);
check(
  `.chat-measure is declared (${blocks.length} blocks: base + breakpoints)`,
  blocks.length >= 4,
  `${blocks.length} — the base rule plus one per breakpoint is four`
);
check(
  "the base rule takes the full width",
  /width:\s*100%/.test(blocks[0] ?? ""),
  blocks[0]
);
check(
  "...and centres itself",
  /margin-inline:\s*auto/.test(blocks[0] ?? ""),
  blocks[0]
);
// THE COMPOSER AND THE THREAD SHARE IT. They were both `max-w-2xl` and
// lined up by coincidence; the moment the thread's cap became a character
// count they would have drifted at every breakpoint.
// STRIPPED, and this file needed telling twice. Section 0 proves the CSS
// stripper on a sample and then section 4 read chat-workspace.tsx RAW —
// so "the assistant's text is at full foreground, not dimmed" went red
// against the sentence `text-foreground/90 is gone`, which is the
// paragraph explaining that it is gone. A gate that is about comments
// not being code, failing because it read a comment as code.
const workspace = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
const uses = (workspace.match(/className="chat-measure/g) ?? []).length;
check(
  `the thread and the composer both use it (${uses} uses)`,
  uses >= 2,
  `${uses} — one of the two is on a different rule again`
);

// ---------------------------------------------------------------------
console.log("\n== 2. every breakpoint caps, and the caps ascend ==");
// A cap that goes DOWN as the screen grows is the bug this ordering
// check exists for: it reads as "more room, shorter line", which is the
// opposite of the brief and is exactly what a careless edit produces.
const caps = [...code.matchAll(/@media\s*\(min-width:\s*(\d+)px\)\s*\{\s*\.chat-measure\s*\{([^}]*)\}/g)].map(
  (m) => ({
    at: Number(m[1]),
    ch: Number((m[2].match(/max-width:\s*([\d.]+)ch/) ?? [])[1] ?? NaN),
    px: Number((m[2].match(/font-size:\s*([\d.]+)px/) ?? [])[1] ?? NaN),
  })
);
console.log(`        ${caps.map((c) => `@${c.at}: ${c.ch}ch${Number.isNaN(c.px) ? "" : ` / ${c.px}px`}`).join("  ")}`);
check(
  `there are breakpoint caps to check (${caps.length})`,
  caps.length >= 3,
  `${caps.length} — an ordering check over fewer than three points proves nothing`
);
check(
  "every breakpoint declares a character cap",
  caps.every((c) => Number.isFinite(c.ch)),
  caps.map((c) => `@${c.at}: ${c.ch}`).join(", ")
);
check(
  "the caps ascend with the screen",
  caps.every((c, i) => i === 0 || c.ch > caps[i - 1].ch),
  caps.map((c) => `@${c.at}: ${c.ch}ch`).join(" -> ")
);
// THE FONT ASCENDS TOO, which is the whole mechanism: the line gets
// physically longer without holding more characters.
const withFont = caps.filter((c) => Number.isFinite(c.px));
check(
  `the font grows at the wider breakpoints (${withFont.length} of ${caps.length} set one)`,
  withFont.length >= 2 && withFont.every((c, i) => i === 0 || c.px > withFont[i - 1].px),
  withFont.map((c) => `@${c.at}: ${c.px}px`).join(" -> ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the caps are inside the band the brief asked for ==");
// 60-75 CHARACTERS, THROUGH THE MEASURED RATIO. `ch` is the advance of
// "0" and a digit is one of the widest glyphs in a proportional font, so
// a ch cap holds MORE characters than its number. Measured on a real
// build with Greek text: a 70ch cap held 82 characters and a 68ch cap
// held 80 — 1.17 characters per ch, stable across both.
//
// This is the check that would have caught the first draft, which wrote
// 66/68/70ch believing those were the character counts and measured
// 77/80/82 on screen.
const CHARS_PER_CH = 1.17;
for (const c of caps) {
  const chars = Math.round(c.ch * CHARS_PER_CH);
  check(
    `@${c.at}px: ${c.ch}ch is ${chars} characters (60-75)`,
    chars >= 60 && chars <= 75,
    `${chars} — outside the band; the cap is ${c.ch}ch and the measured ratio is ${CHARS_PER_CH}`
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. the answer has no card, and the person keeps a ground ==");
// READ FROM THE SOURCE, and asserted as an absence of the classes that
// draw a card rather than as a presence of anything. The prodtest checks
// the computed style; this checks that nobody put the classes back.
// THE WRAPPER THAT ACTUALLY HOLDS THE ANSWER, found by walking back from
// <MessageContent> to the <div> that opens immediately before it. An
// earlier version of this check anchored on a JSX comment — which
// stripComments had already deleted — so it tested an empty string
// against a regex and could not go red whatever the markup said.
const answerWrapper = (() => {
  const at = workspace.indexOf("<MessageContent content={msg.content}");
  if (at < 0) return null;
  const before = workspace.slice(0, at);
  const open = before.lastIndexOf("<div");
  return open < 0 ? null : before.slice(open, at).trim();
})();
console.log(`        answer wrapper: ${answerWrapper ?? "NOT FOUND"}`);
check(
  "the element wrapping the answer was found",
  Boolean(answerWrapper),
  "no <div> opens before <MessageContent content={msg.content}> — the check below has nothing to read"
);
check(
  "the assistant's text is not wrapped in a card",
  Boolean(answerWrapper) && !/bg-panel|rounded-2xl|border\b/.test(answerWrapper),
  answerWrapper ?? ""
);
check(
  "the assistant's text is at full foreground, not dimmed",
  !/text-foreground\/9\d/.test(workspace),
  "text-foreground/90 is dimmed text — the brief says dim the globe, never the text"
);
check(
  "the person's turn keeps a ground and an accent edge",
  /border-orange-500\/30 bg-panel/.test(workspace),
  "the user's message lost its background, so a question and an answer look the same"
);
check(
  "...and it is no longer a filled accent slab",
  !/bg-orange-500 px-4 py-2\.5 text-sm text-black/.test(workspace),
  "the filled orange bubble is back"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
