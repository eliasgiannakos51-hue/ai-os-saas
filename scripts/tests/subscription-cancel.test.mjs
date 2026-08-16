// Self-service cancellation, and the dark patterns it must not become.
//
// EU consumer law aside: a cancel flow that is harder than the signup flow
// is the product telling the user it does not trust them to leave. Every
// assertion here is one of the five ways this feature goes bad — asserted
// on the SOURCE, because each of them renders perfectly while being wrong.
//
// Run: node scripts/tests/subscription-cancel.test.mjs
import { readFileSync } from "node:fs";

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
const cancelRoute = readFileSync("src/app/api/billing/cancel/route.ts", "utf8");
const resumeRoute = readFileSync("src/app/api/billing/resume/route.ts", "utf8");
const panel = readFileSync("src/components/settings/cancel-subscription.tsx", "utf8");
const summary = readFileSync("src/components/settings/billing-summary.tsx", "utf8");

console.log("== 1. the paid period is honoured ==");
check(
  "cancel sets cancel_at_period_end",
  /cancel_at_period_end:\s*true/.test(cancelRoute)
);
// The one line that would turn this from "cancel" into "cut off". Stripe's
// subscriptions.cancel() ends it immediately and refunds nothing — the
// customer paid for the month and would lose the rest of it.
check(
  "and never cancels immediately",
  !/subscriptions\.cancel\(/.test(cancelRoute) && !/\bcancel_now\b|invoice_now/.test(cancelRoute),
  "subscriptions.cancel() ends access the same second"
);
check("resume clears the flag rather than re-subscribing", /cancel_at_period_end:\s*false/.test(resumeRoute));
check(
  "resume does not create a new subscription (that would charge again)",
  !/subscriptions\.create\(/.test(resumeRoute)
);

console.log("\n== 2. one click to reach it, one confirmation ==");
check(
  "the button sits in the billing panel, not behind the Stripe portal",
  /CancelSubscription/.test(summary) && /ManageBillingButton/.test(summary),
  "it must be a sibling of Manage billing, not a link inside it"
);
// "Are you sure?" three times is the pattern. There is exactly one
// confirm-shaped control in the panel, and no window.confirm on top of it.
const confirmCalls = (panel.match(/window\.confirm\(/g) ?? []).length;
check("no window.confirm stacked on top of the panel", confirmCalls === 0);
check(
  "the panel offers exactly one destructive confirm and one way out",
  (panel.match(/onClick=\{confirm\}/g) ?? []).length === 1 &&
    /onClick=\{\(\) => setOpen\(false\)\}/.test(panel)
);

console.log("\n== 3. the survey is optional, and cannot block leaving ==");
check("no reason is selected by default", /useState<string \| null>\(null\)/.test(panel));
check(
  "the confirm button is not disabled by a missing reason",
  !/disabled=\{[^}]*reason[^}]*\}/.test(panel),
  "gating Cancel on the survey is the dark pattern this exists to avoid"
);
check(
  "the route accepts a request with no body at all",
  /catch\s*\{[\s\S]{0,200}?\}/.test(cancelRoute) && /await request\.json\(\)/.test(cancelRoute)
);
check(
  "recording the survey cannot fail the cancellation",
  /subscription_cancellations[\s\S]{0,400}?catch \(err\)/.test(cancelRoute),
  "the insert must be inside its own try/catch, after the Stripe update"
);
check(
  "the confirmation email cannot fail the cancellation either",
  /sendSubscriptionCancelledEmail[\s\S]{0,300}?catch \(err\)/.test(cancelRoute)
);
// Order matters: if the survey were written BEFORE the Stripe call, a
// failed cancellation would still leave a "they left" row behind.
check(
  "the Stripe update happens before anything is recorded",
  cancelRoute.indexOf("cancel_at_period_end") < cancelRoute.indexOf("subscription_cancellations")
);

console.log("\n== 4. ownership is checked on both routes ==");
for (const [name, src] of [["cancel", cancelRoute], ["resume", resumeRoute]]) {
  check(`${name}: rejects an unauthenticated caller`, /Not authenticated/.test(src));
  // The subscription id comes from the caller's own metadata, but a stale
  // or tampered value must not reach somebody else's subscription.
  check(
    `${name}: verifies the subscription belongs to this customer`,
    /customerId !== user\.user_metadata\?\.stripe_customer_id/.test(src)
  );
}

console.log("\n== 5. the four facts are stated before the decision, in ten languages ==");
// What people are actually afraid of: when access ends, what happens to
// credits they paid for, whether their data is deleted, and whether it is
// reversible. All four are what makes ONE confirmation enough.
const FACTS = ["keepsAccessUntil", "creditsStay", "dataKept", "reversible"];
for (const fact of FACTS) {
  check(`the panel renders "${fact}"`, new RegExp(`t\\("${fact}"`).test(panel));
  const missing = LOCALES.filter(
    (l) => typeof messages[l].settings?.billing?.cancel?.[fact] !== "string"
  );
  check(`${fact}: present in all ten locales`, missing.length === 0, missing.join(", "));
}
// Greek, Japanese and Arabic share no alphabet with English, so an
// identical value in any of them means it was never translated.
for (const fact of [...FACTS, "button", "confirm", "keepIt"]) {
  const en = messages.en.settings.billing.cancel[fact];
  const untranslated = ["el", "ja", "ar"].filter(
    (l) => messages[l].settings.billing.cancel[fact] === en
  );
  check(`${fact}: actually translated into el/ja/ar`, untranslated.length === 0, untranslated.join(", "));
}

console.log("\n== 6. the countdown is an ICU plural, not a day(s) hack ==");
for (const loc of LOCALES) {
  const value = messages[loc].settings.billing.cancel.endingIn;
  check(`${loc}: endingIn is a plural form`, /\{days, plural,/.test(value), value);
}
// Arabic has six plural categories; a two-branch message is wrong in four
// of them and no translator can fix it from the catalogue if the branch
// lives in the code.
check(
  "Arabic carries its own six forms",
  ["zero", "one", "two", "few", "many", "other"].every((f) =>
    new RegExp(`\\b${f} \\{`).test(messages.ar.settings.billing.cancel.endingIn)
  )
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
