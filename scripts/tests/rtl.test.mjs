#!/usr/bin/env node
/*
 * ONE CATALOGUE, TWO CONSUMERS.
 *
 * lib/website-builder.ts's WRITING_DIRECTION_SECTION is a list of rules
 * this product sends to every model it asks for a website: dir on <html>,
 * logical properties not physical ones, no hiding with a negative offset,
 * mirror the icons that point and ONLY those, no sideways scroll in either
 * direction. It was written because a real Arabic site came back with
 * ~10,000px of horizontal scroll.
 *
 * The application obeyed none of it. Measured 2026-09-07 with
 * rtl-layout.prodtest.mjs before any of this landed: dir=null on every
 * route in Arabic, at 390 and at 1440, with an off-screen element census
 * identical to English — which is what "never mirrored" looks like from
 * outside. The product asked of others what it did not do itself.
 *
 * THIS FILE IS WHY THAT CANNOT SILENTLY RETURN. Every rule below is READ
 * OUT OF THE PROMPT and then checked against the app's own source. Not
 * restated — read. honeypot-rtl.prodtest.mjs established the reason and it
 * is worth repeating: a copy of a rule passes forever while the rule it
 * copied drifts. If someone edits the prompt's list, the checks here
 * change with it or they fail.
 *
 * WHAT THIS FILE CANNOT DO. It reads source. Whether the page actually
 * mirrors is a browser question and belongs to rtl-layout.prodtest.mjs;
 * the two are deliberately separate claims and neither substitutes for
 * the other.
 *
 * Run: node scripts/tests/rtl.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const builder = readFileSync("src/lib/website-builder.ts", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const constants = readFileSync("src/i18n/constants.ts", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
const td = await loadTs("src/lib/text-direction.ts");

// ---------------------------------------------------------------------
console.log("== 1. the catalogue is still where this file reads it from ==");
const SECTION = (builder.match(/const WRITING_DIRECTION_SECTION = `([\s\S]*?)`;/) ?? [])[1];
ok("WRITING_DIRECTION_SECTION is readable out of website-builder.ts", Boolean(SECTION),
  "every check below reads this string; without it they would all pass vacuously");
if (!SECTION) {
  console.log(`\nFAILED: ${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
ok("...and it is still in the system prompt", /\$\{WRITING_DIRECTION_SECTION\}/.test(builder),
  "the section exists but is no longer interpolated — models stopped receiving it");

// ---------------------------------------------------------------------
console.log("\n== 2. rule 1: dir on <html>, from the language, and only when rtl ==");
{
  // THE FOUR LANGUAGES, TAKEN FROM THE PROMPT'S OWN PROSE. The rule reads
  // "Arabic, Hebrew, Persian/Farsi, Urdu"; this turns that sentence into
  // the list and compares it with lib/text-direction.ts. Adding Hebrew to
  // one and not the other is the drift this exists to stop.
  const NAMED = { Arabic: "ar", Hebrew: "he", "Persian/Farsi": "fa", Urdu: "ur" };
  const named = Object.keys(NAMED).filter((n) => SECTION.includes(n));
  ok("the prompt names four right-to-left languages", named.length === 4,
    `found: ${named.join(", ") || "none"}`);

  const expected = named.map((n) => NAMED[n]).sort();
  const actual = [...td.RTL_LANGUAGES].sort();
  ok("RTL_LANGUAGES is exactly the set the prompt names",
    JSON.stringify(expected) === JSON.stringify(actual),
    `prompt: ${expected.join(",")}   code: ${actual.join(",")}`);

  // BEHAVIOUR, NOT SHAPE. A list can be right while the function reading
  // it is wrong.
  ok("ar reads right to left", td.directionOf("ar") === "rtl");
  ok("...and so does a regional variant", td.directionOf("ar-EG") === "rtl");
  ok("...and an upper-case tag", td.directionOf("AR") === "rtl");
  ok("en does not", td.directionOf("en") === "ltr");
  ok("el does not", td.directionOf("el") === "ltr");
  ok("nothing does not", td.directionOf(undefined) === "ltr" && td.directionOf(null) === "ltr");
  // "arabic-looking" tags that are not Arabic. A prefix test would pass
  // "arn" (Mapudungun) as right-to-left.
  ok("a language that merely starts with the same letters is not rtl",
    td.directionOf("arn") === "ltr" && td.directionOf("hen") === "ltr");

  // "If it is not, do not set dir at all."
  ok("the prompt says not to set dir on a left-to-right page",
    /do not set dir at all/i.test(SECTION));
  ok("...and dirAttribute returns undefined rather than \"ltr\"",
    td.dirAttribute("en") === undefined && td.dirAttribute("ar") === "rtl");

  // THE APPLICATION ITSELF.
  ok("app/layout.tsx puts dir on <html>", /<html[^>]*\sdir=\{/.test(layout),
    "this is the whole defect: <html lang={locale}> with no dir");
  ok("...and it comes from the locale rather than a constant",
    /dir=\{dirAttribute\(locale\)\}/.test(layout));
}

// ---------------------------------------------------------------------
console.log("\n== 3. the comment and the code agree ==");
{
  // THE GATE THE OWNER ASKED FOR, in both directions. i18n/constants.ts
  // carried an honest comment saying Arabic had no dir and no mirrored
  // layout. Once the layout sets one, that sentence becomes false — and a
  // stale comment about direction is worse than none, because the next
  // reader trusts it and stops looking.
  const commentDenies =
    /no RTL layout support|no dir="rtl"|full RTL layout is a follow-?up/i.test(constants);
  const layoutSets = /dir=\{dirAttribute\(locale\)\}/.test(layout);

  ok("the layout sets dir", layoutSets);
  ok("the comment does not still deny it", !commentDenies,
    "i18n/constants.ts says Arabic has no dir/RTL layout while app/layout.tsx sets one");
  ok("...and the comment names where the direction comes from",
    /text-direction/.test(constants),
    "a comment that agrees by saying nothing is not agreement");
  // AND THE OTHER WAY. If someone removes the dir, the comment has to
  // come back — otherwise the file claims support that is gone.
  ok("a layout with no dir would need the comment back",
    layoutSets || commentDenies,
    "dir is not set AND the comment no longer says so: the file now claims RTL support it does not have");
}

// ---------------------------------------------------------------------
console.log("\n== 4. rule 4: icons that point turn around, and only those ==");
{
  ok("the prompt still carries the icon rule", /ICONS THAT POINT MUST TURN AROUND/.test(SECTION));
  ok("...and still names the ones that must NOT be flipped",
    /must NOT be flipped/.test(SECTION) && /a phone, an envelope, a clock/.test(SECTION));

  // THE FLIP LIST, read out of globals.css — EVERY rule in the file that
  // mirrors, not the one block this check used to anchor on.
  //
  // The first version sliced from `[dir="rtl"] .lucide-arrow-right` to the
  // next brace, and a mutation walked through it by adding
  // `.lucide-phone` ABOVE that anchor: the slice began after the offending
  // selector, so the check that exists to catch a wrongly-flipped icon
  // could not see one. Anchoring on a literal is how a check ends up
  // measuring a region instead of a rule. This walks every declaration
  // block and collects the lucide classes from any that mirror, wherever
  // in the file they are and however many rules they are split across.
  //
  // COMMENTS ARE STRIPPED FIRST, and the second version of this check
  // needed to learn that the hard way. The block above documents which
  // icons are deliberately NOT mirrored, and it does so by naming them —
  // `.lucide-trending-up`, `.lucide-phone` — next to an illustration of
  // the blanket rule it warns against, `{ transform: scaleX(-1) }`. A
  // brace-counting parser read that prose as a rule and reported four
  // icons as wrongly flipped when the stylesheet mirrors none of them.
  // The gate was accusing the comment that explains it.
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const flipped = new Set();
  for (const [, selector, decls] of cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/scaleX\(\s*-1\s*\)/.test(decls)) continue;
    for (const m of selector.matchAll(/\.lucide-([a-z0-9-]+)/g)) flipped.add(m[1]);
  }
  ok("globals.css carries a named flip list", flipped.size >= 20, `${flipped.size} selectors`);

  // Which lucide icons does the app actually use? Read from the imports,
  // so an icon added tomorrow is measured tomorrow.
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx") || p.endsWith(".ts")) files.push(p);
    }
  })("src");

  const used = new Set();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (/^[A-Z]/.test(name)) used.add(name);
      }
    }
  }
  ok("lucide icons are actually imported somewhere", used.size > 20, `${used.size} distinct icons`);

  // LUCIDE EMITS TWO CLASS NAMES PER ICON, and this gate found that out
  // the hard way by reporting `undo2` missing from a flip list that
  // carries `.lucide-undo-2`. The component builds both
  // `lucide-${toKebabCase(toPascalCase(iconName))}` and
  // `lucide-${iconName}`, which differ wherever a name ends in a digit:
  // <Undo2/> renders class="lucide lucide-undo2 lucide-undo-2".
  // Verified against the installed build by rendering it, not inferred.
  // An icon is covered if EITHER form is in the list.
  const classNamesOf = (n) => [
    n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
    n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([a-z])([0-9])/g, "$1-$2").toLowerCase(),
  ];

  // WHAT COUNTS AS POINTING. Along the READING axis, which is the only
  // axis a mirrored page changes. Deliberately NOT "contains an arrow":
  // trending-up is an arrow and its meaning is vertical.
  const POINTS = /^(arrow|chevrons?|corner|move|undo|redo|reply|forward|skip|log-in|log-out|send|panel-(left|right)|indent)/;
  const VERTICAL_ONLY = /^(arrow|chevrons?|move)-(up|down)$/;

  const pointing = [...used]
    .map((n) => ({ name: n, classes: classNamesOf(n) }))
    .filter(({ classes }) => classes.some((c) => POINTS.test(c) && !VERTICAL_ONLY.test(c)));
  const missing = pointing.filter(({ classes }) => !classes.some((c) => flipped.has(c)));
  ok("every pointing icon in use is in the flip list", missing.length === 0,
    `not flipped: ${missing.map((m) => `${m.name} (${m.classes.join(" / ")})`).join(", ")}`);

  // THE OTHER HALF, and it is the half a one-line `[dir=rtl] svg` rule
  // gets wrong. The owner's words: το τηλέφωνο δεν αναστρέφεται.
  const MUST_NOT_FLIP = [
    "trending-up", "trending-down",   // vertical meaning; the charts beside them do not mirror
    "phone", "mail", "clock",         // the prompt's own three examples
    "chevron-up", "chevron-down",     // vertical
    "external-link", "search", "check", "x",
  ];
  const wronglyFlipped = MUST_NOT_FLIP.filter((n) => flipped.has(n));
  ok("nothing that does not point is in the flip list", wronglyFlipped.length === 0,
    `flipped but should not be: ${wronglyFlipped.join(", ")}`);

  // AND NO BLANKET RULE. `[dir="rtl"] svg { transform: scaleX(-1) }` would
  // satisfy every check above by mirroring everything.
  ok("there is no blanket svg flip",
    !/\[dir="rtl"\][^{]*\bsvg\s*\{[^}]*scaleX\(-1\)/.test(css),
    "a blanket rule flips the phone, the logo and every chart glyph too");
}

// ---------------------------------------------------------------------
console.log("\n== 5. rule 2: logical properties where the layout reads ==");
{
  ok("the prompt still demands logical properties",
    /LAY OUT WITH LOGICAL PROPERTIES, NOT PHYSICAL ONES/.test(SECTION));
  ok("...and still carves out the genuinely physical",
    /genuinely physical and not mirrored/.test(SECTION));

  const tsx = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) tsx.push(p);
    }
  })("src");

  // A RATCHET ON THE PHYSICAL UTILITIES THAT DECIDE READING ORDER.
  //
  // Not a zero, and the reason is in the prompt: some physical properties
  // are correct. The number below is what was left after the conversion
  // pass on 2026-09-07, and it may not grow — a new `text-left` or `ml-4`
  // in a component turns this red and the author picks start/ms or writes
  // down why physical is right.
  const PHYSICAL = /[\s"'`:]-?(text-(left|right)|(ml|mr|pl|pr)-[0-9[]|(left|right)-[0-9[]|border-[lr]\b(?!g))/g;

  // THE CENTRING IDIOM IS NOT A READING-ORDER OFFSET, and it is the one
  // carve-out this count makes. `left-1/2 -translate-x-1/2` puts an
  // element's centre on the container's centre: the 50% is undone by half
  // the element's own width, and the pair means the same thing in both
  // directions ONLY while it stays physical. Converting it to start-1/2
  // resolves to right:50% in Arabic while the translate still moves left,
  // so the element lands off-centre by its own width — measured on / at
  // 1440, where the hero glow moved to -48..464. The prompt's own
  // carve-out is "a transform on an element that has no reading order".
  //
  // Exempted only when the pairing is really there: a bare `left-1/4`
  // with no translate is a reading-order offset and still counts.
  const CENTRING = /[\s"'`:](left|right)-(1\/2|1\/3|2\/3|1\/4|3\/4)\b(?=[^"'`]*-translate-x-(1\/2|1\/3|2\/3|1\/4|3\/4)\b)/g;

  let count = 0;
  const worst = [];
  for (const f of tsx) {
    const src = readFileSync(f, "utf8");
    const total = (src.match(PHYSICAL) ?? []).length;
    const centring = (src.match(CENTRING) ?? []).length;
    const n = total - centring;
    if (n > 0) { count += n; worst.push([f, n]); }
  }
  worst.sort((a, b) => b[1] - a[1]);

  // The centring pairs are excluded above; this is what is left.
  const CEILING = 4;
  ok(`at most ${CEILING} physical reading-order utilities remain in src/**/*.tsx`,
    count <= CEILING,
    `${count} found. Worst: ${worst.slice(0, 5).map(([f, n]) => `${f} (${n})`).join(", ")}`);
  console.log(`        (measured: ${count}; the survivors are ambient-dots' two decorative orbs)`);

  // THE DRAWER, by name. It is the one element in this app that was the
  // exact shape the prompt's negative-offset rule describes: parked
  // off-canvas with -translate-x-full at left-0, unreachable in a
  // left-to-right page and 256px of reachable sideways scroll in a
  // mirrored one.
  const sidebar = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
  ok("the mobile drawer hangs off the leading edge, not the physical left",
    /fixed inset-y-0 start-0/.test(sidebar), "still `fixed inset-y-0 left-0`");
  ok("...and slides out to the correct side in a mirrored page",
    /-translate-x-full rtl:translate-x-full/.test(sidebar),
    "-translate-x-full is physical: in rtl the drawer parks ON SCREEN and the page scrolls");
  // AND STOPS SLIDING AT THE DESKTOP BREAKPOINT. This clause exists
  // because the browser found what the source review did not: adding
  // `rtl:translate-x-full` fixed the phone and broke the laptop, because
  // that variant outranks the `md:translate-x-0` that pins the sidebar in
  // place from 768px up. Measured at 1440 in Arabic: 114 elements
  // off-screen against 3 in English — the whole sidebar, pushed out of
  // the viewport on a width where it is supposed to be permanent.
  ok("...and stops sliding at the breakpoint where the sidebar becomes permanent",
    /md:rtl:translate-x-0/.test(sidebar),
    "rtl:translate-x-full outranks md:translate-x-0: the desktop sidebar leaves the screen in Arabic");
}

// ---------------------------------------------------------------------
console.log("\n== 6. rule 3: no negative offset that becomes reachable ==");
{
  ok("the prompt still forbids the negative-offset hide",
    /NEVER HIDE ANYTHING WITH A NEGATIVE OFFSET/.test(SECTION));

  // GlowOrb's own doc says the parent needs overflow-hidden to clip it,
  // and two call sites only had `relative`. Left at a negative PHYSICAL
  // offset that is unreachable in ltr and scrollable in rtl, they were
  // the prompt's rule 3 happening inside the app. Logical offsets put
  // them past the START edge, which is the unreachable side in both.
  const orbCallers = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) {
        const s = readFileSync(p, "utf8");
        if (/<GlowOrb\b/.test(s)) orbCallers.push([p, s]);
      }
    }
  })("src");
  ok("GlowOrb is still used somewhere", orbCallers.length > 0,
    "if it is gone this check is vacuous and should be deleted with it");
  // NEGATIVE offsets only, which is what rule 3 is about: leftward
  // overflow is unreachable in a left-to-right page and scrollable in a
  // mirrored one. The first version of this clause matched `-?(left|
  // right)-` and so flagged the landing page's `left-1/2 -translate-x-1/2`
  // — the centring idiom, which is positive, direction-neutral and
  // explicitly carved out above. A check that reports a correct line is
  // how a gate gets switched off.
  const physicalOrbs = orbCallers.filter(([, s]) =>
    [...s.matchAll(/<GlowOrb[^>]*className="([^"]*)"/g)].some((m) =>
      /(^|[\s])-(left|right)-/.test(m[1])
    )
  );
  ok("no GlowOrb is placed with a negative physical offset",
    physicalOrbs.length === 0,
    physicalOrbs.map(([p]) => p).join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 7. rule 5: motion that carries a direction ==");
{
  ok("the prompt still says motion has a direction",
    /MOTION HAS A DIRECTION TOO/.test(SECTION));
  ok("...and prefers translateY", /translateY/.test(SECTION));

  // Every horizontal keyframe in globals.css must have an rtl counterpart
  // or be justified. Only one animation in this file moves on X for a
  // reading-order reason.
  ok("the row-collapse animation has a mirrored twin",
    /@keyframes row-collapse-out-rtl/.test(css) &&
      /\[dir="rtl"\] \.row-collapse-out\s*\{\s*animation-name: row-collapse-out-rtl/.test(css));
  // THE WHOLE BLOCK, NOT THE FIRST MATCH IN IT. The first draft asked
  // whether `translateX(8px)` appeared anywhere after the keyframes name
  // and a mutation walked straight through it: flipping the 45% frame
  // back to -8px left the 100% frame at +8px, the lazy match found that,
  // and the gate stayed green on an animation that moves both ways at
  // once. Extract the block, then require every horizontal step in it to
  // be positive.
  const rtlFrames = (css.match(/@keyframes row-collapse-out-rtl\s*\{([\s\S]*?)\n\}/) ?? [])[1] ?? "";
  const xSteps = [...rtlFrames.matchAll(/translateX\((-?[\d.]+)px\)/g)].map((m) => Number(m[1]));
  ok("...and EVERY horizontal step in the twin moves the other way",
    xSteps.length >= 2 && xSteps.every((v) => v > 0),
    `steps: ${xSteps.join(", ") || "none found"}`);
}

// ---------------------------------------------------------------------
console.log("\n== 8. the nav rail moves both halves ==");
{
  // The base rule is `left: 0` with `border-radius: 0 9999px 9999px 0` —
  // a bar welded to the left wall and rounded on its right side only.
  // Mirroring the offset without mirroring the corners is a rail with its
  // round side facing the wall.
  const railRtl = (css.match(/\[dir="rtl"\] \.nav-item::after\s*\{([^}]*)\}/) ?? [])[1] ?? "";
  ok("the active-nav rail is repositioned under rtl", railRtl.length > 0);
  ok("...the offset moved", /right:\s*0/.test(railRtl) && /left:\s*auto/.test(railRtl));
  ok("...and so did the rounded corners",
    /border-radius:\s*9999px 0 0 9999px/.test(railRtl),
    "the offset flipped and the corners did not");
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
