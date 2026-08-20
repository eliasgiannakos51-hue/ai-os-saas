// THE WAITING STATE BELONGS TO US.
//
// Three bouncing dots is what ChatGPT, Claude, Gemini and every wrapper
// around them use. It is a fine signal and it belongs to nobody: a user
// who sees it learns nothing about which product they are in. This app
// already has an identity running behind every page — NetworkField, a
// constellation of nodes joined by faint lines, orange with every fourth
// one purple — and the waiting state is now that, at fourteen pixels.
//
// WHAT THIS FILE ENFORCES, and why each part needs enforcing:
//
//   · NO SITE GOES BACK. Bouncing dots and spin-while-thinking are cheap
//     to reach for; the next person adding an AI screen will copy
//     whatever the screen next to it does. This fails if any of the six
//     reverts.
//   · IT ACCOMPANIES TEXT. Every one of these places already knows what
//     it is doing, because ai_jobs.step_label says so. An indicator that
//     sits WHERE the sentence should be is a downgrade.
//   · REDUCED MOTION STILL SAYS "WORKING". Stopping the animation is
//     easy; stopping it on a frame that still reads as work in progress
//     is the part that gets skipped.
//   · THE COLOURS WERE MEASURED. Contrast numbers in the CSS comments
//     are from a screenshot run, and the values they justify have to
//     still be the values in the file.
//
// Run: node scripts/tests/thinking-indicator.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 10).join("\n        "));
}

const component = readFileSync("src/components/ui/thinking-indicator.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const componentCode = stripComments(component);
// The CSS block only, so a rule elsewhere in a 1,000-line file cannot
// satisfy a check about this component.
// BOUNDED AT BOTH ENDS. This used to slice to the end of the file, which
// made the byte ratchet below a budget on "the ThinkingIndicator's CSS
// plus whatever anyone appends to globals.css after it" — a mobile
// font-size rule for form inputs, added at the bottom of the file for
// reasons that have nothing to do with this component, put the ratchet
// 156 bytes over and read as this component having grown. A ratchet that
// can be tripped by an unrelated edit gets its number raised without
// anyone reading it, which is the one thing a ratchet must not invite.
const cssBlockStart = css.indexOf("ThinkingIndicator — the constellation");
const cssBlockEnd = css.indexOf("/* END ThinkingIndicator */", cssBlockStart);
const cssBlock = css.slice(cssBlockStart, cssBlockEnd === -1 ? undefined : cssBlockEnd);

// The six places the app waits on a model. Five were named in the brief;
// records/ask-ai-modal is the sixth, found by grepping for the dots
// rather than by trusting the list — leaving it behind would have made
// it the one screen still speaking the old language.
const SITES = [
  ["chat", "src/components/chat/chat-workspace.tsx"],
  ["ask-my-records", "src/components/records/ask-ai-modal.tsx"],
  ["files", "src/components/files/files-workspace.tsx"],
  ["create studio", "src/components/create/create-studio.tsx"],
  ["website builder", "src/components/website-builder/website-builder-workspace.tsx"],
  ["deep research", "src/components/research/research-workspace.tsx"],
];

console.log("== 1. every waiting surface uses it ==");
// DIRECTLY, OR THROUGH AiActivity — and the difference is not a loophole.
//
// components/ui/ai-activity.tsx is the surface that pairs the motion with
// the WORDS ("Looking for the information…", step 2 of 4) from
// lib/jobs/ai-steps.ts, announced through role="status" aria-live="polite".
// Chat and Ask-my-records render that instead of a bare indicator, so a
// screen reader hears which step is running rather than nothing at all.
// Requiring a literal <ThinkingIndicator> in those two files would push
// them back to motion with no words.
//
// So the indirection is allowed exactly one level deep, and the wrapper is
// pinned below: if AiActivity ever loses the indicator — goes back to the
// `animate-spin` circle it shipped with — both surfaces fail here, which
// is the property this section is actually about.
const aiActivity = stripComments(readFileSync("src/components/ui/ai-activity.tsx", "utf8"));
check(
  "AiActivity, which two of the six render instead, is itself the indicator",
  /<ThinkingIndicator/.test(aiActivity) && !/animate-spin/.test(aiActivity)
);
for (const [name, file] of SITES) {
  const src = stripComments(readFileSync(file, "utf8"));
  const direct = /<ThinkingIndicator/.test(src);
  const viaActivity = /<AiActivity/.test(src);
  check(`${name} renders the indicator`, direct || viaActivity, file);
  check(
    `${name} imports it`,
    direct
      ? /from "@\/components\/ui\/thinking-indicator"/.test(src)
      : /from "@\/components\/ui\/ai-activity"/.test(src),
    file
  );
}

console.log("\n== 2. and nothing anywhere bounces ==");
// Repository-wide, not just the six: the point is that the pattern is
// gone, not that six files were edited.
function tsxFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) tsxFiles(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const allTsx = tsxFiles("src");
checkList(
  "no component uses animate-bounce",
  allTsx.filter((f) => /animate-bounce/.test(stripComments(readFileSync(f, "utf8"))))
);
// A blinking block after streamed text is the third cliché, alongside
// dots and spinners.
checkList(
  "and none fakes a typing cursor",
  allTsx.filter((f) => /animate-pulse[^"]*\bw-\[?[12]\b|caret-blink|typing-cursor/.test(readFileSync(f, "utf8")))
);
// animate-spin is still fine on an upload or a delete — those are not
// the model thinking. What must not come back is a spinner in the six
// places the indicator now owns.
const SPIN_AT_THINKING = [
  ["chat", "src/components/chat/chat-workspace.tsx", /TypingDots[\s\S]{0,300}?animate-spin/],
  ["ask-my-records", "src/components/records/ask-ai-modal.tsx", /TypingDots[\s\S]{0,300}?animate-spin/],
  ["files ask button", "src/components/files/files-workspace.tsx", /asking \? \(\s*<Loader2/],
  ["research planning", "src/components/research/research-workspace.tsx", /planning \? \([\s\S]{0,120}?<Loader2/],
];
checkList(
  "no thinking state fell back to a spinner",
  SPIN_AT_THINKING.filter(([, f, re]) => re.test(stripComments(readFileSync(f, "utf8")))).map(([n]) => n)
);

console.log("\n== 3. it sits beside the words, never instead of them ==");
// Files: the button shows the live step label from ai_jobs.step_label.
const files = stripComments(readFileSync("src/components/files/files-workspace.tsx", "utf8"));
check("files still renders its step label", /askStepLabel/.test(files));
check("with the indicator beside it, not replacing it", /<ThinkingIndicator[\s\S]{0,400}askStepLabel/.test(files));
// Website Builder: the rotating progress sentence survives.
const wb = stripComments(readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8"));
check("website builder keeps its progress sentence", /PROGRESS_MESSAGE_KEYS\[progressMessageIndex\]/.test(wb));
check("and the indicator is above it", wb.indexOf("<ThinkingIndicator") < wb.indexOf("PROGRESS_MESSAGE_KEYS[progressMessageIndex]"));
// Create Studio: each step keeps its own label.
const cs = stripComments(readFileSync("src/components/create/create-studio.tsx", "utf8"));
check("create studio keeps its per-step label", /t\(`progress\.\$\{step\.labelKey\}`\)/.test(cs));
// Research: the button still says what it is doing.
const rs = stripComments(readFileSync("src/components/research/research-workspace.tsx", "utf8"));
check("research keeps its planning label", /<ThinkingIndicator[\s\S]{0,120}t\("planning"\)/.test(rs));

console.log("\n== 4. the drawing is the brand, not a shape ==");
check("three nodes and three edges at md", (componentCode.match(/className="node/g) ?? []).length >= 5);
check("one of them is the purple that NetworkField uses", /node n2 alt/.test(componentCode));
check("and the purple is #a855f7, the same hex", /#a855f7/.test(cssBlock));
check("the orange is #f97316, the same hex", /#f97316/.test(cssBlock));
// pathLength="1" is what makes dasharray independent of geometry.
check("edges declare pathLength so the maths survives a moved node", /pathLength="1"/.test(componentCode));
// The stagger ties it to the background field.
check("the 0.37s stagger matches NetworkField", /animation-delay: 0\.37s/.test(cssBlock));
const field = readFileSync("src/components/ui/network-field.tsx", "utf8");
check("and NetworkField really uses 0.37", /i \* 0\.37/.test(field));
// The nodes became gradient-filled elements when the filter-free rewrite
// landed (the colour is now an "r, g, b" component string) — the property
// under test is unchanged: every fourth node draws in the purple.
check(
  "and really makes every fourth node purple",
  /i % 4 === 0 \? ("#a855f7"|"168, 85, 247")/.test(field)
);

console.log("\n== 5. no spinner, no library, no layout thrash ==");
check("nothing rotates", !/rotate|spin/i.test(cssBlock));
check("no external dependency", !/@import|url\(/.test(cssBlock));
// Scoped to the KEYFRAME BODIES. The first version scanned the whole
// block for "width" and matched `stroke-width`, which is a paint
// property set once and never animated — a false failure that would
// have been "fixed" by deleting the check.
const keyframeBodies = [...cssBlock.matchAll(/@keyframes[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
check(`${keyframeBodies.length} keyframe blocks found`, keyframeBodies.length >= 2);
const LAYOUT_PROPS = /\b(width|height|top|left|right|bottom|margin|padding|font-size)\s*:/;
checkList(
  "no keyframe animates a property that costs layout",
  keyframeBodies.filter((b) => LAYOUT_PROPS.test(b))
);
// r is animatable in SVG2 and supported unevenly; transform is not.
check("nodes scale by transform, not by the r attribute", /transform: scale\(1\.22\)/.test(cssBlock) && !/\br:\s*\d/.test(cssBlock));
check("with fill-box so the origin is the circle", /transform-box: fill-box/.test(cssBlock));

console.log("\n== 6. reduced motion still says 'working' ==");
const reduced = cssBlock.slice(cssBlock.indexOf("@media (prefers-reduced-motion: reduce)"));
check("there is a reduced-motion block", reduced.length > 50);
check("the animation stops", /animation: none/.test(reduced));
// THE PART THAT GETS SKIPPED: stopping on a frame that shows something.
check("the edges are left fully drawn", /stroke-dashoffset: 0/.test(reduced));
check("the nodes are left lit", /opacity: 1/.test(reduced));
check("and nothing is left at zero opacity", !/opacity: 0;/.test(reduced));

console.log("\n== 7. the colours were measured, and the numbers still match ==");
// The CSS comment records a screenshot run. If somebody changes the
// opacity without re-measuring, the comment becomes a lie — so the
// values it justifies are asserted against it.
check("the measurement is recorded", /MEASURED, NOT CHOSEN/.test(css));
check("dark rests at 0.6, the first value over 3:1", /opacity: 0\.6;/.test(cssBlock));
check("light uses a darker ink, not a higher opacity", /#c2410c/.test(cssBlock) && /#7e22ce/.test(cssBlock));
// orange-500 cannot reach 3:1 on the light background at any opacity —
// that is a fact about the colour, and the reason light mode changes it.
check("and the CSS says why orange-500 is not used in light", /2\.62:1/.test(css));
check("the glow is dropped in light, where it would be a smudge", /filter: none/.test(cssBlock));
// The accent-on-accent case, found only in a screenshot.
check("there is a tone for accent-coloured surfaces", /tone\?: "accent" \| "inherit"/.test(component));
check("and it drops the purple too", /is-inherit \.node\.alt/.test(cssBlock));
check("files uses it inside the orange button", /<ThinkingIndicator size="sm" tone="inherit"/.test(files));

console.log("\n== 8. weight ==");
check("globals.css marks where the ThinkingIndicator's CSS ends", cssBlockEnd !== -1,
  "without /* END ThinkingIndicator */ this budget silently measures the rest of the file too");
// A brand element that costs a library is not worth having.
const bytes = statSync("src/components/ui/thinking-indicator.tsx").size;
const cssBytes = Buffer.byteLength(cssBlock, "utf8");
const codeOnly = Buffer.byteLength(componentCode.replace(/\n\s*\n/g, "\n"), "utf8");
console.log(`        component ${bytes} B on disk, ${codeOnly} B without comments`);
console.log(`        css ${cssBytes} B with comments`);
// NOT the size of the file on disk. This codebase writes long comments
// on purpose and a byte limit on source would be a limit on explaining
// yourself; the 4,785 bytes here are 1,449 of code and the rest is why.
// What ships is what matters, and comments do not ship.
check("what ships is under 1.5 KB before minification", codeOnly < 1536, `${codeOnly} B`);
// A RATCHET, not a target — the same convention i18n-coverage uses for
// server prose. 4,697 bytes is what the rules measure today, most of it
// the light-theme selectors, which have to name both
// `:root:not([data-theme="dark"])` and `[data-theme="light"]` because
// the app has three theme states and only two of them stamp an
// attribute. The number goes up deliberately or not at all.
const CSS_BASELINE = 4800;
const cssRules = Buffer.byteLength(stripComments(cssBlock), "utf8");
check(`the CSS has not grown (${cssRules} <= ${CSS_BASELINE} B)`, cssRules <= CSS_BASELINE, `${cssRules} B`);
check("no package was added", !/"framer-motion"|"lottie|"react-spinners"/.test(readFileSync("package.json", "utf8")));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
