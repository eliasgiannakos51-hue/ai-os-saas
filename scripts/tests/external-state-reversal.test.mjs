// A FOREIGN KEY CLEANS ROWS. NOTHING CLEANS A THIRD PARTY.
//
// Reversibility in this tree has been checked twice before, and both
// times inside the database: a reservation released when a job dies
// (reservations.ts), an uploaded object removed when its row is not
// written (upload-reversibility.test.mjs). Both are real and both stop at
// the edge of Postgres.
//
// This product also creates state at STRIPE, and that state is the one
// that costs money every month. Two failures of the same shape, in
// opposite directions, measured 2026-09-17:
//
//   DELETING AN ACCOUNT cancelled nothing. Rows cascaded, files went, the
//   auth user went — and the subscription stayed live, charging a card
//   for an account that no longer existed and whose owner could no longer
//   log in to stop it.
//
//   REMOVING AN ADD-ON did the opposite. If Stripe refused the item
//   deletion, the route logged it and marked the row cancelled anyway —
//   so the product stopped delivering the add-on and the card went on
//   paying for it.
//
// THE RULE, and it is a direction rather than a symmetry: when the local
// state and the third party can disagree, fail toward the one that does
// NOT keep taking money. An account deletion that cannot cancel refuses
// and gives the link back; an add-on removal that cannot stop the billing
// leaves the add-on active and says so.
//
// Run: node scripts/tests/external-state-reversal.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const routes = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "route.ts") routes.push(full.replace(/\\/g, "/"));
  }
})("src/app");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(routes.map((f) => [f, strip(readFileSync(f, "utf8"))]));

// A CALL THAT CHANGES SOMETHING AT STRIPE, not one that reads. A retrieve
// leaves nothing behind to be inconsistent with.
const MUTATES_STRIPE = /stripe\.(subscriptions|subscriptionItems|customers|checkout\.sessions)\.(create|update|cancel|del)\s*\(/;
const mutators = routes.filter((f) => MUTATES_STRIPE.test(SOURCE.get(f)));
check(`routes walked (${routes.length})`, routes.length >= 100);
check(`routes that change something at Stripe (${mutators.length})`, mutators.length >= 3, "the Stripe-mutation detector matched almost nothing, so every check below is vacuous");

// Each one says which way it fails when the two can disagree.
const DECLARED = {
  "src/app/api/delete-account/confirm/route.ts":
    "refuses. It cancels the subscription before deleteUser — after it, the metadata holding the id is gone — and a failure returns 500 WITHOUT deleting, releasing the single-use token so the person can try again. 'We deleted your account' must not be said while the card is still being charged.",
  "src/app/api/billing/addons/route.ts":
    "refuses. If Stripe will not remove the subscription item, the row is NOT marked cancelled: the add-on stays active and the person is told. The exception is an item Stripe reports as already gone, where refusing would strand a row that has nothing behind it.",
  "src/app/api/billing/cancel/route.ts":
    "sets cancel_at_period_end and only then records it, so a Stripe failure throws before anything local changes. Nothing is half-done: the subscription is either flagged at Stripe or it is not.",
  "src/app/api/billing/resume/route.ts":
    "the same shape in reverse — the flag is cleared at Stripe first, and the local state follows.",
  "src/app/api/checkout/route.ts":
    "creates a checkout SESSION, which grants nothing until Stripe's webhook says it was paid. An abandoned session expires on its own and there is no local state to disagree with.",
  "src/app/api/credits/checkout/route.ts":
    "the same: a session, not an entitlement. The credits are granted by the webhook.",
  "src/app/api/webhooks/stripe/route.ts":
    "the webhook is Stripe TELLING US what already happened, so there is no disagreement to resolve — the third party is the source of truth by construction. Where it does call back (creating a customer for an event that names none), a failure throws before any local grant and Stripe retries the delivery.",
};
const undeclared = mutators.filter((f) => !DECLARED[f]);
check(
  "every route that changes something at Stripe says which way it fails",
  undeclared.length === 0,
  undeclared.join("\n        ") +
    "\n        When the local state and the third party can disagree, say which one wins — and prefer the one that stops taking money."
);
const stale = Object.keys(DECLARED).filter((f) => !mutators.includes(f));
check("no declaration outlives its route", stale.length === 0, stale.join(", "));
for (const [f, why] of Object.entries(DECLARED)) {
  if (why.length < 80) check(`${f}: the reason is an argument`, false, why);
}

// ---------------------------------------------------------------------
// THE TWO THAT WERE WRONG, ASSERTED EXACTLY.
// ---------------------------------------------------------------------
const ADDONS = SOURCE.get("src/app/api/billing/addons/route.ts") ?? "";
const delAt = ADDONS.indexOf("stripe.subscriptionItems.del");
const markAt = ADDONS.indexOf('.from("account_addons")\n      .update({\n        status: "cancelled"');
check("the add-on route deletes the subscription item", delAt >= 0);
// INSIDE THE CATCH AND BEFORE THE UPDATE, by position rather than by a
// window: the block is long enough that any fixed lookahead is a guess.
const catchAt = ADDONS.indexOf("catch (stripeError)");
const refusalAt = ADDONS.indexOf("status: 502", catchAt);
check(
  "...and a Stripe failure returns before the row is marked cancelled",
  catchAt >= 0 && refusalAt > catchAt && (markAt < 0 || refusalAt < markAt),
  "the catch logs and falls through, so the row says cancelled while the item lives on and the card keeps paying"
);
check(
  "...except for an item Stripe says is already gone",
  /resource_missing|statusCode.*404|status === 404/.test(ADDONS),
  "refusing on a 404 leaves a row stuck active with nothing behind it"
);

const DELETE_ROUTE = SOURCE.get("src/app/api/delete-account/confirm/route.ts") ?? "";
check("account deletion cancels at Stripe", /stripe\.subscriptions\.cancel\s*\(/.test(DELETE_ROUTE));
check(
  "...before the auth user is deleted",
  DELETE_ROUTE.indexOf("stripe.subscriptions.cancel") < DELETE_ROUTE.indexOf("deleteUser("),
  "after deleteUser the metadata holding the subscription id is gone, so a cancellation there cancels nothing"
);
check(
  "...and a failure deletes nothing and releases the link",
  /used_at: null/.test(DELETE_ROUTE),
  "refusing a deletion without giving the single-use token back leaves the person unable to delete at all"
);

// ---------------------------------------------------------------------
// CONTROLS.
// ---------------------------------------------------------------------
check("control: a retrieve is not a mutation", !MUTATES_STRIPE.test("await stripe.subscriptions.retrieve(id);"));
check("control: a cancel is", MUTATES_STRIPE.test("await stripe.subscriptions.cancel(id);"));
check(
  "control: a mutation named only in a comment does not count",
  !MUTATES_STRIPE.test(strip("// calls stripe.subscriptions.cancel(id) when the account goes\nconst x = 1;")),
  "the comment stripper is not running, so this file's own header would be a finding"
);

console.log(`\n        ${mutators.length} routes change Stripe state · ${Object.keys(DECLARED).length} declared`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
