#!/usr/bin/env node
/*
 * WHAT ONE SENTENCE COSTS, ON EACH PLAN, FOR EVERY MAKE SCREEN.
 *
 * Run: node scripts/make-cost.mjs
 *
 * The number a screen shows before you press the button is not a
 * constant anybody typed — it comes out of estimateForAction with that
 * screen's own action profile, that screen's own input-size helper, and
 * the account's own credit rate, which differs per plan by a factor of
 * three. So this does not restate a figure: it calls the same three
 * functions the screen calls and prints what they return.
 *
 * WHY THE SAME PROMPT COSTS MORE ON ULTIMATE. A credit is cheaper there
 * — EUR 0.008 against EUR 0.02 on Free — so the same euro of model time
 * is more credits. The euro column is the one to compare; the credit
 * column is what the person sees.
 *
 * WHAT IT CANNOT SAY: what the run actually charged. That is settlement,
 * from real token counts, and it needs a real generation. This is the
 * estimate — the promise made before the button, which is the number a
 * person decides on.
 */
import { loadTs } from "./tests/load-ts.mjs";

const estimate = await loadTs("src/lib/billing/estimate.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const cfgMod = await loadTs("src/lib/billing/pricing-config.ts");
const plansMod = await loadTs("src/lib/billing/plans.ts");
const deck = await loadTs("src/lib/presentations/deck.ts");
const posts = await loadTs("src/lib/posts/platforms.ts");
const models = await loadTs("src/lib/ai-models.ts");

const config = cfgMod.DEFAULTS;

// THE SENTENCE, one per screen, the same one the browser test types.
// A cost table built on a different prompt from the one that was
// photographed is two measurements of two things.
const TYPED = {
  website: "a one-page site for a coffee shop in Thessaloniki",
  deck: "eight slides about our new pricing",
  post: "a short post about our summer opening hours",
};

// EACH ROW NAMES THE FILE THE PAIRING CAME FROM, and the pairing is
// re-checked below against that file — a table whose action key silently
// stopped matching the route would price a feature that is not there.
const ROWS = [
  {
    label: "Build a site",
    action: "websiteGenerate",
    route: "src/app/api/websites/generate/route.ts",
    inputChars: () => TYPED.website.length,
  },
  {
    label: "Presentations (10 slides)",
    action: "presentationGenerate",
    route: "src/app/api/presentations/generate/route.ts",
    inputChars: () => deck.deckEstimateInputChars(TYPED.deck.length, 10),
  },
  {
    label: "Presentations — one change in words",
    action: "presentationEdit",
    route: "src/app/api/presentations/[id]/edit/route.ts",
    // A deck of ten slides is what is on screen when the edit box exists,
    // so the instruction is priced against a deck, not against itself.
    inputChars: () =>
      deck.deckEditEstimateInputChars(
        { title: "Pricing", slides: Array.from({ length: 10 }, (_, i) => ({ title: `Slide ${i + 1}`, bullets: ["one", "two", "three"], notes: "" })) },
        "make it more formal".length
      ),
  },
  {
    label: "Posts (all five platforms)",
    action: "postsGenerate",
    route: "src/app/api/posts/generate/route.ts",
    inputChars: () =>
      posts.postsEstimateInputChars(TYPED.post.length, ["linkedin", "x", "instagram", "facebook", "threads"]),
  },
  {
    label: "AI Coding",
    action: "codeAssist",
    route: "src/app/api/coding/run/route.ts",
    inputChars: () => "a function that formats a phone number".length,
  },
];

const { readFileSync } = await import("node:fs");
let problems = 0;
for (const row of ROWS) {
  const src = readFileSync(row.route, "utf8");
  if (!src.includes(`"${row.action}"`)) {
    console.log(`  !! ${row.label}: ${row.route} no longer passes "${row.action}" to estimateForAction`);
    problems++;
  }
}

const PLANS = ["free", "starter", "growth", "professional", "ultimate"];
const MODEL = models.WEBSITE_BUILDER_MODEL;

console.log(`model: ${MODEL} (ai-models.ts — the same constant the screens' hook estimates with)\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("screen", 38) + PLANS.map((p) => pad(p, 13)).join(""));
console.log("-".repeat(38 + PLANS.length * 13));
for (const row of ROWS) {
  const chars = row.inputChars();
  if (chars === null) {
    console.log(pad(row.label, 38) + "— the input-size helper could not be loaded");
    problems++;
    continue;
  }
  const cells = PLANS.map((slug) => {
    const plan = plansMod.getPlan(slug);
    const rate = formula.effectiveCreditPriceEurForAccount(plan, null, config);
    const e = estimate.estimateForAction(row.action, { model: MODEL, inputChars: chars, planSlug: slug }, config, rate);
    return pad(`${e.estimatedCredits} cr`, 13);
  });
  console.log(pad(row.label, 38) + cells.join(""));
}

// AND THE EURO, ONCE, because it is the number that does not move with
// the plan and therefore the one that says what a generation is worth.
console.log("\nthe same rows in euro of model time (plan-independent):");
for (const row of ROWS) {
  const chars = row.inputChars();
  if (chars === null) continue;
  const e = estimate.estimateForAction(row.action, { model: MODEL, inputChars: chars, planSlug: "free" }, config);
  console.log(`  ${pad(row.label, 38)} EUR ${e.estimatedUsd.toFixed(4)}   input ${chars} chars`);
}

console.log(
  "\nESTIMATE, NOT CHARGE. Settlement divides real token counts by the same\n" +
  "rate; a run that writes shorter slides than the profile predicts costs\n" +
  "less, and the difference is released. Only a real generation says which."
);
process.exit(problems === 0 ? 0 : 1);
