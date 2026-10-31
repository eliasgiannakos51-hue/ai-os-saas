// WHAT A FILM REALLY COSTS AND HOW LONG IT REALLY TAKES — the honesty
// table of the Films tool (κομμάτι 1), printed rather than typed.
//
// Run: node scripts/film-cost.mjs
//
// Three kinds of number, kept apart, the same way scripts/video-cost.mjs
// and scripts/cinematic-cost.mjs keep them:
//   FROM THE REPO, read at run time: the plans and their credits
//     (src/lib/billing/plans.ts), the USD->EUR rate
//     (src/lib/billing/pricing-config.ts).
//   LOOKED UP, with its date: the provider rates below, which are the
//     SAME figures scripts/video-cost.mjs carries (Kling and Runway
//     2026-10-02, Veo 3.1 2026-10-03, both from secondary sources —
//     ai.google.dev and docs.dev.runwayml.com are blocked from this
//     environment). docs/VIDEO-PROVIDERS.md is where they are argued.
//   ASSUMED, and named as such: how long one clip takes to generate.
//     NOTHING measures this yet — no provider has ever been called from
//     this repo. The wall-clock column is therefore the softest number
//     here, and it is the one that decides whether a 3-hour film is a
//     product or a fantasy.
import { loadTsWithDeps } from "./tests/load-ts.mjs";
import { readFileSync } from "node:fs";

const { PLANS } = await loadTsWithDeps("src/lib/billing/plans.ts");
const cfgSrc = readFileSync("src/lib/billing/pricing-config.ts", "utf8");
const USD_EUR = Number((cfgSrc.match(/usdToEurRate:\s*([0-9.]+)/) || [])[1]);
if (!USD_EUR) throw new Error("could not read usdToEurRate from pricing-config.ts");

// label, provider+model, USD per second of video, seconds per call
const TIERS = [
  ["Πρόχειρο", "Kling 2.5 Turbo 720p", 0.042, 10],
  ["Κανονική", "Veo 3.1 Fast 1080p", 0.12, 8],
  ["Υψηλή", "Veo 3.1 Fast 4K", 0.3, 8],
  ["Μέγιστη", "Veo 3.1 Standard 4K", 0.6, 8],
];
const DURATIONS = [["1 λεπτό", 60], ["10 λεπτά", 600], ["1 ώρα", 3600], ["3 ώρες", 10800]];

// ASSUMED: minutes of wall clock to generate one clip, and how many a
// provider will run at once for one account. Both are guesses until a
// real clip is generated; they are the only two numbers here that no
// source backs.
const MINUTES_PER_CLIP = 3;
const CLIPS_IN_PARALLEL = 4;

// ElevenLabs, from src/lib/voice/voice-pricing.ts (the repo's own, and
// deliberately the expensive end of the published range).
const SPEAK_PER_1K_CHARS = Number(
  (readFileSync("src/lib/voice/voice-pricing.ts", "utf8").match(/speakPer1kChars:\s*([0-9.]+)/) || [])[1]
);
// ASSUMED: a film speaks about 150 words a minute, ~6 characters a word.
const SPOKEN_CHARS_PER_MINUTE = 900;

const plans = PLANS.filter((p) => typeof p.price === "number" && typeof p.monthlyCredits === "number");
const MARGIN = { free: 6, starter: 5, growth: 5, professional: 5, ultimate: 5 };
const eurPerCredit = (p) => (p.price > 0 ? p.price / p.monthlyCredits : 0.02);
const credits = (usd, p) => Math.ceil((usd * USD_EUR * MARGIN[p.slug]) / eurPerCredit(p));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const hours = (mins) => (mins < 90 ? `${Math.round(mins)} λεπτά` : `${(mins / 60).toFixed(1)} ώρες`);

console.log("WHAT A FILM COSTS AND HOW LONG IT TAKES");
console.log("picture only; the voice line is below. Clip length per call: Veo 8 s, Kling 10 s.\n");

for (const [label, model, usdPerSecond, perCall] of TIERS) {
  console.log(`=== ${label} — ${model}, $${usdPerSecond}/δευτ. ===`);
  console.log(pad("διάρκεια", 12) + lpad("κλιπ", 7) + lpad("κόστος API", 13) + lpad("χρόνος", 12) + plans.map((p) => lpad(p.slug, 12)).join(""));
  for (const [name, seconds] of DURATIONS) {
    const clips = Math.ceil(seconds / perCall);
    const usd = usdPerSecond * seconds;
    const wall = (clips / CLIPS_IN_PARALLEL) * MINUTES_PER_CLIP;
    const cells = plans
      .map((p) => {
        const c = credits(usd, p);
        return lpad((c > p.monthlyCredits ? "✗" : "") + c.toLocaleString("en"), 12);
      })
      .join("");
    console.log(pad(name, 12) + lpad(clips.toLocaleString("en"), 7) + lpad("$" + usd.toFixed(2), 13) + lpad(hours(wall), 12) + cells);
  }
  console.log("");
}

console.log("=== η φωνή, από πάνω (ElevenLabs, $" + SPEAK_PER_1K_CHARS + " ανά 1.000 χαρακτήρες) ===");
console.log(pad("διάρκεια", 12) + lpad("χαρακτήρες", 13) + lpad("κόστος API", 13) + plans.map((p) => lpad(p.slug, 12)).join(""));
for (const [name, seconds] of DURATIONS) {
  const chars = (seconds / 60) * SPOKEN_CHARS_PER_MINUTE;
  const usd = (chars / 1000) * SPEAK_PER_1K_CHARS;
  const cells = plans.map((p) => lpad(credits(usd, p).toLocaleString("en"), 12)).join("");
  console.log(pad(name, 12) + lpad(chars.toLocaleString("en"), 13) + lpad("$" + usd.toFixed(2), 13) + cells);
}

console.log("\n✗ = πάνω από ΟΛΟΚΛΗΡΟ τον μήνα του πλάνου (" + plans.map((p) => `${p.slug} ${p.monthlyCredits.toLocaleString("en")}`).join(", ") + ")");
console.log(`χρόνος: ${MINUTES_PER_CLIP} λεπτά ανά κλιπ, ${CLIPS_IN_PARALLEL} μαζί — ΥΠΟΘΕΣΗ, καμία μέτρηση· ένα πραγματικό κλιπ την αντικαθιστά`);
console.log("φωνή: " + SPOKEN_CHARS_PER_MINUTE + " χαρακτήρες ανά λεπτό ομιλίας — ΥΠΟΘΕΣΗ (περ. 150 λέξεις)");
console.log("οι τιμές των παρόχων: docs/VIDEO-PROVIDERS.md (Kling/Runway 2026-10-02, Veo 2026-10-03, δευτερεύουσες πηγές)");
