// NO PLAN SHOWS A FEATURE IT DOES NOT HAVE.
//
// THE REPORT, from production on 2026-09-19: "every plan shows THE SAME
// list of 7 features… Free says it has Team collaboration. IT DOES NOT.
// And underneath there is a SECOND list with the correct ones."
//
// It was not /pricing. That page was rendered against production at
// 390x844 in Greek and English and every card showed only its own
// features. It was the SIGNUP plan chooser, and three things were wrong
// at once:
//
//   SEVEN ROWS WRITTEN IN THE COMPONENT, as English string literals —
//   untranslated in nine languages, on the page a non-English visitor
//   meets when they create an account. Neither i18n gate reads a JSX
//   text node built from an array of literals, which is the same reason
//   the pricing page's seat note survived as English for as long as it
//   did. Its own comment says so.
//
//   A ✕ AT text-muted/50 — 2.25:1 against the panel in dark, 2.35:1 in
//   light, beside a tick at 9.58:1. Below the 3:1 WCAG asks of a
//   non-text graphic. The person who built the product read seven
//   ticks; so would a customer. docs/shapes.md: when the defect is
//   visual, measure the screen.
//
//   TWO LISTS, the second repeating part of the first in different
//   words.
//
// WHAT THIS GATE HOLDS. Every capability row a plan card renders comes
// from lib/billing/feature-catalog.ts, whose cell for that plan decides
// the tick — so a card cannot claim what the catalog denies. And the
// catalog is cross-checked against lib/billing/plans.ts's own
// capabilities, so neither can drift from the other.
//
// Run: node scripts/tests/plan-claims.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const plans = await loadTs("src/lib/billing/plans.ts");
const catalog = await loadTs("src/lib/billing/feature-catalog.ts");
const rows = await loadTs("src/lib/billing/plan-capability-rows.ts");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const WORDS = {
  unlimited: "Unlimited", included: "Included", custom: "Custom",
  perSeat: "+seat", perHour: "/hour", perDay: "/day", minutesPerMonth: "min/month",
};

// ---------------------------------------------------------------------
console.log("== 1. the rows are derived, and there are some ==");
const derived = rows.distinguishingFeatures(WORDS);
ok(`the catalog still separates the plans (${derived.length} rows do)`,
  derived.length >= 5,
  `${derived.length} — an empty derivation makes every check below vacuous`);
ok("...and every derived row is a real catalog entry",
  derived.every((r) => catalog.getFeature(r.id)));
{
  // A row that is a tick for every plan, or a cross for every plan,
  // helps nobody choose and must not be on the card.
  const useless = derived.filter((entry) => {
    const kinds = new Set(plans.PLANS.map((p) => entry.cell(p, "en", WORDS).type));
    return !(kinds.has("check") && kinds.has("cross"));
  });
  ok("no row is the same answer for every plan", useless.length === 0,
    useless.map((r) => r.id).join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 2. THE OWNER'S CHECK: no plan claims what it does not have ==");
// THE FIRST VERSION OF THIS SECTION WAS SELF-CONFIRMING, and it is worth
// leaving the wreckage in the comment. It compared the catalog's cell
// with `plan.capabilities.<x>` — and the cell IS
// `boolCell(p.capabilities.teamCollaboration)`. Flipping the flag moved
// both sides together and the check stayed green: one object, read
// twice, exactly the shape docs/shapes.md calls "a gate that reads the
// same artefact as the code". Written an hour after that shape went into
// the catalogue.
//
// THE SECOND STATEMENT IS `minPlan`. Every catalog entry declares the
// lowest plan allowed to use it, separately from the cell that draws the
// tick, and a human has to keep the two in step. So: a tick appears for
// exactly the plans at or above minPlan, and nowhere else. Flip a
// capability and the cell disagrees with the minPlan beside it.
const ORDER = plans.PLANS.map((p) => p.slug);
const atOrAbove = (slug, minPlan) => ORDER.indexOf(slug) >= ORDER.indexOf(minPlan);
{
  const booleanEntries = rows
    .distinguishingFeatures(WORDS)
    .filter((e) => plans.PLANS.every((p) => ["check", "cross"].includes(e.cell(p, "en", WORDS).type)));
  ok(`there are boolean rows to check (${booleanEntries.length})`,
    booleanEntries.length >= 5,
    `${booleanEntries.length} — nothing to compare makes the check below vacuous`);
  const disagree = [];
  for (const entry of booleanEntries) {
    for (const plan of plans.PLANS) {
      const ticks = entry.cell(plan, "en", WORDS).type === "check";
      const allowed = atOrAbove(plan.slug, entry.minPlan);
      if (ticks !== allowed) {
        disagree.push(`${entry.id} on ${plan.slug}: card ${ticks ? "ticks" : "crosses"}, minPlan is ${entry.minPlan}`);
      }
    }
  }
  ok("every tick agrees with the minPlan declared beside it",
    disagree.length === 0,
    disagree.join("\n        "));
}
{
  // THE SENTENCE FROM THE REPORT, as its own check, in the owner's words.
  const free = plans.PLANS.find((p) => p.slug === "free");
  const team = catalog.getFeature("teamCollaboration");
  ok("teamCollaboration is in the catalog", Boolean(team));
  ok("Free does not show Team collaboration",
    team.cell(free, "en", WORDS).type === "cross",
    JSON.stringify(team.cell(free, "en", WORDS)));
  ok("...and its minPlan says the same thing independently",
    !atOrAbove("free", team.minPlan),
    `minPlan is ${team.minPlan}`);
  const shown = rows.capabilityRowsFor(free, WORDS).filter((r) => r.cell.type !== "cross");
  const wronglyShown = shown.filter((r) => {
    const e = catalog.getFeature(r.id);
    return e && !atOrAbove("free", e.minPlan);
  });
  ok("...and every row Free DOES show is one its plan is allowed",
    wronglyShown.length === 0,
    wronglyShown.map((r) => r.id).join(", "));
}

// AND THE TWO DIRECTIONS THE minPlan CHECK DOES NOT COVER.
//
// On 2026-09-19 a Vercel failure arrived naming a gate
// (plan-feature-matrix.test.mjs) that exists in no commit on any of
// this repository's branches, reporting "free: unexpected 3". Four
// readings of that sentence were computed against the real data and
// every one gave zero. The claim could not be reproduced and the file
// could not be found — but the QUESTION is a good one, and the answer
// should not depend on a gate nobody can see.
//
// So both remaining directions are held here:
//
//   REVERSE — a plan that HAS the capability and is shown a cross. The
//   minPlan check cannot see it: a cross is always "allowed" below
//   minPlan and this is about plans above it. It sells somebody less
//   than they bought.
//
//   A ZERO WEARING A NUMBER — a value cell reading "0" or "0 MB". That
//   is a cross with extra steps, and it reads on the page as though
//   something is included.
{
  const booleanish = catalog.FEATURE_CATALOG.filter((e) => typeof e.capability === "string");
  ok(`catalog entries that name a capability (${booleanish.length})`,
    booleanish.length >= 4,
    `${booleanish.length} — nothing to compare makes both checks below vacuous`);
  const sellsLess = [];
  for (const entry of booleanish) {
    for (const plan of plans.PLANS) {
      const shown = entry.cell(plan, "en", WORDS).type !== "cross";
      const has = Boolean(plan.capabilities[entry.capability]);
      if (has && !shown) sellsLess.push(`${entry.id} on ${plan.slug}: plan grants it, card crosses it`);
    }
  }
  ok("no plan is shown a cross for something it actually has",
    sellsLess.length === 0,
    sellsLess.join("\n        "));

  const zeroes = [];
  for (const entry of rows.distinguishingFeatures(WORDS).concat(catalog.soldFeatures())) {
    for (const plan of plans.PLANS) {
      const cell = entry.cell(plan, "en", WORDS);
      if (cell.type === "value" && /^0(\s|$)/.test(cell.text)) {
        zeroes.push(`${entry.id} on ${plan.slug}: "${cell.text}"`);
      }
    }
  }
  ok("no cell reads as a number when the number is zero",
    zeroes.length === 0,
    [...new Set(zeroes)].join("\n        ") + "\n        a zero is a cross with extra steps — return { type: \"cross\" }");
}

console.log("\n== 3. every row on the card has a label, in every language ==");
// The seven literals this replaced were English in ten locales.
let missing = [];
for (const locale of LOCALES) {
  for (const row of rows.capabilityRowsFor(plans.PLANS[0], WORDS, locale)) {
    const label = messages[locale]?.pricing?.rows?.[row.id];
    if (typeof label !== "string" || label.length === 0) missing.push(`${locale}.${row.id}`);
  }
}
ok("pricing.rows.<id> exists for every rendered row in all ten locales",
  missing.length === 0, missing.join(", "));
{
  // AND IT IS ACTUALLY TRANSLATED, not the English copied across. Greek
  // is the check because it is the one language the owner reads.
  const ids = rows.capabilityRowsFor(plans.PLANS[0], WORDS).map((r) => r.id);
  // A PRODUCT NAME IS NOT AN UNTRANSLATED STRING. "Website & Automation
  // Builder" is what the thing is called, in every language, the same
  // way "Ionexa Chat" is. The exception carries its reason and is
  // checked BOTH ways, so it cannot outlive the row it excuses.
  const SAME_IN_BOTH = {
    websiteBuilder: "the product's own name, not a phrase — the same in every locale",
  };
  const untranslated = ids.filter(
    (id) => messages.el.pricing.rows[id] === messages.en.pricing.rows[id]
  );
  const unexplained = untranslated.filter((id) => !Object.hasOwn(SAME_IN_BOTH, id));
  ok(`Greek says something different from English for every row that is a phrase`,
    unexplained.length === 0,
    unexplained.map((id) => `${id}: "${messages.el.pricing.rows[id]}"`).join(", "));
  const stale = Object.keys(SAME_IN_BOTH).filter((id) => !untranslated.includes(id));
  ok("...and every exception is still needed",
    stale.length === 0,
    `${stale.join(", ")} differ now — delete the entry`);
}

// ---------------------------------------------------------------------
console.log("\n== 4. the components render the derived rows, not a list of their own ==");
const signup = readFileSync("src/app/signup/signup-flow.tsx", "utf8");
// THE ROWS ARE BUILT ON THE SERVER, and the check follows them there.
// The first version of this had signup-flow.tsx import
// lib/billing/plan-capability-rows.ts directly, and
// client-env-reach.test.mjs went red: the catalog reaches seven limit
// modules that read process.env, which is undefined in a browser, so a
// card built client-side would quote a fallback number as if it were
// the plan. page.tsx builds them and passes plain data down.
const signupPage = readFileSync("src/app/signup/page.tsx", "utf8");
ok("the signup PAGE builds the derived rows", /capabilityRowsFor\(/.test(signupPage));
// STRIPPED FIRST. The paragraph in signup-flow.tsx that explains WHY
// the rows moved to the server names the module it moved to, and the
// first version of this check read that sentence as an import — this
// gate committing, in its own first draft, the shape docs/shapes.md
// calls "the gate found the sentence about the code, not the code".
ok("...and the client component does not reach the catalog itself",
  !/from "@\/lib\/billing\/(feature-catalog|plan-capability-rows)"/.test(stripComments(signup)),
  "importing it drags seven process.env readers into the browser bundle");
ok("...and the rows arrive as a prop", /capabilityRows\[p\.slug\]/.test(signup));
ok("...and no longer carries CAPABILITY_ROWS", !/const CAPABILITY_ROWS/.test(signup));
ok("...and labels them from pricing.rows.<id>",
  /tPricing\(`rows\.\$\{row\.id\}`\)/.test(signup));
// ONE LIST PER PLAN CARD. Counting <ul> elements counts the Business
// card's list too, which is a different card and is meant to be there —
// the check is that the plan card no longer renders BOTH the derived
// rows and the plan's own marketing features.
ok("...with one list per plan card, not two",
  !/p\.features\.map\(/.test(signup),
  "the plan's own feature list is still rendered underneath the derived rows");
ok("...and the rows are rendered exactly once",
  (signup.match(/capabilityRows\[p\.slug\]/g) ?? []).length === 1,
  `${(signup.match(/capabilityRows\[p\.slug\]/g) ?? []).length} use(s)`);

// ---------------------------------------------------------------------
console.log("\n== 5. the cross can be SEEN, which is why this was reported at all ==");
// WCAG 1.4.11 asks 3:1 of a graphic that carries meaning. A ✕ nobody
// can see is a feature list with no crosses in it.
const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [hi, lo] = L(a) > L(b) ? [L(a), L(b)] : [L(b), L(a)];
  return (hi + 0.05) / (lo + 0.05);
};
const css = readFileSync("src/app/globals.css", "utf8");
const varOf = (name, from = 0) => {
  const m = new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+)`).exec(css.slice(from));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const lightAt = css.indexOf("--background: 247 247 248");
const themes = {
  dark: { panel: varOf("panel"), muted: varOf("muted") },
  light: { panel: varOf("panel", lightAt), muted: varOf("muted", lightAt) },
};
for (const [name, t] of Object.entries(themes)) {
  ok(`${name}: the theme's panel and muted were read out of globals.css`,
    Boolean(t.panel && t.muted), JSON.stringify(t));
  if (!t.panel || !t.muted) continue;
  const r = ratio(t.muted, t.panel);
  ok(`${name}: a full-strength cross is ${r.toFixed(2)}:1 against the panel (needs 3)`, r >= 3);
  const half = t.muted.map((c, i) => c * 0.5 + t.panel[i] * 0.5);
  ok(`${name}: ...and the half-strength one it replaced was ${ratio(half, t.panel).toFixed(2)}:1, which is why`,
    ratio(half, t.panel) < 3);
}
for (const [file, src] of [
  ["signup-flow.tsx", signup],
  ["pricing/page.tsx", readFileSync("src/app/pricing/page.tsx", "utf8")],
]) {
  ok(`${file}: no cross is drawn at half opacity`,
    !/<X className="[^"]*text-muted\/\d/.test(src),
    (src.match(/<X className="[^"]*"/) ?? [])[0]);
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
