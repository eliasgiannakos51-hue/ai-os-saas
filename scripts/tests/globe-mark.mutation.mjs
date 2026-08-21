#!/usr/bin/env node
/*
 * CAN THE GLOBE SUITES GO RED?
 *
 * Two suites defend the mark: globe-mark.test.mjs (one shape, shared
 * geometry, weight) and globe-mark.prodtest.mjs (painted pixels, contrast,
 * 375px, reduced motion, frame rate). Both are green, and green means
 * nothing until the defect they exist for is put back and they are
 * required to notice.
 *
 * Every mutation below is a REAL failure mode, not synthetic damage:
 *   · the four-copies problem the whole change exists to end
 *   · the 16px smudge, which happened during this work and was caught by
 *     rendering the icon rather than by reading the code
 *   · the reduced-motion specificity bug, which happened during this work
 *     and was caught by the browser rather than by review
 *   · the light-theme hardcode that the last pass spent itself removing
 *
 * A mutation that survives is printed as a hole, because that is what it
 * is.
 *
 * Run: node scripts/tests/globe-mark.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const UNIT = "scripts/tests/globe-mark.test.mjs";
const BROWSER = "scripts/tests/globe-mark.prodtest.mjs";

const GEOMETRY = "src/lib/brand/globe.ts";
const SERIALISER = "src/lib/brand/globe-svg.ts";
const COMPONENT = "src/components/ui/globe-mark.tsx";
const INDICATOR = "src/components/ui/thinking-indicator.tsx";
const CSS = "src/app/globals.css";
const ICON = "src/app/icon.svg";

const MUTANTS = [
  // ------------------------------------------------------------------
  // ONE SHAPE. The reason the whole thing was rewritten.
  // ------------------------------------------------------------------
  {
    name: "the favicon is hand-edited away from the shared geometry",
    suites: [UNIT],
    file: ICON,
    from: '<circle cx="50" cy="50" r="30"',
    to: '<circle cx="50" cy="50" r="28"',
  },
  {
    name: "the geometry changes and the artefacts are not regenerated",
    suites: [UNIT],
    file: GEOMETRY,
    from: 'role: "sphere", cx: C, cy: C, r: 30',
    to: 'role: "sphere", cx: C, cy: C, r: 31',
  },
  {
    name: "the orbit is dropped from the mark, so the favicon is a plain ring",
    suites: [UNIT],
    file: GEOMETRY,
    from: 'return detail === "full" ? [LATITUDE, MERIDIAN, SPHERE, ORBIT, NODE] : [SPHERE, ORBIT, NODE];',
    to: 'return detail === "full" ? [LATITUDE, MERIDIAN, SPHERE, ORBIT, NODE] : [SPHERE, NODE];',
  },
  // A PAINT-ORDER MUTANT USED TO SIT HERE and it was WRONG — not a hole,
  // a false premise. It swapped ORBIT and NODE and called the result "the
  // node hides under the orbit line". Two measurements say it cannot:
  //   · the closest point on the orbit's centreline to the node centre is
  //     12.89 viewBox units away; minus the node's 4.29 radius and the
  //     orbit's 1.07 half-stroke that is a 7.53-unit GAP. They never touch.
  //   · every shape is drawn in one colour (currentColor), so compositing
  //     any of them over any other is a no-op. Rasterised at 512px in both
  //     orders, with the node's glow filter applied: 0 of 1,048,576
  //     subpixels differ, max channel delta 0.
  // It was an equivalent mutant that read like a caught bug, which is
  // worse than a missed one. What it was standing in for — that the node
  // is the part a person can see moving — is below, and is real.
  {
    name: "the node stops orbiting, so the only moving part goes still",
    suites: [BROWSER],
    file: GEOMETRY,
    from: 'return ["orbit", "node"];',
    to: 'return ["orbit"];',
  },
  {
    name: "a component starts drawing the mark itself again",
    suites: [UNIT],
    file: COMPONENT,
    from: "  const resolved: GlobeDetail =",
    to: '  const _copy = `<circle r="30"/><ellipse rx="42.86"/>`;\n  void _copy;\n  const resolved: GlobeDetail =',
  },
  {
    name: "the generator-only serialiser is imported by a component",
    suites: [UNIT],
    file: COMPONENT,
    from: 'from "@/lib/brand/globe";',
    to: 'from "@/lib/brand/globe";\nimport "@/lib/brand/globe-svg";',
  },

  // ------------------------------------------------------------------
  // THE 16px SMUDGE. This happened, mid-change, and only a render showed it.
  // ------------------------------------------------------------------
  {
    name: "the node stops scaling up at small sizes (the 16px icon becomes a smudge)",
    suites: [UNIT],
    file: SERIALISER,
    from: 'const r = shape.role === "node" ? shape.r * nodeScale : shape.r;',
    to: "const r = shape.r;",
  },
  {
    // THE SAME DEFECT, THE OTHER HALF. Scaling the node was added to the
    // SVG generator when the 16px favicon came out as a smudge, and the
    // React component did not get it — so 18px and 26px, the two sizes
    // the ThinkingIndicator actually ships, painted a 1.75px dot. The
    // generator mutants below would not have noticed: they only touch
    // generated artefacts.
    name: "the component drops the node scale, so the 18px indicator loses its node",
    suites: [BROWSER],
    file: COMPONENT,
    from: 'r={shape.role === "node" ? shape.r * nodeScale : shape.r}',
    to: "r={shape.r}",
  },
  {
    name: "the node-scale rule stops compensating at small sizes",
    suites: [BROWSER],
    file: GEOMETRY,
    from: "  if (drawnPx >= MIN_NODE_PX) return 1;",
    to: "  if (drawnPx >= 0) return 1;",
  },
  {
    name: "the icon generator forgets the small-size node scale",
    suites: [UNIT],
    file: "scripts/generate-icons.mjs",
    from: "{ size: 16, baseStroke: 8.6, nodeScale: 3.2 }",
    to: "{ size: 16, baseStroke: 8.6, nodeScale: 1 }",
  },

  // ------------------------------------------------------------------
  // REDUCED MOTION. Also happened mid-change; the browser found it.
  // ------------------------------------------------------------------
  {
    name: "the reduced-motion rule loses the specificity war again",
    suites: [BROWSER],
    file: CSS,
    from: "  .ionexa-globe.is-spinning .globe-orbit-group {\n    animation: none;\n  }",
    to: "  .ionexa-globe .globe-orbit-group {\n    animation: none;\n  }",
  },
  // NOTE, so nobody re-adds it: deleting `transform: none` from the
  // reduced-motion rules was an EQUIVALENT MUTANT, not a hole. With the
  // animation off there is no animated transform to override, so the
  // computed value is none either way — which is why that declaration has
  // been removed from globals.css rather than defended here.

  // ------------------------------------------------------------------
  // THE LIGHT THEME. The defect the previous pass spent itself on.
  // ------------------------------------------------------------------
  {
    name: "the mark is hardcoded to orange-500, which is 2.62:1 on the light page",
    suites: [UNIT, BROWSER],
    file: CSS,
    from: "  color: rgb(var(--accent-border));",
    to: "  color: #f97316;",
  },
  {
    name: "the accent-on-accent escape hatch is removed",
    suites: [UNIT],
    file: CSS,
    from: ".ionexa-globe.is-inherit {\n  color: inherit;\n}",
    to: ".ionexa-globe.is-inherit {\n  color: rgb(var(--accent-border));\n}",
  },

  // ------------------------------------------------------------------
  // THE THINGS THAT MUST NOT COME BACK.
  // ------------------------------------------------------------------
  {
    name: "a waiting surface goes back to a bare spinner",
    suites: [UNIT],
    file: "src/components/ui/ai-activity.tsx",
    from: "<ThinkingIndicator",
    to: '<span className="animate-spin" data-was="<ThinkingIndicator"',
  },
  {
    name: "the indicator stops being the globe",
    suites: [UNIT],
    file: INDICATOR,
    from: "    <GlobeMark",
    to: '    <span className="animate-pulse" data-not-globe',
  },
  {
    name: "the empty state loses its per-module icon, so 21 pages look identical",
    suites: [UNIT],
    file: "src/components/empty-state.tsx",
    from: '          <Icon className="h-6 w-6 text-orange-400" aria-hidden="true" />',
    to: "",
  },
  {
    name: "the whole globe animates, not just the orbit (the repaint trap)",
    suites: [UNIT],
    file: CSS,
    from: ".ionexa-globe.is-spinning .globe-orbit-group {\n  animation: ionexa-globe-spin 3.2s linear infinite;\n}",
    to: ".ionexa-globe.is-spinning .globe-orbit-group {\n  animation: ionexa-globe-spin 3.2s linear infinite;\n}\n.ionexa-globe.is-spinning svg {\n  animation: ionexa-globe-spin 8s linear infinite;\n}",
  },
  // ------------------------------------------------------------------
  // THE SIXTEEN CALL SITES. "Globe everywhere" is only true if the sites
  // are enforced rather than counted once.
  // ------------------------------------------------------------------
  {
    name: "a call site on an orange button loses tone=inherit, so the mark is orange on orange",
    suites: [UNIT],
    file: "src/components/chat/chat-composer.tsx",
    from: '<ThinkingIndicator size="sm" tone="inherit" />',
    to: '<ThinkingIndicator size="sm" />',
  },
  {
    name: "somebody hand-rolls the ring spinner again",
    suites: [UNIT],
    file: "src/components/chat/chat-composer.tsx",
    from: '<ThinkingIndicator size="sm" tone="inherit" />',
    to: '<span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />',
  },
  {
    name: "a new file starts spinning without anyone deciding which side of the line it is on",
    suites: [UNIT],
    file: "src/components/loading-state.tsx",
    from: "<GlobeMark",
    to: '<span className="animate-spin" />;\n  void 0;\n  const _unused = <GlobeMark',
  },
  {
    name: "a labelled indicator is hidden from screen readers",
    suites: [BROWSER],
    file: COMPONENT,
    from: 'aria-hidden={title ? undefined : true}',
    to: 'aria-hidden={true}',
  },
];

let caught = 0;
const missed = [];

for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));

  let caughtBy = null;
  let detail = "";
  try {
    for (const suite of m.suites) {
      try {
        execFileSync("node", [suite], { encoding: "utf8", stdio: "pipe" });
      } catch (e) {
        caughtBy = suite;
        const out = String(e.stdout || "") + String(e.stderr || "");
        detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
        break;
      }
    }
  } finally {
    writeFileSync(m.file, original);
  }

  if (caughtBy) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          by ${caughtBy.split("/").pop()} -> ${detail.slice(0, 140)}`);
  } else {
    missed.push({ ...m, why: "every suite stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the suites stayed green`);
  }
}

// A restore that silently failed would leave the tree mutated and every
// later run meaningless.
try {
  execFileSync("node", [UNIT], { stdio: "pipe" });
  console.log("\nbaseline: the suite is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES — these defects can ship without the suites noticing:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned a suite red.");
