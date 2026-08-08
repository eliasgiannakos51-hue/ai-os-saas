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
check("AI_CONDUCT_EL = boundaries + empathy", AI_CONDUCT_EL === AI_SAFETY_BOUNDARIES_EL + AI_EMPATHY_EL);
check("AI_CONDUCT_EN = boundaries + empathy", AI_CONDUCT_EN === AI_SAFETY_BOUNDARIES_EN + AI_EMPATHY_EN);
check("compact variant still allows sensitive-but-legal transformations", /ΔΕΝ είναι όρια/.test(AI_SAFETY_COMPACT_EL));

console.log("\n== 3. every user-facing AI feature carries the block ==");
// feature file -> the export its system prompt must reference.
const WIRING = {
  "src/app/api/chat/route.ts": "AI_CONDUCT_EL",
  "src/app/api/create/route.ts": "AI_CONDUCT_EN",
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
