// A BUTTON THAT GOES SOMEWHERE, INSTEAD OF A SENTENCE TELLING YOU TO GO.
//
// When an answer says "for that, use the Code tool", the user is left to
// find the Code tool in a sidebar that is deliberately short. This holds
// the thing that closes that gap, and every clause here exists because
// the same feature can fail in a way that looks fine:
//
//   · A DESTINATION THAT IS NOT A PAGE. The whole safety model is that
//     the href comes from a closed list rather than from any text, so
//     every entry in that list has to be a route that exists AND a row
//     somebody could also have found by hand.
//   · A DETECTOR THAT FIRES ON EVERYTHING. "Here is the code you asked
//     for" is not an instruction to go anywhere. Precision is checked
//     with negatives, not asserted.
//   · A DETECTOR THAT FIRES ON NOTHING. A scan that finds no match
//     reports the same clean line whether the reader works or is broken,
//     so the positives are checked in six scripts — including the three
//     where a word boundary does not exist.
//   · A LABEL NOBODY TRANSLATED. The button is words; a key that
//     resolves in English only is an English button in ten languages,
//     which is the exact defect this round fixed in
//     lib/next-step-suggestions.ts.
//
// Run: node scripts/tests/transition-buttons.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
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

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const resolve = (locale, key) => key.split(".").reduce((o, p) => (o == null ? o : o[p]), messages[locale]);

// The real module, executed. A gate that read this file as text could not
// tell a working detector from a broken one.
const { TRANSITION_DESTINATIONS, TRANSITION_IDS, detectTransition, destinationById } = await loadTs(
  "src/lib/transitions/destinations.ts"
);

console.log("transition-buttons");

// ---------------------------------------------------------------------
console.log("\n== 1. every destination is a real, reachable page ==");
check(`the registry has destinations (${TRANSITION_DESTINATIONS.length})`, TRANSITION_DESTINATIONS.length >= 5);

const nav = stripComments(readFileSync("src/lib/sidebar-nav.ts", "utf8"));
// DRAWN, NOT MERELY PRESENT. Pointing at a page the sidebar hides is a
// button that teaches somebody nothing about where things live — they
// would never find it again on their own.
const drawnHrefs = new Set(
  [...nav.matchAll(/\{[^{}]*href:\s*"([^"]+)"[^{}]*\}/gs)]
    .filter((m) => !/hidden:\s*true/.test(m[0]))
    .map((m) => m[1])
);
check(`the sidebar's drawn rows were read (${drawnHrefs.size})`, drawnHrefs.size >= 15, [...drawnHrefs].join(", "));
const unreachable = TRANSITION_DESTINATIONS.filter((d) => !drawnHrefs.has(d.href));
check(
  "every destination is a row the sidebar actually draws",
  unreachable.length === 0,
  unreachable.map((d) => `${d.id} -> ${d.href}`).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. the label on every button is translated ==");
const missing = [];
for (const d of TRANSITION_DESTINATIONS) {
  if (!/^[a-z][\w]*(\.[\w]+)+$/.test(d.labelKey)) missing.push(`${d.id}: labelKey is not a dotted key`);
  for (const locale of LOCALES) {
    const value = resolve(locale, d.labelKey);
    if (typeof value !== "string" || value.length === 0) missing.push(`${locale}: ${d.labelKey}`);
  }
}
check(`every label resolves in all ten locales (${TRANSITION_DESTINATIONS.length} buttons)`, missing.length === 0, missing.join("\n        "));
// AND NOT THE ENGLISH ONE NINE TIMES. A key that exists in ten files with
// the English string in nine of them satisfies the check above and is the
// failure V5 item 5 names.
const untranslated = [];
for (const d of TRANSITION_DESTINATIONS) {
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    if (resolve(locale, d.labelKey) === resolve("en", d.labelKey)) untranslated.push(`${locale}: ${d.labelKey}`);
  }
}
check("...and none of them is the English string copied", untranslated.length === 0, untranslated.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 3. it fires on a real suggestion, in six scripts ==");
// EVERY LANGUAGE FAMILY THE APP SHIPS, and the three at the end are the
// reason this section exists rather than one English case: a word
// boundary does not exist in Japanese or Chinese, and Arabic writes its
// article onto the noun. All three returned null on the first draft.
const POSITIVE = [
  ["en", "You can open the Code tool for that snippet.", "coding"],
  ["el", "Μπορείς να το κάνεις στον Κώδικα.", "coding"],
  ["de", "Du kannst den Website-Builder dafür nutzen.", "websiteBuilder"],
  ["fr", "Vous pouvez créer un agent pour cela.", "agents"],
  ["es", "Puedes usar el sitio web para eso.", "websiteBuilder"],
  ["ja", "コードはこちらで開けます。", "coding"],
  ["zh", "你可以打开代码工具试试。", "coding"],
  ["ar", "يمكنك استخدام أداة الشفرة لذلك.", "coding"],
];
const wrong = POSITIVE.filter(([, text, want]) => (detectTransition(text)?.id ?? null) !== want);
check(
  `a pointing sentence is placed in all ${POSITIVE.length} of them`,
  wrong.length === 0,
  wrong.map(([l, t, want]) => `${l}: wanted ${want}, got ${detectTransition(t)?.id ?? "null"} — ${t}`).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 4. and NOT on an answer that merely mentions the word ==");
// THE TWO-CUE RULE, WHICH IS THE ONLY THING KEEPING THIS QUIET. A topic
// word alone is not a suggestion; every negative below contains one.
const NEGATIVE = [
  "Here is the code you asked for: const x = 1;",
  "The research shows revenue grew 12% last quarter.",
  "Ο κώδικας που ζήτησες είναι παρακάτω.",
  "这是你要的代码。",
  "",
  "code",
];
const noisy = NEGATIVE.filter((t) => detectTransition(t) !== null);
check(
  `no button under an answer that only mentions the topic (${NEGATIVE.length} cases)`,
  noisy.length === 0,
  noisy.map((t) => `${t} -> ${detectTransition(t)?.id}`).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 5. the id can only ever come from the closed list ==");
check("an unknown id resolves to nothing", destinationById("../../etc/passwd") === null);
check("...and so does an empty one", destinationById("") === null);
check(
  `every id in the list resolves to itself (${TRANSITION_IDS.length})`,
  TRANSITION_IDS.length > 0 && TRANSITION_IDS.every((id) => destinationById(id)?.id === id)
);
// NO HREF IS EVER BUILT FROM TEXT. The safety model is one line, so it is
// checked as one line rather than described.
const src = stripComments(readFileSync("src/lib/transitions/destinations.ts", "utf8"));
check(
  "no href in the detector is assembled at runtime",
  !/href:\s*`/.test(src) && !/href:\s*[\w.]+\s*\+/.test(src),
  "a template or a concatenation here would be a destination the closed list never approved"
);

// ---------------------------------------------------------------------
console.log("\n== 6. one button, and it navigates ==");
const button = stripComments(readFileSync("src/components/transitions/transition-button.tsx", "utf8"));
check("the component renders at most one destination", !/\.map\(/.test(button));
check(
  "it is a Link, never a form or a fetch",
  /<Link\b/.test(button) && !/fetch\(/.test(button) && !/<form/.test(button)
);
check("the label goes through a translator", /\{t\(destination\.labelKey\)\}/.test(button));
check(
  "it can be dismissed",
  /setDismissed\(true\)/.test(button) && /dismissed\) return null/.test(button)
);
// AND IT IS WIRED. A perfect component nobody renders is the same as no
// component, and this project has shipped exactly that before.
const workspace = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check(
  "the chat renders it on the finished answer",
  /<TransitionButton text=\{msg\.content\}/.test(workspace),
  "not wired into chat-workspace.tsx"
);
check(
  "...and never on the one still streaming",
  !/<TransitionButton text=\{streamingText\}/.test(workspace),
  "half a sentence points nowhere"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
