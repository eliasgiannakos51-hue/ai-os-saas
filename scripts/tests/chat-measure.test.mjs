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
// NEVER DOWN. Equal is allowed at the widest step, where the FONT grows
// instead (checked next): the line gets longer in pixels while the
// character count stays put, because at 61ch the English count is
// already at the brief's ceiling and one more ch would cross it.
check(
  "the caps never descend as the screen grows",
  caps.every((c, i) => i === 0 || c.ch >= caps[i - 1].ch),
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
// "0"; what a line holds depends on the letters in it and on the font
// size at that breakpoint, so the ratio is READ OFF THE PRODTEST, not
// derived.
//
// THE INSTRUMENT WAS WRONG AND SAID SO ONLY WHEN RE-MEASURED. This
// constant was 1.17, quoted from a 70ch/68ch measurement at an earlier
// font size. On 2026-09-03 the prodtest read 60 characters from a 58ch
// cap at 1440 and 63 from 60ch at 1920: 1.03-1.05. With 1.17 this check
// was passing 56/58/60ch as "66/68/70 characters" while the screen held
// 49/60/63 — a green line 10% off the truth in the direction that hides
// a too-short measure. The larger measured value is used so the ≤75
// half of the band is the conservative one.
//
// This is the check that would have caught the first draft, which wrote
// 66/68/70ch believing those were the character counts.
//
// TWO RATIOS, NOT ONE — the second time this instrument was wrong. The
// 1.05 above was measured on GREEK, and a 64/66ch cap passed here as
// "67/69 characters" while the prodtest read English at 77 and 80: Latin
// letters are narrower than Greek ones, so the same cap holds more of
// them, and the ≤75 half of the band is decided by ENGLISH. Measured on
// 2026-09-03 (16px @1440, 17px @1920): English 77/64 = 1.20 and 80/66 =
// 1.21 chars per ch; Greek 70/64 = 1.09 and 73/66 = 1.11. The wider
// script sets the floor, the narrower sets the ceiling, each with its
// own larger measured value so both halves are the conservative ones.
const CHARS_PER_CH = { en: 1.22, el: 1.11 };
// THE INSTRUMENT IS CALIBRATED AGAINST WHAT WAS MEASURED, not against
// itself: a ratio below the prodtest's reading would pass a cap the
// screen does not hold — which is exactly how 1.05 passed 64/66ch.
check(
  `the English ratio is at least the measured 1.20 (${CHARS_PER_CH.en}) and the Greek at least 1.09 (${CHARS_PER_CH.el})`,
  CHARS_PER_CH.en >= 1.2 && CHARS_PER_CH.el >= 1.09
);
for (const c of caps) {
  const en = Math.round(c.ch * CHARS_PER_CH.en);
  const el = Math.round(c.ch * CHARS_PER_CH.el);
  check(
    `@${c.at}px: ${c.ch}ch is ~${en} English / ~${el} Greek characters (English ≤75, Greek ≥60)`,
    en <= 75 && el >= 60,
    `English ${en}, Greek ${el} — outside the band; the cap is ${c.ch}ch, ratios ${JSON.stringify(CHARS_PER_CH)}`
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
