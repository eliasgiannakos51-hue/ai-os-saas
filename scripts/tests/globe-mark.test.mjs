// ONE MARK, AND THE WAITING STATE BELONGS TO US.
//
// This replaces thinking-indicator.test.mjs, and the reason it is a
// different file is that the thing it defends changed shape.
//
// WHAT WAS WRONG. The product had FOUR drawings of itself: the backdrop's
// wireframe globe (auth-background.tsx), the favicon's sphere-and-orbit
// (a literal in scripts/generate-icons.mjs), a THIRD literal of nearly the
// same thing in scripts/generate-email-logo.mjs, a FOURTH hand-edited copy
// in src/app/icon.svg — and the ThinkingIndicator, which drew a
// three-node constellation borrowed from NetworkField. Editing one of them
// changed that surface and left the others behind, silently, because
// nothing compared them.
//
// There is one now: src/lib/brand/globe.ts, as DATA. Every surface is
// derived from it, and this file is what makes "derived" true rather than
// aspirational — it regenerates each artefact and compares bytes.
//
// WHAT THIS FILE ENFORCES, and why each part needs enforcing:
//
//   · ONE SHAPE. Regenerate the favicon, the apple icon, icon.svg and the
//     email logo from lib/brand/globe.ts and require the committed files
//     to match, byte for byte. A drawing that exists in two places will
//     differ in two places eventually.
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
//   · THE COLOURS ARE THEMED, not chosen twice. orange-500 measures
//     2.62:1 on the light page and cannot reach 3:1 at any opacity.
//
// Run: node scripts/tests/globe-mark.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import ts from "typescript";

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

const brand = await loadTs("src/lib/brand/globe-svg.ts");
const component = readFileSync("src/components/ui/globe-mark.tsx", "utf8");
const indicator = readFileSync("src/components/ui/thinking-indicator.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const componentCode = stripComments(component);
// The CSS block only, bounded at BOTH ends, so a rule elsewhere in a
// 1,900-line file cannot satisfy a check about this component and an
// unrelated edit at the bottom of the file cannot trip the byte ratchet.
const cssBlockStart = css.indexOf("/* THE GLOBE MARK");
const cssBlockEnd = css.indexOf("/* END GlobeMark */", cssBlockStart);
const cssBlock = css.slice(cssBlockStart, cssBlockEnd === -1 ? undefined : cssBlockEnd);
// COMMENTS ARE NOT RULES. Three assertions below were written against the
// raw block and two of them read the prose: "no literal hex" matched
// #f7f7f8 inside a sentence explaining why orange-500 cannot be used, and
// "the glow is dropped" missed its own rule because the comment above it
// is longer than the window the regex allowed. Scan the declarations.
const cssCode = stripComments(cssBlock);

// =====================================================================
console.log("== 1. one shape: every artefact is generated from the geometry ==");
// THE POINT OF THE WHOLE CHANGE. Each of these is regenerated here with
// the same parameters its generator uses and compared to what is
// committed. If somebody hand-edits icon.svg, or changes globe.ts without
// re-running the generators, this goes red — which is exactly the drift
// that produced four different marks.
const INK = "#f5a623";
const svgArtefacts = [
  {
    file: "src/app/icon.svg",
    generator: "scripts/generate-icons.mjs",
    options: { size: 140, baseStroke: 3.5, ink: INK, background: "#0a0a0a", radius: 17.14, nodeScale: 1, detail: "mark" },
  },
];
for (const { file, generator, options } of svgArtefacts) {
  const committed = readFileSync(file, "utf8");
  const expected = brand.globeSvg(options);
  check(`${file} is exactly what globeSvg() produces`, committed === expected,
    `run \`node ${generator}\`\n        committed: ${JSON.stringify(committed.slice(0, 120))}\n        expected : ${JSON.stringify(expected.slice(0, 120))}`);
}

// The raster artefacts cannot be string-compared, so they are re-rendered
// through the same pipeline (sharp) and compared as bytes.
const sharp = (await import("sharp")).default;
async function renderPng(options, size) {
  return sharp(Buffer.from(brand.globeSvg(options))).resize(size, size).png().toBuffer();
}
{
  const apple = await renderPng(
    { size: 180, baseStroke: 3, ink: INK, background: "#0a0a0a", radius: 0, nodeScale: 1, detail: "mark" },
    180
  );
  check(
    "apple-icon.png is the same mark, re-rendered byte-identically",
    Buffer.compare(apple, readFileSync("src/app/apple-icon.png")) === 0,
    "run `node scripts/generate-icons.mjs`"
  );
}
{
  const email = await sharp(
    Buffer.from(
      brand.globeSvg({ size: 256, baseStroke: 6.6, ink: INK, background: "#090909", radius: 0, nodeScale: 1, detail: "mark" })
    )
  )
    .png({ compressionLevel: 9 })
    .toBuffer();
  check(
    "the email logo is the same mark, re-rendered byte-identically",
    Buffer.compare(email, readFileSync("public/ionexa-email-logo.png")) === 0,
    "run `node scripts/generate-email-logo.mjs`"
  );
}
{
  // favicon.ico carries three sizes. Comparing the container byte for
  // byte also pins the sizes, the order and the ICO directory — a .ico
  // that quietly went back to one 180px entry is the defect that made
  // browsers paint someone else's icon first.
  const sizes = [
    { size: 16, baseStroke: 8.6, nodeScale: 3.2 },
    { size: 32, baseStroke: 5.4, nodeScale: 2 },
    { size: 48, baseStroke: 4.3, nodeScale: 1.6 },
  ];
  const images = [];
  for (const { size, baseStroke, nodeScale } of sizes) {
    images.push({
      size,
      data: await renderPng({ size, baseStroke, ink: INK, background: "#0a0a0a", radius: 17.14, nodeScale, detail: "mark" }, size),
    });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0);
    e.writeUInt8(size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
  check(
    "favicon.ico is the same mark at 16/32/48, re-rendered byte-identically",
    Buffer.compare(ico, readFileSync("src/app/favicon.ico")) === 0,
    "run `node scripts/generate-icons.mjs`"
  );
}

// AND NOBODY KEEPS A SECOND COPY. The generators used to hold their own
// SVG literals; this is what stops one growing back beside the import.
function sourceFiles(dir, out = [], exts = [".ts", ".tsx", ".mjs"]) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceFiles(p, out, exts);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
// scripts/tests IS EXCLUDED, and finding out why cost a whole mutation
// run. globe-mark.mutation.mjs necessarily QUOTES the drawing — its
// mutants are literal `r: 30` and `rx="42.86"` strings — so scanning the
// tests made this assertion fail permanently. Every mutant then reported
// as "caught" by this one check regardless of what it broke, and the
// baseline came back red. A test that describes a defect is not the
// defect; only what ships or what generates an artefact is scanned.
const allSource = [
  ...sourceFiles("src"),
  ...sourceFiles("scripts").filter((f) => !f.startsWith("scripts/tests/")),
];
checkList(
  "no file outside lib/brand/globe.ts draws the mark itself",
  allSource.filter((f) => {
    if (f === "src/lib/brand/globe.ts") return false;
    const body = readFileSync(f, "utf8");
    // The sphere's radius and the orbit's rx together are the drawing.
    // Either alone is a plausible coincidence; both in one file is a copy.
    return /r="30"|r=\{30\}/.test(body) && /rx="42\.86"|rx=\{42\.86\}/.test(body);
  })
);
check(
  "the icon generator imports the geometry rather than inlining it",
  /loadTs\("src\/lib\/brand\/globe-svg\.ts"\)/.test(readFileSync("scripts/generate-icons.mjs", "utf8"))
);
check(
  "so does the email-logo generator",
  /loadTs\("src\/lib\/brand\/globe-svg\.ts"\)/.test(readFileSync("scripts/generate-email-logo.mjs", "utf8"))
);
check(
  "and the React component does too",
  /from "@\/lib\/brand\/globe"/.test(componentCode)
);

// =====================================================================
console.log("\n== 2. the mark survives 16px, which is where a favicon lives ==");
// The node does NOT scale with the canvas, and forgetting that turned the
// 16px icon into a dim smudge — caught by rendering it, not by reading
// the code. These assertions pin the arithmetic that fixed it.
check("globeSvg takes a nodeScale", /nodeScale/.test(readFileSync("src/lib/brand/globe-svg.ts", "utf8")));
{
  const small = brand.globeSvg({ size: 16, baseStroke: 8.6, ink: INK, nodeScale: 3.2 });
  const nodeR = Number(small.match(/<circle cx="50" cy="20" r="([\d.]+)"/)?.[1]);
  check(`the 16px node is scaled up (r=${nodeR} of a 100 box)`, nodeR > 12, String(nodeR));
  // At 16px, r=13.7 of 100 is 2.2 real pixels. Below ~10 it is under
  // 1.6px and antialiases into the sphere behind it.
  check("and the 16px sphere stroke is at least 1px when rendered", 8.6 * 16 / 100 >= 1);
}
check(
  "the icon generator scales the node at every small size",
  /nodeScale: 3\.2[\s\S]{0,200}nodeScale: 2[\s\S]{0,200}nodeScale: 1\.6/.test(
    readFileSync("scripts/generate-icons.mjs", "utf8")
  )
);

// =====================================================================
console.log("\n== 3. every waiting surface uses it ==");
const SITES = [
  ["chat", "src/components/chat/chat-workspace.tsx"],
  ["ask-my-records", "src/components/records/ask-ai-modal.tsx"],
  ["files", "src/components/files/files-workspace.tsx"],
  ["create studio", "src/components/create/create-studio.tsx"],
  ["website builder", "src/components/website-builder/website-builder-workspace.tsx"],
  ["deep research", "src/components/research/research-workspace.tsx"],
];
// DIRECTLY, OR THROUGH AiActivity — and the difference is not a loophole.
// components/ui/ai-activity.tsx pairs the motion with the WORDS from
// lib/jobs/ai-steps.ts in a role="status" region, so a screen reader
// hears which step is running. Requiring a literal <ThinkingIndicator> in
// those two files would push them back to motion with no words. The
// indirection is one level deep and the wrapper is pinned here.
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
check("and the indicator is the globe now", /<GlobeMark/.test(stripComments(indicator)));

// AND THE OTHER WAITING SURFACES THE BRIEF NAMED.
check("the whole-app loading state shows it", /<GlobeMark/.test(stripComments(readFileSync("src/components/loading-state.tsx", "utf8"))));
check("so does the between-pages skeleton", /<GlobeMark/.test(stripComments(readFileSync("src/components/dashboard/route-skeleton.tsx", "utf8"))));
{
  const empty = stripComments(readFileSync("src/components/empty-state.tsx", "utf8"));
  check("and the empty state", /<GlobeMark/.test(empty));
  // The module icon is what says WHICH page is empty. Replacing it with
  // the globe would make twenty-one empty pages identical, so the globe
  // is the decoration behind it and the icon stays.
  check("empty states keep their per-module icon in front of it", /<Icon\b/.test(empty));
}

// =====================================================================
console.log("\n== 4. and nothing anywhere bounces ==");
function tsxFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) tsxFiles(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const allTsx = tsxFiles("src");

// =====================================================================
// EVERY CALL SITE, NOT A SAMPLE: does each one pick the right tone?
//
// globe-mark.prodtest.mjs measures that `inherit` reads 7.49:1 on an
// orange button and that the accent tone reads 1.01:1 there — invisible,
// which is what actually shipped once. That proves the two tones behave;
// it does not prove any given call site chose correctly. This does, by
// looking at the surface each one sits on.
//
// A SOLID bright fill only. `hover:bg-orange-500/10` is a tint on a dark
// panel and an accent-coloured mark is right there; the first version of
// this check matched it and would have demanded the opposite.
{
  const SOLID = /(?<!hover:)(?<!focus:)(?<!group-hover:)\bbg-(orange|amber)-500(?![/\w])|bg-\[linear-gradient/;
  const wrong = [];
  for (const f of allTsx) {
    const lines = stripComments(readFileSync(f, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (!/<ThinkingIndicator/.test(line)) return;
      // The surface is an ANCESTOR, so look back, not at the line itself.
      const above = lines.slice(Math.max(0, i - 12), i).join("\n");
      const bright = SOLID.test(above) && /text-black/.test(above);
      const inherits = /tone="inherit"/.test(line);
      if (bright !== inherits) {
        wrong.push(`${f}:${i + 1} sits on ${bright ? "a bright" : "a dark"} surface but asks for tone=${inherits ? "inherit" : "accent"}`);
      }
    });
  }
  checkList("every indicator takes its tone from the surface under it", wrong);
}

// =====================================================================
// WHERE THE GLOBE GOES, AND WHERE IT DELIBERATELY DOES NOT.
//
// "Globe everywhere" cannot mean every spinner, and pretending otherwise
// would be the sampling this file exists to prevent. The line drawn here
// is about WHAT THE WAIT IS:
//
//   THE GLOBE means Ionexa is thinking — an AI job, a generation, an
//   analysis, a research run. The product is doing something on the
//   user's behalf and the mark says whose product it is.
//
//   A PLAIN SPINNER means a mechanical round-trip — saving, deleting,
//   uploading, publishing, connecting an account, retrying a request,
//   checking storage. A globe on a delete button would spend the mark on
//   a database write, and a signature that appears on everything signs
//   nothing.
//
// FIRST: no file may hand-roll the indicator. Five did — a
// `animate-spin rounded-full border-2` ring, drawn four different ways in
// four different files, which is the same four-copies problem the whole
// change exists to end. All five are now the indicator.
checkList(
  "nobody hand-rolls a ring spinner",
  allTsx.filter((f) => /animate-spin[^"]*rounded-full[^"]*border/.test(stripComments(readFileSync(f, "utf8"))))
);
// SECOND: the mechanical set is an EXACT list, not a filter. If a new
// file starts spinning, this fails and somebody has to decide which side
// of the line it is on. That is the point — the decision gets made once,
// visibly, instead of being inherited from whatever screen was copied.
const MECHANICAL = [
  "src/components/agents/delivery-picker.tsx",
  "src/components/auth/social-auth-buttons.tsx",
  "src/components/documents/document-editor.tsx",
  "src/components/documents/new-document-button.tsx",
  "src/components/files/files-workspace.tsx",
  "src/components/mission/mission-delete-button.tsx",
  "src/components/mission/mission-detail.tsx",
  "src/components/mission/mission-form.tsx",
  "src/components/mission/step-controls.tsx",
  "src/components/network/offline-banner.tsx",
  "src/components/onboarding/onboarding-flow.tsx",
  "src/components/publishing/publish-control.tsx",
  "src/components/system-health/storage-diagnostics.tsx",
  "src/components/website-builder/website-builder-workspace.tsx",
  // V4 #19. The UPLOAD button, and only that one: reading a file and
  // posting it is a mechanical wait, and marking it with the signature
  // would spend the mark on a POST. The two waits on this page that ARE
  // the model thinking — "find patterns" and asking the data a question —
  // use the globe, which is why this file appears here rather than being
  // exempted wholesale.
  "src/components/data-analysis/analysis-workspace.tsx",
  // V4 #25. Saving a consent row and opening a Stripe checkout are both
  // mechanical waits on a POST — nothing is thinking. The globe is the
  // mark of the model working, and spending it on a settings save would
  // make it mean "busy", which is what it exists NOT to mean.
  "src/components/settings/overage-settings.tsx",
  "src/components/settings/addons-settings.tsx",
];
{
  const spinning = allTsx.filter((f) => /animate-spin/.test(stripComments(readFileSync(f, "utf8")))).sort();
  checkList("no new file started spinning without a decision", spinning.filter((f) => !MECHANICAL.includes(f)));
  checkList("and the list has no entries that stopped spinning", MECHANICAL.filter((f) => !spinning.includes(f)));
}

checkList(
  "no component uses animate-bounce",
  allTsx.filter((f) => /animate-bounce/.test(stripComments(readFileSync(f, "utf8"))))
);
checkList(
  "and none fakes a typing cursor",
  allTsx.filter((f) => /animate-pulse[^"]*\bw-\[?[12]\b|caret-blink|typing-cursor/.test(readFileSync(f, "utf8")))
);
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
// The constellation is gone, not merely unused: a dead CSS block is a
// second drawing waiting to be re-adopted.
check("the constellation's CSS is gone from globals.css", !/ionexa-think/.test(css));

// =====================================================================
console.log("\n== 5. it sits beside the words, never instead of them ==");
const files = stripComments(readFileSync("src/components/files/files-workspace.tsx", "utf8"));
check("files still renders its step label", /askStepLabel/.test(files));
check("with the indicator beside it, not replacing it", /<ThinkingIndicator[\s\S]{0,400}askStepLabel/.test(files));
const wb = stripComments(readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8"));
check("website builder keeps its progress sentence", /PROGRESS_MESSAGE_KEYS\[progressMessageIndex\]/.test(wb));
check("and the indicator is above it", wb.indexOf("<ThinkingIndicator") < wb.indexOf("PROGRESS_MESSAGE_KEYS[progressMessageIndex]"));
const cs = stripComments(readFileSync("src/components/create/create-studio.tsx", "utf8"));
check("create studio keeps its per-step label", /t\(`progress\.\$\{step\.labelKey\}`\)/.test(cs));
const rs = stripComments(readFileSync("src/components/research/research-workspace.tsx", "utf8"));
check("research keeps its planning label", /<ThinkingIndicator[\s\S]{0,120}t\("planning"\)/.test(rs));

// =====================================================================
console.log("\n== 6. no library, no filter, no layout thrash ==");
check("no external dependency", !/@import|url\(/.test(cssBlock));
// ONLY THE ORBIT MOVES. NetworkField and AuthBackground animated content
// inside a full-viewport filtered SVG and keystroke latency measured
// 120ms; the rule that keeps this from repeating is that the sphere and
// its bands — which are rotationally symmetric — never animate.
check("only the orbit group is animated", /\.is-spinning \.globe-orbit-group\s*\{\s*animation:/.test(cssCode));
// EXTRACT THE VALUE, DO NOT LOOK AHEAD PAST IT. The first version wrote
// `animation:\s*(?!none)` and reported the two reduced-motion rules as
// violations: `\s*` is greedy, so when the lookahead failed the engine
// backtracked it to zero characters and the lookahead then passed against
// the SPACE. A negative lookahead behind a variable-width match asserts
// nothing.
// AN ALLOWLIST OF ONE, NOT AN EXCLUSION. This filter used to read
// `!r.selector.includes("is-spinning")`, meaning to skip the single rule
// that is supposed to animate. It skipped EVERY rule with `is-spinning`
// in it — so adding `.ionexa-globe.is-spinning svg { animation: ... }`,
// which rotates the entire SVG and is the exact repaint trap that cost
// this codebase 120ms per keystroke twice, passed silently. The mutation
// suite found it; reading the line did not.
const SPIN_RULE = ".ionexa-globe.is-spinning .globe-orbit-group";
checkList(
  "exactly one selector animates, and it is the orbit group",
  [...cssCode.matchAll(/([.#][\w.-][^{}]*)\{([^}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), value: m[2].match(/animation:\s*([^;]+)/)?.[1]?.trim() }))
    .filter((r) => r.value && r.value !== "none" && r.selector !== SPIN_RULE)
    .map((r) => `${r.selector} -> ${r.value}`)
);
check(
  "and that one rule is present, so the allowlist is not vacuous",
  new RegExp(SPIN_RULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[^}]*animation:\\s*ionexa-globe-spin").test(cssCode)
);
check("and the mark carries no runtime filter on its strokes", !/filter:\s*(?!none)[a-z]/.test(cssCode.replace(/drop-shadow\(0 0 2px currentColor\)/, "")));
const keyframeBodies = [...cssCode.matchAll(/@keyframes[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
check(`${keyframeBodies.length} keyframe block(s) found`, keyframeBodies.length >= 1);
const LAYOUT_PROPS = /\b(width|height|top|left|right|bottom|margin|padding|font-size)\s*:/;
checkList("no keyframe animates a property that costs layout", keyframeBodies.filter((b) => LAYOUT_PROPS.test(b)));
check("the spin is a transform", keyframeBodies.some((b) => /transform:\s*rotate/.test(b)));
check("with an explicit origin, so it turns about the globe's centre", /transform-origin: 50px 50px/.test(cssBlock));

// =====================================================================
console.log("\n== 7. reduced motion still says 'working' ==");
const reduced = cssBlock.slice(cssBlock.indexOf("@media (prefers-reduced-motion: reduce)"));
check("there is a reduced-motion block", reduced.length > 50);
check("the animation stops", /animation: none/.test(reduced));
// THE PART THAT GETS SKIPPED. The two global kill-switches zero the
// DURATION, which freezes a rotation at whatever angle it reached. The
// orbit is drawn at -20deg deliberately, so reduced motion has to return
// it there rather than leave it wherever the clock stopped.
//
// THIS ASSERTION USED TO READ `/transform: none/.test(reduced)` AND IT WAS
// WRONG — a source-level check on a declaration that changes nothing.
// Deleting `transform: none` from those rules left BOTH suites green:
// with `animation: none` there is no animated transform to override and
// the element has none of its own, so the computed value is `none` either
// way. It was an equivalent mutant, so the declaration was removed from
// globals.css instead of being defended here.
//
// What replaces it is stronger, not weaker. The guarantee is about the
// COMPUTED transform in a browser under reducedMotion: "reduce", and only
// the prodtest can see that. So: the declaration must stay out (or this
// comment is a lie), and the browser assertion that actually proves the
// angle must still exist — otherwise the concern would quietly vanish
// from both files at once.
check(
  "the unreachable `transform: none` has not crept back in",
  !/transform: none/.test(reduced)
);
const browserSuite = readFileSync("scripts/tests/globe-mark.prodtest.mjs", "utf8");
check(
  "the real guard lives in the browser suite: it reads the computed transform",
  /cs\.transform/.test(browserSuite) && /reducedMotion: "reduce"/.test(browserSuite)
);
check(
  "and it requires that transform to be none",
  /state\.transform === "none"/.test(browserSuite)
);
check("the toggle is covered as well as the OS setting", /html\[data-motion="reduce"\] \.ionexa-globe/.test(cssBlock));
check("and nothing is left at zero opacity", !/opacity: 0;/.test(reduced));

// =====================================================================
console.log("\n== 8. the colour is themed once, not chosen twice ==");
check("the mark takes its colour from the accent token", /color: rgb\(var\(--accent-border\)\)/.test(cssBlock));
// A literal hex here would be a dark-theme value shipped to both themes,
// which is the exact defect the light-theme pass spent itself on.
checkList(
  "no literal hex in the block",
  [...cssCode.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
);
check("the CSS records why orange-500 is not used in light", /2\.62:1/.test(cssBlock));
check("there is a tone for accent-coloured surfaces", /tone\?: "accent" \| "inherit"/.test(indicator));
check("and it takes the parent's colour", /\.ionexa-globe\.is-inherit\s*\{\s*color: inherit/.test(cssBlock));
check("with the glow dropped, since a halo in the parent's colour is a smudge", /is-inherit \.globe-node[\s\S]{0,80}filter: none/.test(cssCode));
check("files uses it inside the orange button", /<ThinkingIndicator size="sm" tone="inherit"/.test(files));

// =====================================================================
console.log("\n== 9. weight ==");
check("globals.css marks where the block ends", cssBlockEnd !== -1,
  "without /* END GlobeMark */ this budget silently measures the rest of the file too");
// WHAT ACTUALLY SHIPS. globe-svg.ts is generator-only and is deliberately
// not counted — it is also asserted below not to be imported by any
// component, so "not counted" is enforced rather than assumed.
//
// THIS USED TO BE REGEXES AND THE REGEXES WERE WRONG, which matters
// because a budget that under-reports is worse than no budget. Type
// declarations were erased with `/^export type [\s\S]*?\n\};?$/gm`. In
// globe.ts that pattern starts at `export type GlobeShape =` and runs to
// the FIRST line that is exactly `};` — which is not the end of the type,
// it is the end of the ORBIT constant four declarations later. So `C`,
// `SPHERE` and the whole of `ORBIT` were deleted before counting, and
// every figure this budget printed before now was too small. `[\s\S]*?`
// is lazy, not bounded: it will cross anything at all to find its
// terminator.
//
// tsc does the erasure now. It is the same compiler the build uses, it
// knows where a declaration ends, and `removeComments` means the long
// comments this codebase writes on purpose are not charged to the budget.
function shippedBytes(file) {
  const out = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      jsx: file.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : undefined,
      removeComments: true,
    },
  }).outputText;
  return Buffer.byteLength(out.replace(/\n\s*\n/g, "\n"), "utf8");
}
checkList(
  "no component imports the generator-only serialiser",
  allSource
    .filter((f) => f.startsWith("src/") && f !== "src/lib/brand/globe-svg.ts")
    .filter((f) => /brand\/globe-svg/.test(readFileSync(f, "utf8")))
);
const geometryBytes = shippedBytes("src/lib/brand/globe.ts");
const markBytes = shippedBytes("src/components/ui/globe-mark.tsx");
const indicatorBytes = shippedBytes("src/components/ui/thinking-indicator.tsx");
const cssBytes = Buffer.byteLength(stripComments(cssBlock).replace(/\n\s*\n/g, "\n"), "utf8");
const shipped = geometryBytes + markBytes + indicatorBytes + cssBytes;
console.log(`        geometry ${geometryBytes} B · component ${markBytes} B · indicator ${indicatorBytes} B · css ${cssBytes} B`);
console.log(`        shipped total ${shipped} B`);
// NOT the size on disk. This codebase writes long comments on purpose and
// a byte limit on source would be a limit on explaining yourself. What
// ships is what matters, and comments do not ship.
//
// THE BUDGET IS A DELTA, because this REPLACED something. The brief says
// "+1KB max", and the honest reading of "+" is against what was there:
// the constellation's component and its CSS block, all of it deleted.
//
// BOTH NUMBERS HERE WERE WRONG UNTIL THE INSTRUMENT ABOVE WAS FIXED, and
// they are restated rather than quietly swapped. The old pair was
// `1449 + 2514 = 3963`, produced by the same regex that was silently
// eating `C`, `SPHERE` and `ORBIT` out of the new side. Re-measured with
// tsc against the actual diff of the commit that removed them:
//   · old thinking-indicator.tsx, types erased, comments stripped: 1429 B
//   · lines this change DELETES from globals.css, comments stripped: 2275 B
// The CSS figure is taken from the diff, not from a line range, because a
// line range is a guess about where a block ended and a diff is not.
const REPLACED_CODE_BYTES = 1429 + 2275;
const delta = shipped - REPLACED_CODE_BYTES;
console.log(`        replaced ${REPLACED_CODE_BYTES} B · delta ${delta >= 0 ? "+" : ""}${delta} B`);
check(`the mark costs no more than 1 KB over what it replaced (${delta >= 0 ? "+" : ""}${delta} B)`, delta <= 1024, `${delta} B`);
// An absolute ceiling as well, so "delete something else" can never become
// the way to fit under the delta.
//
// THIS CEILING WAS 4608 B AND IT WAS CALIBRATED WITH THE BROKEN RULER.
// The same code that reported 4410 B then measures 4629 B now — nothing
// grew, the measurement stopped skipping three declarations. A threshold
// derived from a broken instrument is not a threshold that caught
// anything, so it is re-anchored here rather than defended: 5120 B, which
// is the current 4629 B plus 491 B of headroom.
//
// THE NUMBER THAT ACTUALLY DECIDES THIS IS NOT IN THIS FILE. Source bytes
// are a proxy; what ships is the built client bundle. Measured by
// building HEAD and this tree and summing .next/static/chunks:
// 2,683,919 B -> 2,666,372 B raw, 742,879 B -> 741,628 B gzipped. The
// bundle got SMALLER by 17,547 B raw and 1,251 B gzipped, because what
// this deleted -- the constellation, its CSS, the empty-state rings and
// five hand-rolled ring spinners -- was bigger than the one shared mark
// that replaced all of it.
check(`and stays under 5 KB in absolute terms (${shipped} B)`, shipped < 5120, `${shipped} B`);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
