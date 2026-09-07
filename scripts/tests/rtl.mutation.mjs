#!/usr/bin/env node
/*
 * CAN rtl.test.mjs SEE EACH RULE BREAK ON ITS OWN?
 *
 * The gate reads a catalogue out of the website-builder prompt and checks
 * the application against it. That is a good shape and it is also the
 * shape that walks through most easily: a check written against a rule it
 * READ can be satisfied by the rule's presence rather than by the app's
 * obedience to it. Each mutation below removes exactly one thing the app
 * does and requires the clause that names it to go red.
 *
 * The first defect this suite found was in the gate itself: the icon check
 * classified lucide names with one kebab function while lucide emits two
 * class names per icon, and reported `.lucide-undo-2` missing from a list
 * that contains it. That was caught before this file existed, by the gate
 * failing on the real tree — which is the cheapest possible time.
 *
 * Run: node scripts/tests/rtl.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/rtl.test.mjs";
const LAYOUT = "src/app/layout.tsx";
const TD = "src/lib/text-direction.ts";
const CSS = "src/app/globals.css";
const CONSTANTS = "src/i18n/constants.ts";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const HEADER = "src/components/dashboard/page-header.tsx";
const BUILDER = "src/lib/website-builder.ts";
const TARGETS = [GATE, LAYOUT, TD, CSS, CONSTANTS, SIDEBAR, HEADER, BUILDER];

const MUTANTS = [
  {
    // 1. THE DEFECT ITSELF, exactly as it shipped for weeks: <html> with
    // a lang and no dir. Everything else in this change is downstream of
    // this one attribute.
    name: "the <html> element loses its dir again",
    file: LAYOUT,
    from: "<html lang={locale} dir={dirAttribute(locale)} className=",
    to: "<html lang={locale} className=",
    expect: "puts dir on <html>",
  },
  {
    // 2. dir SET, BUT NOT FROM THE LANGUAGE. A hardcoded "ltr" satisfies
    // "there is a dir attribute" and is the same bug wearing a hat.
    name: "dir is hardcoded instead of derived from the locale",
    file: LAYOUT,
    from: "dir={dirAttribute(locale)}",
    to: 'dir="ltr"',
    expect: "it comes from the locale rather than a constant",
  },
  {
    // 3. THE TWO LISTS DRIFT APART. The prompt names four languages; drop
    // one from the code and the gate has to notice, because that is the
    // whole claim of "one catalogue, two consumers".
    name: "Urdu falls out of RTL_LANGUAGES while the prompt still names it",
    file: TD,
    from: 'export const RTL_LANGUAGES = ["ar", "he", "fa", "ur"] as const;',
    to: 'export const RTL_LANGUAGES = ["ar", "he", "fa"] as const;',
    expect: "RTL_LANGUAGES is exactly the set the prompt names",
  },
  {
    // 4. A PREFIX TEST INSTEAD OF A SUBTAG TEST. startsWith passes "arn"
    // (Mapudungun, left-to-right) as Arabic. This is the ASCII-\b lesson
    // in another alphabet: a matcher that is nearly right.
    name: "direction is decided by a prefix test",
    file: TD,
    from: '  return (RTL_LANGUAGES as readonly string[]).includes(baseSubtag(locale)) ? "rtl" : "ltr";',
    to: '  const l = String(locale ?? "").toLowerCase();\n  return (RTL_LANGUAGES as readonly string[]).some((r) => l.startsWith(r)) ? "rtl" : "ltr";',
    expect: "a language that merely starts with the same letters is not rtl",
  },
  {
    // 5. dir="ltr" EMITTED RATHER THAN OMITTED. The prompt says "do not
    // set dir at all"; this obeys the letter of "there is a dir" and
    // breaks the rule the prompt actually states.
    name: 'dirAttribute returns "ltr" instead of undefined',
    file: TD,
    from: '  return directionOf(locale) === "rtl" ? "rtl" : undefined;',
    to: '  return directionOf(locale) === "rtl" ? "rtl" : ("ltr" as unknown as undefined);',
    expect: 'dirAttribute returns undefined rather than "ltr"',
  },
  {
    // 6. THE COMMENT GOES STALE — the owner's own requirement, and the
    // direction that actually happened here: the code was fixed and the
    // sentence describing the old behaviour stayed.
    name: "the constants comment goes back to denying RTL support",
    file: CONSTANTS,
    from: '// "ar" is laid out right-to-left.',
    to: '// "ar" ships text-only Arabic translations with no RTL layout support yet\n// (no dir="rtl"), full RTL layout is a follow-up.\n// "ar" is laid out right-to-left.',
    expect: "the comment does not still deny it",
  },
  {
    // 7. THE BLANKET FLIP. One line, mirrors every arrow, and also
    // mirrors the phone, the envelope, the clock and every chart glyph.
    // It satisfies "the arrows are mirrored" and is the exact thing the
    // prompt forbids in its second sentence.
    name: "every icon is flipped by one blanket rule",
    file: CSS,
    from: '[dir="rtl"] .lucide-arrow-right,',
    to: '[dir="rtl"] svg { transform: scaleX(-1); }\n[dir="rtl"] .lucide-arrow-right,',
    expect: "there is no blanket svg flip",
  },
  {
    // 7b. A NON-POINTER JOINS THE NAMED LIST. Written as a separate
    // mutation because the first draft combined the two and only the
    // blanket clause fired — a mutation that is caught by the wrong
    // clause leaves the other one unmeasured, which is how a suite
    // reports 15 of 15 while a check nobody exercises rots.
    name: "the phone is added to the flip list",
    file: CSS,
    from: '[dir="rtl"] .lucide-arrow-right,',
    to: '[dir="rtl"] .lucide-phone,\n[dir="rtl"] .lucide-trending-up,\n[dir="rtl"] .lucide-arrow-right,',
    expect: "nothing that does not point is in the flip list",
  },
  {
    // 8. A POINTER DROPS OUT of the named list. The one that breaks is
    // the one nobody re-reads the list for.
    name: "chevron-right is dropped from the flip list",
    file: CSS,
    from: '[dir="rtl"] .lucide-chevron-right,\n',
    to: "",
    expect: "every pointing icon in use is in the flip list",
  },
  {
    // 9. THE DRAWER GOES BACK TO THE PHYSICAL LEFT. This is the
    // honeypot's shape inside the app: unreachable in ltr, 256px of
    // sideways scroll in rtl.
    name: "the mobile drawer is pinned to the physical left again",
    file: SIDEBAR,
    from: "fixed inset-y-0 start-0 z-50 w-64",
    to: "fixed inset-y-0 left-0 z-50 w-64",
    expect: "the mobile drawer hangs off the leading edge",
  },
  {
    // 10. THE DRAWER PARKS ON THE WRONG SIDE. start-0 is right and the
    // slide-out is still physical, so in Arabic the closed drawer sits
    // ON SCREEN across the content. Half a fix looks like a fix.
    name: "the drawer keeps a physical slide-out direction",
    file: SIDEBAR,
    from: '"-translate-x-full rtl:translate-x-full md:rtl:translate-x-0"',
    to: '"-translate-x-full"',
    expect: "slides out to the correct side in a mirrored page",
  },
  {
    // 10b. THE FIX THAT BROKE THE LAPTOP. rtl:translate-x-full outranks
    // md:translate-x-0, so the mirrored slide-out kept applying at widths
    // where the sidebar is permanent and pushed it off the screen. The
    // browser found this; no reading of the source did. Half a fix that
    // moves the damage to another width is the shape worth a mutation of
    // its own.
    name: "the mirrored slide-out is not reset at the desktop breakpoint",
    file: SIDEBAR,
    from: '"-translate-x-full rtl:translate-x-full md:rtl:translate-x-0"',
    to: '"-translate-x-full rtl:translate-x-full"',
    expect: "stops sliding at the breakpoint where the sidebar becomes permanent",
  },
  {
    // 11. THE RAIL MOVES ITS OFFSET AND NOT ITS CORNERS — the partial
    // mirror. The bar lands on the right wall with its rounded side
    // facing into it.
    name: "the nav rail flips its offset but keeps its rounded corners",
    file: CSS,
    from: "  border-radius: 9999px 0 0 9999px;\n}",
    to: "  border-radius: 0 9999px 9999px 0;\n}",
    expect: "and so did the rounded corners",
  },
  {
    // 12. THE MIRRORED KEYFRAMES STOP MIRRORING — and only in ONE of the
    // two frames, which is what a copy-paste that forgot a sign actually
    // looks like. This is the mutation that walked through the first
    // version of the gate: the clause searched for +8px anywhere after
    // the keyframes name, the untouched 100% frame supplied it, and an
    // animation moving both ways at once passed. The clause now reads
    // every horizontal step in the block.
    name: "one frame of the mirrored row animation keeps the original sign",
    file: CSS,
    from: "  45% { opacity: 0; transform: translateX(8px); max-height: var(--row-h, 200px); }",
    to: "  45% { opacity: 0; transform: translateX(-8px); max-height: var(--row-h, 200px); }",
    expect: "EVERY horizontal step in the twin moves the other way",
  },
  {
    // 13. THE GLOW ORB GOES BACK TO A NEGATIVE PHYSICAL OFFSET, in a
    // parent that does not clip it — the prompt's rule 3, in the app.
    name: "a GlowOrb is placed at a negative physical offset again",
    file: HEADER,
    from: '<GlowOrb className="-start-8 -top-16 -z-10 h-40 w-40" />',
    to: '<GlowOrb className="-left-8 -top-16 -z-10 h-40 w-40" />',
    expect: "no GlowOrb is placed with a negative physical offset",
  },
  {
    // 14. THE CATALOGUE STOPS REACHING THE MODELS. The section is still
    // in the file, still readable by this gate, and no longer
    // interpolated into the prompt — so the app obeys a rule it has
    // stopped handing out. A gate that reads a string it never sends is
    // measuring itself.
    name: "the writing-direction section is no longer sent to models",
    file: BUILDER,
    from: "${WRITING_DIRECTION_SECTION}",
    to: "",
    expect: "it is still in the system prompt",
  },
  {
    // 15. THE RATCHET IS SET TO THE SIZE OF THE PROBLEM. This repository
    // has shipped that defect before (docs/shapes.md), so the ceiling has
    // to be tight enough that re-introducing physical utilities trips it.
    name: "physical reading-order utilities come back in a component",
    file: SIDEBAR,
    from: 'className="flex items-center"',
    to: 'className="flex items-center text-left ml-2 pl-4 pr-4 border-l"',
    expect: "physical reading-order utilities remain",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("rtl mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
