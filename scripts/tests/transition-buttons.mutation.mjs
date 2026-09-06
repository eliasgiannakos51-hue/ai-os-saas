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
const ROUTE = "src/app/api/transitions/detect/route.ts";
const RECORD = "src/app/api/transitions/record/route.ts";
const EL = "messages/el.json";

const MUTANTS = [
    {
    // THE PRECONDITION, REMOVED FROM THE CLIENT. Without it every answer
    // the free reader cannot place becomes a paid request — which is the
    // difference between a feature that costs a fraction of a credit
    // occasionally and one that costs a credit on most messages.
    name: "the client stops checking whether the free reader already placed the answer",
    file: BUTTON,
    from: "if (free || !worthPaidDetection(text) || !hasActionCue(text)) return;",
    to: "if (!worthPaidDetection(text) || !hasActionCue(text)) return;",
    expect: "does not ask when the free reader already placed",
  },
  {
    // AND FROM THE SERVER, which is the half a hand-written POST meets.
    name: "the route stops running the free reader before it charges",
    file: ROUTE,
    from: "    const free = detectTransition(answer);",
    to: "    const free = null;",
    expect: "runs the free reader itself and charges nothing",
  },
  {
    // THE ACTION CUE, REMOVED. Every plain factual answer in the product
    // then reaches a model — the corpus is what says so out loud.
    name: "the paid detector fires on answers that point nowhere",
    file: BUTTON,
    from: "|| !hasActionCue(text)) return;",
    to: ") return;",
    expect: "answer that points nowhere at all",
  },
  {
    // THE CUE LIST GOES BACK TO BEING A COPY OF THE POINTING LIST, which
    // is what its own comment claimed it was not while it was. Four of
    // the five paraphrased suggestions stopped reaching the model.
    name: "hasActionCue becomes a copy of pointsSomewhere again",
    file: LIB,
    from: "  if (SUGGESTION_SUBSTRINGS.some((c) => folded.includes(c))) return true;\n  return boundedPattern(stem(...SUGGESTION_STEMS)).test(folded);",
    to: "  return false;",
    expect: "reaches the outcome it declares",
  },
  {
    // "in the" COMES BACK. It is in almost every English sentence ever
    // written, and it grew a Deep Research button on a plain fact.
    name: "a preposition goes back into the pointing cues",
    file: LIB,
    from: '"head to", "go to",',
    to: '"head to", "go to", "in the",',
    expect: "reaches the outcome it declares",
  },
  {
    // THE FLAT CHARACTER FLOOR. Forty is a short English sentence and a
    // whole Japanese one.
    name: "the paid floor stops being script-aware",
    file: LIB,
    from: "  const floor = CJK_PATTERN.test(text) ? 16 : 40;",
    to: "  const floor = 40;",
    expect: "reaches the outcome it declares",
  },
  {
    // A HEDGED ANSWER DRAWS A BUTTON. A false button costs more than a
    // missing one, and `confident` is the only thing enforcing that.
    name: "the route accepts an unconfident answer",
    file: ROUTE,
    from: "      chosen = named && raw.confident === true ? named.id : null;",
    to: "      chosen = named ? named.id : null;",
    expect: "a hedged answer produces no button",
  },
  {
    // THE MODEL'S ANSWER IS TRUSTED. The enum in a tool schema is a
    // request, not a guarantee.
    name: "the route trusts the model's destination string",
    file: ROUTE,
    from: "      const named = typeof raw.destination === \"string\" ? destinationById(raw.destination) : null;",
    to: "      const named = typeof raw.destination === \"string\" ? { id: raw.destination } : null;",
    expect: "put back through the closed list",
  },
  {
    // NOTHING IS RESERVED. The call still happens and still costs real
    // money; only the account stops paying for it.
    name: "the paid call stops reserving credits",
    file: ROUTE,
    from: "      const reservation = await reserveCredits(user.id, estimate.reserveCredits, \"transition_detect\", {",
    to: "      const reservation = await Promise.resolve({ ok: true, reservationId: \"\" }) as any; void ((\"transition_detect\") && {",
    expect: "it reserves",
  },
  {
    // THE PROMPT STOPS SAYING THE LANGUAGE DOES NOT MATTER. A classifier
    // that quietly only worked on English answers would look identical in
    // every log this app keeps.
    name: "the prompt drops the sentence that makes it language-independent",
    file: ROUTE,
    from: "THE LANGUAGE OF THE ANSWER DOES NOT MATTER.",
    to: "Answers are usually in English.",
    expect: "tells the model the language does not matter",
  },
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
  {
    // THE DEFECT THAT ACTUALLY SHIPPED IN THE FIRST DRAFT OF BOTH ROUTES,
    // put back one string at a time. Six English sentences sat in bodies
    // nothing renders, under comments that cited api/nav/track — which
    // returns a bare status for this exact case and writes out why. The
    // gate that found it was i18n-coverage's ratchet, one layer away and
    // with the reason gone by the time it fired; this clause is the one
    // that should find it.
    name: "an English sentence goes back into a body nobody renders (record)",
    file: RECORD,
    from: 'reason: "unknown_destination" }, { status: 400 }',
    to: 'error: "Unknown destination." }, { status: 400 }',
    expect: "neither transition route answers with an English sentence",
  },
  {
    // AND ON THE OTHER ROUTE, because a check written against one file
    // and a list of two is a check that passes when the second file is
    // the one that regresses.
    name: "...and into the paid route's 401",
    file: ROUTE,
    from: 'reason: "unauthenticated" }, { status: 401 }',
    to: 'error: "Not authenticated." }, { status: 401 }',
    expect: "neither transition route answers with an English sentence",
  },
  {
    // THE OTHER HALF OF THE FIX. Deleting the sentence is only right
    // because a code took its place: without one, the two 400s on the
    // record route become indistinguishable to a curl, and "it rejected
    // my POST" stops being answerable.
    name: "the sentences are deleted and nothing replaces them",
    file: RECORD,
    from: '{ ok: false, reason: "unknown_source_or_outcome" }',
    to: '{ ok: false }',
    expect: "none is a bare status",
  },
  {
    // TWO REFUSALS, ONE WORD. A code that cannot tell the two 400s apart
    // is exactly as useful to a curl as the bare status the first clause
    // already forbids — so the distinctness is its own mutation rather
    // than a property assumed to follow from the presence check.
    name: "two different refusals answer with the same code",
    file: RECORD,
    from: 'reason: "unknown_source_or_outcome"',
    to: 'reason: "unknown_destination"',
    expect: "with a different code per refusal",
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
console.log(
  "A dead end, a noisy detector, three broken scripts, an unrendered button and an\n" +
    "English sentence in a body nobody reads are each red."
);
