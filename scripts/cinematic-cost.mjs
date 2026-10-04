// What a cinematic site costs to make, per style, in euros and credits —
// and what the three samples cost. Analysis only: nothing here is wired.
//
// Run: node scripts/cinematic-cost.mjs
//
// Three kinds of number, kept apart:
//   FROM THE REPO, at run time: the list price of a credit and the USD->EUR
//     rate (src/lib/billing/pricing-config.ts), the margin each plan resolves
//     to (src/lib/billing/margin-policy.ts), the page's own generation cost
//     (src/lib/billing/estimate.ts, websiteGenerate) and Sonnet's token
//     prices (src/lib/billing/model-pricing.ts).
//   LOOKED UP, with the date: provider prices. The image prices were read
//     2026-10-02 (docs/v6-images-2026-10-02.md); Veo 3.1's on 2026-10-03
//     from secondary sources, because ai.google.dev is blocked by this
//     environment's network policy; Kling's 2026-10-02
//     (docs/v6-video-2026-10-02.md). The date is the claim.
//   ASSUMED, and named as such: how many tokens a judge reads to look at two
//     screenshots or eight video frames. Until the judge exists, nothing
//     measures them.
import { loadTs } from "./tests/load-ts.mjs";

const { DEFAULTS } = await loadTs("src/lib/billing/pricing-config.ts");
const { resolveMarginFor } = await loadTs("src/lib/billing/margin-policy.ts");
const { estimateForAction } = await loadTs("src/lib/billing/estimate.ts");
const { MODEL_PRICING_USD } = await loadTs("src/lib/billing/model-pricing.ts");

const USD_EUR = DEFAULTS.usdToEurRate;
const LIST = DEFAULTS.creditPriceEur;
const M_PAID = resolveMarginFor(null, "growth", DEFAULTS, {}).margin;

// ---- provider prices, USD ----
const IMG = { nbPro4k: 0.24, nbPro2k: 0.134 };                    // Nano Banana Pro, 2026-10-02
const VEO = {                                                        // Veo 3.1, per second, 2026-10-03
  lite1080: 0.08, fast1080: 0.12, fast4k: 0.3, std1080: 0.4, std4k: 0.6,
};
const KLING_4K = 0.42;                                               // Kling 3.0 native 4K, per second, 2026-10-02
const CLIP_S = 8;                                                    // Veo's longest single call

// ---- what the repo says the rest costs ----
const page = estimateForAction("websiteGenerate", { model: "claude-sonnet-4-6", inputChars: 400, planSlug: "growth" }, DEFAULTS);
const PAGE_USD = page.estimatedUsd;
const sonnet = MODEL_PRICING_USD["claude-sonnet-4-6"];
const judge = (inTok, outTok) => (inTok * sonnet.inputPerMTok + outTok * sonnet.outputPerMTok) / 1e6;
// ASSUMED: ~1,600 tokens per image the judge reads, 1,500 of instructions.
const QA_SCREENS = judge(2 * 1600 + 1500, 600);                      // desktop + phone
const QA_VIDEO = judge(8 * 1600 + 800, 400);                         // eight frames of a clip

// ---- one recipe per style: [label, USD for media, clips, notes] ----
const clip = (rate, n = 1) => rate * CLIP_S * n;
const STYLES = [
  ["ΣΤ  Απλό premium", IMG.nbPro4k, 0, "one 4K image, parallax only"],
  ["Α   Hero θέματος (loop)", IMG.nbPro4k + clip(VEO.fast1080), 1, "image → 8 s loop, first frame = last frame"],
  ["Γ   Περιστροφή προϊόντος", IMG.nbPro4k + clip(VEO.fast1080), 1, "image → 8 s orbit → frames"],
  ["Δ   Έκρηξη / συστατικά", IMG.nbPro4k + clip(VEO.fast1080), 1, "image → 8 s burst → frames"],
  ["Β   Scroll build, 1080p", 2 * IMG.nbPro4k + clip(VEO.fast1080), 1, "start + end image → 8 s → frames"],
  ["Β   Scroll build, 4K (Pro)", 2 * IMG.nbPro4k + clip(VEO.fast4k), 1, "the same at 4K"],
  ["Ε   Διαδρομή, 1080p", 2 * IMG.nbPro4k + clip(VEO.fast1080, 3), 3, "three 8 s clips joined"],
  ["Ε   Διαδρομή, 4K (Pro)", 2 * IMG.nbPro4k + clip(VEO.fast4k, 3), 3, "the same at 4K"],
];
const eur = (usd) => usd * USD_EUR;
const credits = (usd) => Math.ceil((eur(usd) * M_PAID) / LIST);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const money = (usd) => "€" + eur(usd).toFixed(2);

console.log(`margin ${M_PAID}x on paid plans (real 4.00x once the free-chat share is counted — combined-ceiling.test.mjs)`);
console.log(`a credit is €${LIST} on every plan; $1 = €${USD_EUR}`);
console.log(`the page itself: ${money(PAGE_USD)} (websiteGenerate estimate, 400 characters)`);
console.log(`QA, ASSUMED tokens: screenshots ${money(QA_SCREENS)}, one clip's frames ${money(QA_VIDEO)}\n`);

console.log(pad("style", 30) + lpad("media", 9) + lpad("page+QA", 9) + lpad("total", 9) + lpad("credits", 9) + lpad("+1 free retry", 15));
const rows = [];
for (const [label, media, clips, note] of STYLES) {
  const qa = QA_SCREENS + clips * QA_VIDEO;
  const total = media + PAGE_USD + qa;
  // The free retry the brief promises when QA fails: the clips and their
  // QA again, absorbed by us — so the price has to carry it, or a failed
  // first take sells below 4x.
  const retry = clips ? clips * (clip(VEO.fast1080) * (label.includes("4K") ? VEO.fast4k / VEO.fast1080 : 1) + QA_VIDEO) : 0;
  rows.push({ label, total, retry, credits: credits(total), creditsRetry: credits(total + retry), note });
  console.log(pad(label, 30) + lpad(money(media), 9) + lpad(money(PAGE_USD + qa), 9) + lpad(money(total), 9) + lpad(credits(total), 9) + lpad(credits(total + retry), 15) + "   " + note);
}
const simple = credits(PAGE_USD + QA_SCREENS);
console.log(`\nΖ   3D (Three.js): no media; priced at 8× the simple site by the owner's rule = ${8 * simple} credits (simple site ${simple})`);

console.log("\nthe same 8 s clip from other models, for comparison:");
for (const [name, rate] of [["Veo 3.1 Lite 1080p", VEO.lite1080], ["Veo 3.1 Fast 1080p", VEO.fast1080], ["Veo 3.1 Fast 4K", VEO.fast4k], ["Veo 3.1 Standard 1080p", VEO.std1080], ["Veo 3.1 Standard 4K", VEO.std4k], ["Kling 3.0 native 4K", KLING_4K]]) {
  console.log("  " + pad(name, 26) + lpad(money(rate * CLIP_S), 8) + lpad(credits(rate * CLIP_S) + " credits", 14));
}

// ---- the three samples, with the prompt trial the brief asks for ----
// Three image prompts per style, the best kept; then three video takes of
// the best image, the best kept. Fast 1080p for the trial; the kept take is
// what the sample shows.
const trial = 3 * IMG.nbPro4k + 3 * clip(VEO.fast1080);
const samples = [
  ["Ξενοδοχείο Σαντορίνη (Β)", trial + IMG.nbPro4k],   // + the second (end-state) image
  ["Καφετέρια (Α)", trial],
  ["Κάβα (Γ)", trial],
];
console.log("\nthe three samples, with three prompt variants for the image AND for the video:");
let all = 0;
for (const [name, usd] of samples) { all += usd; console.log("  " + pad(name, 28) + lpad("$" + usd.toFixed(2), 8) + lpad(money(usd), 8)); }
console.log("  " + pad("total", 28) + lpad("$" + all.toFixed(2), 8) + lpad(money(all), 8));
console.log(`  at Veo 3.1 Standard instead: $${(all + 9 * CLIP_S * (VEO.std1080 - VEO.fast1080)).toFixed(2)}`);
