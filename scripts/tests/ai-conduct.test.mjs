// Coverage test for the shared conduct block (lib/ai-conduct.ts):
// safety boundaries (referral / absolute limits / anti-over-restriction)
// and empathy, appended to EVERY user-facing AI system prompt.
//
// What can silently go wrong here is drift and omission: a feature added
// without the block, or the block edited until one of its three layers
// disappears. Every check below is about that.
//
// Run: node scripts/tests/ai-conduct.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const m = await loadTs("src/lib/ai-conduct.ts");
const {
  AI_SAFETY_BOUNDARIES_EL,
  AI_SAFETY_BOUNDARIES_EN,
  AI_EMPATHY_EL,
  AI_EMPATHY_EN,
  AI_CONDUCT_EL,
  AI_CONDUCT_EN,
  AI_SAFETY_COMPACT_EL,
} = m;

console.log("== 1. the three layers exist, in BOTH languages ==");
for (const [lang, block] of [["EL", AI_SAFETY_BOUNDARIES_EL], ["EN", AI_SAFETY_BOUNDARIES_EN]]) {
  const has = (re) => re.test(block);
  check(`${lang}: referral covers health + legal + financial`, /ΥΓΕΙΑ|HEALTH/.test(block) && /ΝΟΜΙΚΑ|LEGAL/.test(block) && /ΟΙΚΟΝΟΜΙΚΑ|FINANCIAL/.test(block));
  check(`${lang}: referral is education + disclaimer, NOT refusal`, /ΜΗΝ αρνηθείς το θέμα|do NOT refuse the topic/.test(block));
  check(`${lang}: the explicit specialist recommendation is verbatim`, /Δεν είμαι γιατρός\/δικηγόρος\/λογιστής|I'm not a doctor\/lawyer\/accountant/.test(block));
  check(`${lang}: never personalized diagnosis/legal opinion/investment advice`, /ΠΟΤΕ εξατομικευμένη|NEVER a personalized/.test(block));
  check(`${lang}: absolute limits — weapons/explosives/chem-bio`, has(/όπλα|weapons/) && has(/εκρηκτικά|explosives/) && has(/βιολογικ|biological/));
  check(`${lang}: absolute limits — sexual content, minors, malware/hacking/phishing, illegal`,
    has(/σεξουαλικό|sexual/i) && has(/ανηλίκ|minors/i) && has(/hacking/i) && has(/phishing/i) && has(/παράνομ|illegal/i));
  check(`${lang}: anti-over-restriction — history incl. violent events`, /ιστορικά γεγονότα|historical events/.test(block) && /πόλεμοι|wars/i.test(block) && /γενοκτονίες|genocides/i.test(block));
  check(`${lang}: anti-over-restriction — politics/religion/social with multiple perspectives`, /πολλαπλές οπτικές|multiple perspectives/.test(block));
  check(`${lang}: anti-over-restriction — business risk & hard decisions`, /επιχειρηματικό ρίσκο|business risk/.test(block));
  check(`${lang}: 'refuse only on real harm' is stated`, /πραγματική βλάβη|real harm/.test(block));
}

console.log("\n== 2. empathy: tone adapts, substance stays objective ==");
for (const [lang, block] of [["EL", AI_EMPATHY_EL], ["EN", AI_EMPATHY_EN]]) {
  check(`${lang}: recognizes stressed/frustrated/excited`, /αγχωμένος|stressed/.test(block) && /απογοητευμένος|frustrated/.test(block) && /ενθουσιασμένος|excited/.test(block));
  check(`${lang}: the trade-loss example (no hollow consolation, no cold arithmetic)`, /ψεύτικη παρηγοριά|hollow consolation/.test(block) && /κρύα αριθμητική|cold arithmetic/.test(block));
  check(`${lang}: the flawed-idea example (say the problems honestly)`, /ΕΙΛΙΚΡΙΝΑ|HONESTLY/.test(block));
  check(`${lang}: the stuck example (do not repeat the same answer)`, /μην επαναλάβεις|do not repeat/.test(block));
  check(`${lang}: never fake enthusiasm or agreement-to-please`, /ψεύτικος ενθουσιασμός|fake enthusiasm/.test(block) && /για να ευχαριστήσεις|to please/.test(block));
  check(`${lang}: empathy in the HOW, truth in the WHAT`, /ΠΩΣ|HOW/.test(block) && /ΤΙ|WHAT/.test(block));
}
check("AI_CONDUCT_EL = boundaries + empathy + crisis", AI_CONDUCT_EL === AI_SAFETY_BOUNDARIES_EL + AI_EMPATHY_EL + m.AI_CRISIS_EL);
check("AI_CONDUCT_EN = boundaries + empathy + crisis", AI_CONDUCT_EN === AI_SAFETY_BOUNDARIES_EN + AI_EMPATHY_EN + m.AI_CRISIS_EN);
check("compact variant still allows sensitive-but-legal transformations", /ΔΕΝ είναι όρια/.test(AI_SAFETY_COMPACT_EL));

console.log("\n== 2b. crisis: priority, human tone, and the things it must never do ==");
const { AI_CRISIS_EL, AI_CRISIS_EN, AI_CRISIS_CLASSIFIER_EL, AI_CRISIS_CLASSIFIER_EN } = m;
for (const [lang, block] of [["EL", AI_CRISIS_EL], ["EN", AI_CRISIS_EN]]) {
  const has = (re) => re.test(block);
  check(`${lang}: the task STOPS — priority is stated`, has(/ΣΤΑΜΑΤΑ ό,τι άλλο|STOP whatever else/));
  check(`${lang}: explicitly forbids continuing as if nothing happened`, has(/σαν να μη συνέβη τίποτα|as if nothing happened/));
  check(`${lang}: short + warm + human, NO lists`, has(/Όχι λίστες|No lists/) && has(/ζεστά|warm/));
  check(`${lang}: never "I understand how you feel"`, has(/καταλαβαίνω πώς νιώθεις|I understand how you feel/));
  check(`${lang}: no judging, teaching, lecturing`, has(/ΜΗΝ κρίνεις|Do NOT judge/) && has(/διάλεξη|lecture/));
  check(`${lang}: no generic wellness advice`, has(/γυμναστική|exercise/) && has(/σκέψου θετικά|think positive/));
  check(`${lang}: NEVER methods or means — the absolute line`, has(/μεθόδους, μέσα|methods, means/));
  check(`${lang}: encourages talking to someone, as a question not an order`, has(/μιλήσει σε κάποιον|talk to someone/) && has(/όχι εντολή|not an instruction/));
  check(`${lang}: helplines are CONDITIONAL, not automatic`, has(/όχι αυτόματα|not automatically/));
  check(`${lang}: Greek helplines 1018 and 116 123 are present`, has(/1018/) && has(/116 123/));
  check(`${lang}: refuses to invent a helpline number for other countries`, has(/επινοήσεις αριθμό|inventing a number/));
  check(`${lang}: milder cases handled without treating them as crisis`, has(/ΗΠΙΟΤΕΡΕΣ|MILDER/));
}
for (const [lang, block] of [["EL", AI_CRISIS_CLASSIFIER_EL], ["EN", AI_CRISIS_CLASSIFIER_EN]]) {
  check(`${lang} classifier: refuses to FILE distress into a module`, /module "none"/.test(block));
  check(`${lang} classifier: puts a human reply in the user-facing field`, /"message"/.test(block));
  check(`${lang} classifier: does not mention the app or logging in that reply`, /modules, καταχώρηση|modules, logging/.test(block));
}
check("crisis is LAST in the composed block, so it wins", AI_CONDUCT_EL.endsWith(AI_CRISIS_EL) && AI_CONDUCT_EN.endsWith(AI_CRISIS_EN));

console.log("\n== 2c. distress is never recorded anywhere ==");
// The brief's point 7: no logs, no admin alerts. The one place this could
// leak by accident is chat memory, which is written once and replayed
// into every future conversation forever.
const memSrc = readFileSync("src/lib/chat/memory.ts", "utf8");
// Bound to the GUARANTEE, not to one sentence: an absolute prohibition
// ("ΠΟΤΕ μην") that names distress, self-harm and health. The wording moved
// once already — from "never EXTRACT" to "never INCLUDE IN YOUR ANSWER",
// which is the stronger form — and pinning the old phrasing turned a
// deliberate strengthening into a red build. What must never change is
// that the ban exists and covers these categories.
check(
  "the memory extractor is forbidden from extracting distress/health",
  /ΠΟΤΕ μην[\s\S]{0,80}ψυχική δυσφορία/.test(memSrc) &&
    /αυτοτραυματισμού ή αυτοκτονίας/.test(memSrc) &&
    /ψυχική ή σωματική υγεία/.test(memSrc),
  "the absolute distress/health prohibition is gone from EXTRACTION_SYSTEM_PROMPT"
);
check(
  "...and must answer NONE for such an exchange",
  /σε τέτοια μηνύματα απάντα ΑΚΡΙΒΩΣ: NONE/.test(memSrc)
);
// No crisis detection wired to logging or alerting anywhere.
const { execSync } = await import("node:child_process");
const alertLeaks = execSync(
  `grep -rniE "crisis|self.harm|suicid" src --include=*.ts --include=*.tsx | grep -viE "ai-conduct.ts|memory.ts|^\\s*//" | grep -iE "logApiError|sendMarginAlert|sendEmail|admin|console\\.(log|error|warn)" || true`,
  { encoding: "utf8" }
).trim();
check("no crisis detection is wired to logging or admin alerts", alertLeaks === "", alertLeaks);

console.log("\n== 3. every user-facing AI feature carries the block ==");
// feature file -> the export its system prompt must reference.
const WIRING = {
  "src/app/api/chat/route.ts": "AI_CONDUCT_EL",
  // Moved out of api/create when Create Anything became a background job:
  // the system prompt now lives in the module the WORKER builds it from,
  // because a prompt inside a route handler cannot be shared with one. The
  // requirement is unchanged — it is checked where the prompt is.
  "src/lib/create-studio/route-entry.ts": "AI_CONDUCT_EN",
  "src/app/api/create-studio/detect/route.ts": "AI_SAFETY_BOUNDARIES_EN",
  "src/app/api/records/ask/route.ts": "AI_CONDUCT_EL",
  "src/app/api/text-actions/route.ts": "AI_SAFETY_COMPACT_EL",
  "src/lib/mission-agents.ts": "AI_CONDUCT_EL",
  "src/lib/mission-step-runner.ts": "AI_SAFETY_BOUNDARIES_EN",
  "src/lib/reflection-agent.ts": "AI_CONDUCT_EL",
  "src/lib/website-builder.ts": "AI_SAFETY_BOUNDARIES_EN",
  "src/lib/files/ask.ts": "AI_SAFETY_BOUNDARIES_EN",
  "src/lib/agents/agent-runner.ts": "AI_SAFETY_BOUNDARIES_EN",
  "src/lib/research/research.ts": "AI_SAFETY_BOUNDARIES_EN",
};
for (const [file, symbol] of Object.entries(WIRING)) {
  const src = readFileSync(file, "utf8");
  const imports = new RegExp(`import \\{[^}]*${symbol}[^}]*\\} from "@/lib/ai-conduct"`).test(src);
  // Referenced beyond the import — inside a template literal or array.
  const uses = src.split("\n").some((l) => !l.includes("import") && l.includes(symbol));
  check(`${file} imports and APPENDS ${symbol}`, imports && uses);
}
// Chat must no longer carry its own private copy of the disclaimer —
// that is the drift the shared module exists to end.
check(
  "chat's old local REGULATED_ADVICE_INSTRUCTION is gone",
  !/const REGULATED_ADVICE_INSTRUCTION/.test(readFileSync("src/app/api/chat/route.ts", "utf8"))
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
