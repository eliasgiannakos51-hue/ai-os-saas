/*
 * FROM THE MICROPHONE, NOTHING HAPPENS UNTIL THE PERSON SAYS YES.
 *
 * Run: node scripts/tests/voice-command.test.mjs
 *
 * The owner's rule for voice commands: never an irreversible action from
 * voice without a confirmation. On the Home field "irreversible" is two
 * things - spending credits, and the paid classifier (/api/create) filing
 * an entry - and a transcript is words the person has not read yet.
 *
 * Held three ways, each by what the code DOES:
 *   1. the router, on sentences as a person says them, so "φτιάξε μου ένα
 *      σάιτ" reaches the Website Builder and "πρόσθεσε έξοδο 50 ευρώ"
 *      reaches the card that asks first;
 *   2. the state machine in src/lib/voice/voice-command.ts, driven through
 *      every event from every state: "confirmed" is reachable from "heard"
 *      by CONFIRM and by nothing else;
 *   3. the wiring in src/components/create/create-chat.tsx, read with its
 *      comments stripped: the microphone's handler reports and never
 *      sends, and the only spoken path to /api/create is the card's Yes.
 */
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
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const vc = await loadTs("src/lib/voice/voice-command.ts");
const show = (p) => (p.kind === "open" ? "open " + p.producer : p.kind === "question" ? "question [" + p.choices.join(",") + "]" : p.kind);

// ---------------------------------------------------------------------
console.log("== 1. the router, on sentences as they are spoken ==");
// Each is what the card should offer. The "classify" ones are not
// failures of the router: they name no tool, and from the microphone they
// get the card that asks before anything is spent or filed.
const SPOKEN = [
  ["φτιάξε site για καφετέρια", "open website"],
  // Whisper writes "site" said in Greek as Greek letters.
  ["φτιάξε μου ένα σάιτ για την καφετέρια μου", "open website"],
  ["θέλω μια ιστοσελίδα για το κομμωτήριο", "open website"],
  ["θέλω ένα e-shop για τα κοσμήματά μου", "open website"],
  ["κάνε μια παρουσίαση για τον πελάτη", "open presentation"],
  ["γράψε ανάρτηση για το instagram", "open posts"],
  ["γράψε κώδικα που διαβάζει ένα csv", "open coding"],
  ["φτιάξε έναν agent που απαντάει στα email", "open agent"],
  ["build a website for my bakery", "open website"],
  ["make a presentation about our autumn menu", "open presentation"],
  ["write an instagram post about our new hours", "open posts"],
  ["φτιάξε site και παρουσίαση", "question [website,presentation]"],
  // The keyboard's apostrophe and Whisper's: both are elision, not a quote.
  ["κάν' το", "question []"],
  ["τι πούλησα αυτόν τον μήνα", "classify"],
  // THE DANGEROUS ONE: a write, by voice. It must reach the asking card.
  ["πρόσθεσε έξοδο 50 ευρώ για καύσιμα", "classify"],
];
for (const [said, expect] of SPOKEN) {
  const got = show(vc.preflight(said));
  check(`"${said}" -> ${expect}`, got === expect, `got: ${got}`);
}

// ---------------------------------------------------------------------
console.log("\n== 2. the state machine: confirmed only by CONFIRM, only from heard ==");
const heardOpen = vc.voiceStep(vc.VOICE_IDLE, { type: "TRANSCRIBED", transcript: "φτιάξε site για καφετέρια" });
const heardSend = vc.voiceStep(vc.VOICE_IDLE, { type: "TRANSCRIBED", transcript: "πρόσθεσε έξοδο 50 ευρώ για καύσιμα" });
const confirmed = vc.voiceStep(heardSend, { type: "CONFIRM" });
const STATES = { idle: vc.VOICE_IDLE, "heard (open)": heardOpen, "heard (classify)": heardSend, confirmed };
const EVENTS = {
  "TRANSCRIBED": { type: "TRANSCRIBED", transcript: "πρόσθεσε έξοδο 50 ευρώ" },
  "TRANSCRIBED empty": { type: "TRANSCRIBED", transcript: "   " },
  CONFIRM: { type: "CONFIRM" },
  EDIT: { type: "EDIT" },
  CANCEL: { type: "CANCEL" },
  DONE: { type: "DONE" },
};
check("a transcript is heard, not acted on", heardSend.kind === "heard" && heardSend.plan.kind === "classify", JSON.stringify(heardSend));
check("Yes on a heard sentence confirms that sentence's plan",
  confirmed.kind === "confirmed" && confirmed.plan === heardSend.plan, JSON.stringify(confirmed));

const reached = [];
for (const [sName, s] of Object.entries(STATES)) {
  for (const [eName, e] of Object.entries(EVENTS)) {
    const next = vc.voiceStep(s, e);
    // A transition INTO confirmed (staying confirmed is not a new action).
    if (next.kind === "confirmed" && s.kind !== "confirmed") reached.push(`${sName} --${eName}-->`);
  }
}
check("TRANSCRIBED never confirms, from any state",
  !reached.some((r) => r.includes("TRANSCRIBED")), reached.join(" | "));
check("CONFIRM does nothing without something heard",
  vc.voiceStep(vc.VOICE_IDLE, { type: "CONFIRM" }).kind === "idle");
check("confirmed is entered from heard by CONFIRM and by nothing else",
  reached.length === 2 && reached.every((r) => r.startsWith("heard") && r.endsWith("--CONFIRM-->")), reached.join(" | "));
check("EDIT, CANCEL and DONE always go back to idle",
  Object.values(STATES).every((s) => ["EDIT", "CANCEL", "DONE"].every((e) => vc.voiceStep(s, EVENTS[e]).kind === "idle")));
check("an empty transcript changes nothing",
  Object.values(STATES).every((s) => vc.voiceStep(s, EVENTS["TRANSCRIBED empty"]) === s));
const withPhoto = vc.voiceStep(vc.VOICE_IDLE, { type: "TRANSCRIBED", transcript: "φτιάξε site για καφετέρια", withImages: true });
check("with a photo attached the sentence goes to the asking card, so the photo is not dropped",
  withPhoto.kind === "heard" && withPhoto.plan.kind === "classify", JSON.stringify(withPhoto.plan));

// ---------------------------------------------------------------------
console.log("\n== 3. the wiring on the Home field ==");
const chat = stripComments(readFileSync("src/components/create/create-chat.tsx", "utf8"));

/** The text of the balanced block that opens at the first `open` after `from`. */
function block(src, from, open = "{", close = "}") {
  const start = src.indexOf(from);
  if (start < 0) return "";
  const i = src.indexOf(open, start + from.length - 1);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close && --depth === 0) return src.slice(i, j + 1);
  }
  return "";
}

const onTranscript = block(chat, "onTranscript={");
check("the microphone's handler exists and reports what it heard",
  onTranscript.includes('type: "TRANSCRIBED"'), onTranscript.slice(0, 200));
const forbidden = ["sendToClassifier", "submit(", "router.push", "handleSubmit", "fetch("].filter((f) => onTranscript.includes(f));
check("the microphone's handler never sends and never navigates", forbidden.length === 0, "found: " + forbidden.join(", "));

const sendCard = block(chat, '{voice.kind === "heard" && voice.plan.kind === "classify" && (', "(", ")");
const openCard = block(chat, '{voice.kind === "heard" && voice.plan.kind === "open" && (', "(", ")");
const askCard = block(chat, '{voice.kind === "heard" && voice.plan.kind === "question" && (', "(", ")");
check("there is a card for each of the three readings", [sendCard, openCard, askCard].every(Boolean));
check("every card from the microphone says what it heard",
  [sendCard, openCard, askCard].every((c) => c.includes("heard={voice.transcript}")));

const sendConfirm = block(sendCard, "onConfirm={");
check("a spoken sentence that names no tool is sent only by the card's Yes",
  sendConfirm.includes("sendToClassifier(") && sendConfirm.includes('type: "CONFIRM"'), sendConfirm.slice(0, 240));
const sendCalls = chat.split("sendToClassifier(").length - 1 - (chat.includes("async function sendToClassifier(") ? 1 : 0);
check("the paid path has exactly two callers: typed Send and that Yes", sendCalls === 2, `${sendCalls} call sites`);

for (const [name, card, handler] of [["open", openCard, "onConfirm={"], ["question", askCard, "onPick={"]]) {
  const h = block(card, handler);
  const pushes = card.split("router.push").length - 1;
  check(`opening a tool from the microphone (${name}) happens only inside its click, after CONFIRM`,
    pushes === 1 && h.includes("router.push") && h.indexOf('type: "CONFIRM"') >= 0 && h.indexOf('type: "CONFIRM"') < h.indexOf("router.push"),
    `${pushes} push(es); handler: ${h.slice(0, 200)}`);
}

// ONE CONFIRMATION, NOT TWO - and only where the card exists. VoiceInput
// normally shows its own editable draft; review="card" hands the text on
// at once because the parent quotes it and asks. The population is every
// .tsx under src/, so a second caller that skips the draft without a card
// of its own goes red here.
const { readdirSync, statSync } = await import("node:fs");
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = `${d}/${n}`;
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
});
const skipsDraft = walk("src").filter((f) => /review="card"/.test(stripComments(readFileSync(f, "utf8"))));
check("only the Home field skips the transcript dialog, because only it has the card",
  skipsDraft.length === 1 && skipsDraft[0] === "src/components/create/create-chat.tsx", skipsDraft.join(", ") || "(none)");
const input = stripComments(readFileSync("src/components/voice/voice-input.tsx", "utf8"));
check("VoiceInput still shows its draft to every other caller",
  /review = "dialog"/.test(input) && /review === "card"/.test(input) && /setDraft\(heard\)/.test(input));

check("typed and spoken text are read by the same decision",
  block(chat, "async function handleSubmit(").includes("preflight(") &&
    !chat.includes("matchProducer(") && !chat.includes("assessAmbiguity("));

// ---------------------------------------------------------------------
console.log("\n== 4. the card's words, in every language ==");
const LOCALES = ["en", "el", "de", "es", "fr", "it", "pt", "ar", "ja", "zh"];
for (const l of LOCALES) {
  const g = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard?.goal ?? {};
  check(`${l}: says what it heard and what Yes will cost`,
    String(g.heard ?? "").includes("{heard}") && String(g.costsNow ?? "").includes("{credits") &&
      ["willHandle", "sendIt", "fix"].every((k) => typeof g[k] === "string" && g[k].length > 0),
    JSON.stringify({ heard: g.heard, costsNow: g.costsNow }));
}
const card = stripComments(readFileSync("src/components/create/goal-preview.tsx", "utf8"));
// From the declaration to the end of the file: the first "{" after the
// name is the props' destructuring, not the body, and block() would stop
// there and see nothing.
const sendCardSrc = card.slice(card.indexOf("export function VoiceSendConfirm("));
check("the asking card shows the cost of Yes, not the cost somewhere else",
  sendCardSrc.length > 0 && sendCardSrc.includes('t("costsNow"') && !sendCardSrc.includes('t("costsThere"'));

console.log(failures.length === 0
  ? `\nALL PASS: ${pass} passed, 0 failed`
  : `\n${failures.length} FAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
