#!/usr/bin/env node
/*
 * CAN transition-buttons.test.mjs SEE THE BUTTON GO WRONG?
 *
 * The feature can fail in four directions and each one looks fine from
 * the other three: a destination that is not a reachable page, a detector
 * that fires on everything, a detector that fires on nothing, and a
 * button that is perfect and rendered nowhere. Three of the mutations
 * below break the DETECTOR in the specific way each non-Latin script
 * really broke on the first draft — the Greek final sigma, the missing
 * word boundary in Japanese and Chinese, the Arabic article — because a
 * check that only ever saw English would have passed all three.
 *
 * Run: node scripts/tests/transition-buttons.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/transition-buttons.test.mjs";
const LIB = "src/lib/transitions/destinations.ts";
const BUTTON = "src/components/transitions/transition-button.tsx";
const CHAT = "src/components/chat/chat-workspace.tsx";
const EL = "messages/el.json";

const MUTANTS = [
  {
    // 1. A DESTINATION THE SIDEBAR HIDES. The button would work and would
    // teach nothing: the user could never find that page again alone.
    name: "a destination points at a page the sidebar does not draw",
    file: LIB,
    from: 'href: "/dashboard/coding",',
    to: 'href: "/dashboard/data-analysis",',
    expect: "every destination is a row the sidebar actually draws",
  },
  {
    // 2. THE TWO-CUE RULE, REMOVED. Without the pointing cue, "here is the
    // code you asked for" grows a button telling you to go and write some.
    name: "the pointing cue stops being required, so any mention fires",
    file: LIB,
    from: "  if (!pointsSomewhere(folded)) return null;",
    to: "  if (false) return null;",
    expect: "no button under an answer that only mentions the topic",
  },
  {
    // 3. THE GREEK FINAL SIGMA. foldForMatch turns ς into σ, so a cue
    // spelled the way a Greek speaker writes it matches nothing. This is
    // the defect the first draft shipped, measured rather than imagined.
    name: "the Greek pointing cue is written unfolded again (ς, not σ)",
    file: LIB,
    from: '"μπορεισ", "δοκιμασ",',
    to: '"μπορεις", "δοκιμασ",',
    expect: "a pointing sentence is placed in all",
  },
  {
    // 4. THE MISSING WORD BOUNDARY. 代码 and コード sit inside a sentence
    // with no separator anywhere, so a bounded pattern finds nothing.
    // Requiring CJK to go through the bounded path disables the feature in
    // two languages and in no others.
    name: "the substring path is removed, so scripts with no word boundary never match",
    file: LIB,
    from: "  if (destination.substrings.some((c) => folded.includes(c))) return true;",
    to: "  if (false) return true;",
    expect: "a pointing sentence is placed in all",
  },
  {
    // 5. THE LENGTH FLOOR THAT ONLY APPLIES TO LATIN. Twenty characters is
    // a short English sentence and a whole Chinese one.
    name: "the length floor goes back to twenty characters",
    file: LIB,
    from: "  if (!text || text.length < 8) return null;",
    to: "  if (!text || text.length < 20) return null;",
    expect: "a pointing sentence is placed in all",
  },
  {
    // 6. AN HREF BUILT FROM TEXT. The entire safety answer to "what if it
    // picks the wrong destination" is that it cannot pick an address.
    name: "a destination assembles its href at runtime",
    file: LIB,
    from: 'href: "/dashboard/agents",',
    to: "href: `/dashboard/${\"agents\"}`,",
    expect: "no href in the detector is assembled at runtime",
  },
  {
    // 7. THE LABEL, UNTRANSLATED. A key that resolves in English only is
    // an English button in ten languages — the defect this same round
    // fixed in lib/next-step-suggestions.ts.
    name: "a button label is the English string copied into Greek",
    file: EL,
    from: '"coding": "Άνοιξε στον Κώδικα"',
    to: '"coding": "Open in Code"',
    expect: "none of them is the English string copied",
  },
  {
    // 8. THE KEY THAT RESOLVES NOWHERE.
    name: "a button label key is misspelt",
    file: LIB,
    from: 'labelKey: "dashboard.transitions.agents",',
    to: 'labelKey: "dashboard.transitions.agent",',
    expect: "every label resolves in all ten locales",
  },
  {
    // 9. THE COMPONENT STOPS TRANSLATING. A perfect key rendered raw.
    name: "the button renders its label key instead of the label",
    file: BUTTON,
    from: "{t(destination.labelKey)}",
    to: "{destination.labelKey}",
    expect: "the label goes through a translator",
  },
  {
    // 10. WIRED NOWHERE. The component is complete and nothing renders it,
    // which this project has shipped before and which no check on the
    // component alone can see.
    name: "the chat stops rendering the button",
    file: CHAT,
    from: "<TransitionButton text={msg.content} />",
    to: "",
    expect: "the chat renders it on the finished answer",
  },
  {
    // 11. ON THE STREAMING ANSWER. Half a sentence points nowhere, and
    // the destination would flicker as the text arrived.
    name: "the button is put on the answer that is still streaming",
    file: CHAT,
    from: "<MessageContent content={streamingText} className=\"leading-relaxed\" />",
    to: "<MessageContent content={streamingText} className=\"leading-relaxed\" />\n                      <TransitionButton text={streamingText} />",
    expect: "never on the one still streaming",
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

console.log("transition-buttons mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
console.log("A dead end, a noisy detector, three broken scripts and an unrendered button are each red.");
