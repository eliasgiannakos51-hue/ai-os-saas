#!/usr/bin/env node
/*
 * EVERY PRICED ACTION: WHAT IT COSTS US, WHAT IT CHARGES, WHO MAY USE IT,
 * AND WHETHER THE PERSON SEES THE NUMBER BEFORE PRESSING.
 *
 * Run: node scripts/price-table.mjs            the table
 *      node scripts/price-table.mjs --json     the same rows, for a machine
 *
 * docs/v6-pricing-2026-10-02.md prints this table and says where it came
 * from; it does not carry the numbers itself, because a price table typed
 * into a document is true on the day it was typed and on no other.
 *
 * EVERY COLUMN IS READ OUT OF THE CODE, and each says from where:
 *
 *   model cost   estimateForAction (lib/billing/estimate.ts) on a
 *                300-character request — the same function the screens
 *                and the reservation call. One request size for every
 *                row, so the rows compare; scripts/make-cost.mjs prices
 *                the five Make screens on the sentences their tests type.
 *   credits      the same call with each plan's own credit rate
 *                (effectiveCreditPriceEurForAccount) and the margin
 *                settlement resolves (resolveMarginFor) — what is charged.
 *   at 4x        the same call with the margin forced to 4: what the
 *                owner's "credits = 4x cost" would charge instead.
 *   tier         the API routes that pass this profile to
 *                estimateForAction, matched against
 *                lib/billing/feature-catalog.ts's `routes`, lowest
 *                minPlan of the entries that claim them.
 *   shown        a screen that runs the estimator and names this profile,
 *                OR one that renders the `estimate` a route of this
 *                profile returns, OR an entry in
 *                scripts/lib/cost-shown-before.mjs — the explicit list for
 *                what the scan cannot see (a profile reached through a
 *                variable). A "no" is a lead to check, not a verdict; the
 *                files behind every "yes" print with --json.
 *
 * WHAT IT CANNOT SAY: what a run actually charged. That is settlement,
 * from real token counts. This is the estimate — the promise made before
 * the button.
 */
import { rows, MODEL, INPUT_CHARS, PLANS } from "./lib/price-rows.mjs";

const JSON_OUT = process.argv.includes("--json");

if (JSON_OUT) {
  console.log(JSON.stringify({ model: MODEL, inputChars: INPUT_CHARS, rows }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`each row on its call site's own model (--json says which) · a ${INPUT_CHARS}-character request · margins as settlement resolves them\n`);
console.log(
  pad("action", 22) + lpad("EUR", 8) + "  " + PLANS.map((p) => lpad(p.slice(0, 6), 7)).join("") +
    lpad("4x@grw", 8) + "  " + pad("tier", 13) + "shown before",
);
console.log("-".repeat(22 + 10 + PLANS.length * 7 + 8 + 2 + 13 + 14));
for (const r of rows.sort((a, b) => b.eur - a.eur)) {
  console.log(
    pad(r.action, 22) + lpad(r.eur.toFixed(4), 8) + "  " + PLANS.map((p) => lpad(r.credits[p], 7)).join("") +
      lpad(r.growthAt4, 8) + "  " + pad(r.tier ?? "—", 13) + (r.shownIn.length ? "yes" : "no") + (r.large ? "   LARGE" : ""),
  );
}
const unshown = rows.filter((r) => r.shownIn.length === 0);
console.log(
  `\n${rows.length} priced actions · ${rows.length - unshown.length} shown before the button · ` +
    `${unshown.length} not found by the scan or scripts/lib/cost-shown-before.mjs: ${unshown.map((r) => r.action).join(", ")}`,
);
console.log(
  "\"—\" in tier: no route passing the profile is claimed by a catalog entry, so nothing here says who may use it.\n" +
    "LARGE: over the product's own large-action threshold (LARGE_ACTION_CONFIRM_THRESHOLD) on ANY plan.\n" +
    "ESTIMATE, NOT CHARGE: settlement divides real token counts by the same rate.",
);
