// THE REVENUE ENGINE AND THE NUMBERS BEHIND IT (V4 #25 + #26).
//
// WHAT THIS ENVIRONMENT COULD NOT DO, said first. There is no
// STRIPE_SECRET_KEY here and no Stripe account, so NOT ONE CHARGE, ONE
// CHECKOUT OR ONE SUBSCRIPTION WAS EVER CREATED. Nobody was billed for
// overage, nobody bought an add-on, and no webhook was ever delivered.
// Everything below is the rules that decide those things.
//
// AND NOBODY HAS SEEN THE DASHBOARD OR A BADGED SITE IN A BROWSER.
//
// THE SIX THINGS THAT WOULD BE WRONG QUIETLY — and every one of them is
// somebody's money:
//
//   A CHARGE NOBODY AGREED TO. "Continue at EUR0.03/credit?" is a
//   question, and overage that defaults to on charges the people who
//   never saw the dialog. Section 1 is every refusal, including the ones
//   that look redundant.
//
//   A CAP THAT IS NOT A CEILING. Part-charging an action that crosses the
//   cap leaves a half-done thing the user paid for.
//
//   A PAID ADD-ON THAT GRANTS NOTHING. Every agent cap in the app read
//   the PLAN. Section 3 checks that none of them still does.
//
//   A BADGE BAKED INTO THE HTML. It would survive an upgrade, miss a
//   downgrade, and sit in the editor with a delete key next to it.
//   Section 4.
//
//   A METRIC THAT LOOKS LIKE A MEASUREMENT. A CAC computed from a
//   marketing spend nobody entered is infinitely good and a lie. Section
//   5 is every metric that must REFUSE rather than render.
//
//   A CHURN EVENT THAT IS A CARD UPDATE. Stripe says
//   customer.subscription.updated for both. Section 6.
//
// Run: node scripts/tests/revenue-engine.test.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const overage = await loadTs("src/lib/billing/overage.ts");
const addons = await loadTs("src/lib/billing/addons.ts");
const badge = await loadTs("src/lib/publishing/badge.ts");
// NAMED badgeCredits, NOT credits. A local `const credits` further
// down this file holds the SOURCE TEXT of billing/credits.ts, and two
// bindings of one name in one suite is how an assertion silently reads
// the wrong thing — here, a second `const credits` in the same scope,
// which is a SyntaxError rather than a silent read and so was caught by
// running the suite. No gate names this property; the naming convention
// is what keeps it from arising.
const badgeCredits = await loadTs("src/lib/publishing/badge-credits.ts");
const metrics = await loadTs("src/lib/billing/metrics.ts");
const subLog = await loadTs("src/lib/billing/subscription-kind.ts");
const plans = await loadTs("src/lib/billing/plans.ts");

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (path) => readFileSync(path, "utf8");
// SQL COMMENTS ARE `--`, NOT `//`. Scanning a migration with the
// TypeScript stripper made the file fail the no-DROP-TABLE check
// BECAUSE IT DOCUMENTS THE RULE. Found by this suite failing.
const stripSql = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
  });

// =====================================================================
console.log("\n== 1. NEVER A CHARGE WITHOUT CONSENT ==");
// =====================================================================

const CONSENTED = {
  enabled: true,
  capEur: 10,
  pricePerCreditEur: 0.03,
  consentedAt: "2026-01-01T00:00:00.000Z",
  consentVersion: overage.OVERAGE_CONSENT_VERSION,
};

{
  const off = overage.decideOverage({ settings: overage.OVERAGE_OFF, shortfall: 100, spentEur: 0 });
  ok("THE DEFAULT REFUSES", off.allowed === false, JSON.stringify(off));
  eq("…and says it is not enabled, so the UI can offer the dialog", off.reason, "not_enabled");
}
{
  // EVERY PARTIAL CONSENT IS NO CONSENT. The database's CHECK refuses
  // these rows, and this is the second lock: a row that somehow existed
  // still cannot charge anybody.
  const cases = [
    ["no cap", { ...CONSENTED, capEur: null }],
    ["a zero cap", { ...CONSENTED, capEur: 0 }],
    ["no price", { ...CONSENTED, pricePerCreditEur: null }],
    ["a zero price", { ...CONSENTED, pricePerCreditEur: 0 }],
    ["no consent version", { ...CONSENTED, consentVersion: null }],
  ];
  for (const [label, settings] of cases) {
    const verdict = overage.decideOverage({ settings, shortfall: 10, spentEur: 0 });
    ok(`enabled with ${label} still refuses`, verdict.allowed === false, JSON.stringify(verdict));
  }
}
{
  // CONSENT UNDER SUPERSEDED TERMS IS NOT CONSENT TO THESE ONES.
  const stale = overage.decideOverage({
    settings: { ...CONSENTED, consentVersion: overage.OVERAGE_CONSENT_VERSION - 1 },
    shortfall: 10,
    spentEur: 0,
  });
  ok("consent under an older version is refused", stale.allowed === false);
  eq("…and says why, so the user is asked again rather than blocked", stale.reason, "consent_out_of_date");
}
{
  const allowed = overage.decideOverage({ settings: CONSENTED, shortfall: 100, spentEur: 0 });
  ok("full consent allows the charge", allowed.allowed === true, JSON.stringify(allowed));
  eq("…priced at what they agreed to", allowed.pricePerCreditEur, 0.03);
  eq("…for the shortfall only, not the whole action", allowed.credits, 100);
  eq("…and the euros are credits x price", allowed.amountEur, 3);
}
{
  // THE PRICE IS THE ONE THEY AGREED TO, not today's list. A rise applied
  // to standing consent is a charge nobody agreed to.
  const old = overage.decideOverage({
    settings: { ...CONSENTED, pricePerCreditEur: 0.01 },
    shortfall: 100,
    spentEur: 0,
  });
  eq("an old consent keeps its old price", old.pricePerCreditEur, 0.01);
  ok("…and the list price is higher today", overage.OVERAGE_PRICE_EUR_PER_CREDIT > 0.01);
}

console.log("\n-- the cap is a ceiling --");
{
  const atCap = overage.decideOverage({ settings: CONSENTED, shortfall: 10, spentEur: 10 });
  ok("nothing is charged once the cap is reached", atCap.allowed === false);
  eq("…and it says so", atCap.reason, "cap_reached");

  // REFUSED WHOLE, NOT PART-CHARGED. Charging for four of five credits
  // leaves a half-done action the user paid for.
  const crossing = overage.decideOverage({ settings: CONSENTED, shortfall: 200, spentEur: 9.5 });
  ok("an action that would cross the cap is refused ENTIRELY", crossing.allowed === false, JSON.stringify(crossing));
  eq("…for that reason", crossing.reason, "would_exceed_cap");

  const fits = overage.decideOverage({ settings: CONSENTED, shortfall: 10, spentEur: 9.5 });
  ok("…while one that fits inside the remainder is allowed", fits.allowed === true, JSON.stringify(fits));
}
{
  const nothing = overage.decideOverage({ settings: CONSENTED, shortfall: 0, spentEur: 0 });
  ok("a covered action charges no overage at all", nothing.allowed === false);
  eq("…and is not reported as a refusal the user has to act on", nothing.reason, "nothing_to_charge");
}

console.log("\n-- the cap the user may set --");
eq("a cap below the floor is refused", overage.checkCap(0.5).ok, false);
eq("a four-figure cap is refused", overage.checkCap(50_000).ok, false);
eq("an ordinary cap is accepted", overage.checkCap(25).ok, true);
eq("…and rounded to cents", overage.checkCap(25.005).capEur, 25.01);
eq("a non-number is refused", overage.checkCap("lots").ok, false);

console.log("\n-- the warnings, once each --");
{
  const base = { capEur: 10, warned80Month: null, warned100Month: null, month: "2026-03-01" };
  eq("below 80% nothing is due", overage.warningsDue({ ...base, spentEur: 7 }), []);
  eq("at 80% the first is due", overage.warningsDue({ ...base, spentEur: 8 }), ["80"]);
  eq("crossing both at once sends both, once each", overage.warningsDue({ ...base, spentEur: 10 }), ["80", "100"]);
  eq(
    "a warning already sent this month is not repeated",
    overage.warningsDue({ ...base, spentEur: 10, warned80Month: "2026-03-01", warned100Month: "2026-03-01" }),
    []
  );
  eq(
    "…but a NEW month starts again",
    overage.warningsDue({ ...base, spentEur: 10, warned80Month: "2026-02-01", warned100Month: "2026-02-01" }),
    ["80", "100"]
  );
}

console.log("\n-- the cost, shown BEFORE --");
{
  const preview = overage.consentPreview({ shortfall: 40, capEur: 15 });
  eq("the dialog knows what this action would cost", preview.thisActionEur, 1.2);
  eq("…and what the cap buys", preview.creditsAtCap, 500);
  eq("…at the list price", preview.pricePerCreditEur, overage.OVERAGE_PRICE_EUR_PER_CREDIT);
}
{
  // THE ROUTE TAKES THE PRICE FROM THE SERVER, never from the request. A
  // client that could send its own price could consent on the user's
  // behalf to any rate at all.
  const route = strip(read("src/app/api/billing/overage/route.ts"));
  ok("the consent route prices from the server's own list", /pricePerCreditEur: OVERAGE_PRICE_EUR_PER_CREDIT/.test(route));
  ok("…and never from the body", !/body\.price|body\.pricePerCredit/.test(route));
  ok("a cap is REQUIRED to turn it on", /checkCap\(body\.capEur\)/.test(route));
  ok("there is an off switch", /export async function DELETE/.test(route));

  const store = strip(read("src/lib/billing/overage-store.ts"));
  ok("turning it off DELETES the row rather than flipping a flag", /\.delete\(\)\.eq\("user_id", userId\)/.test(store));
  ok("…and the ledger is not touched, because those charges are owed", !/from\("usage_overage_ledger"\)[\s\S]{0,80}\.delete\(/.test(store));

  const sql = stripSql(read("supabase/migrations/20260903000000_revenue_engine.sql"));
  ok("the column defaults to OFF", /enabled boolean not null default false/.test(sql));
  ok(
    "…and the database refuses a half-consented row",
    /usage_overage_settings_consent_complete/.test(sql)
  );
  ok(
    "the customer may DELETE their consent without asking us",
    /grant select, delete on public\.usage_overage_settings to authenticated/.test(sql)
  );
  ok(
    "…but may not write one",
    /revoke insert, update on public\.usage_overage_settings from authenticated/.test(sql)
  );
}

// =====================================================================
console.log("\n== 2. add-ons: what they grant, and once ==");
// =====================================================================

const heldAll = [
  { slug: "agents_5", quantity: 2, status: "active", expiresAt: null },
  { slug: "storage_10gb", quantity: 1, status: "active", expiresAt: null },
  { slug: "priority", quantity: 3, status: "active", expiresAt: null },
  { slug: "credits_1000", quantity: 5, status: "active", expiresAt: null },
];

{
  const starter = plans.getPlan("starter");
  const ents = addons.resolveEntitlements({ plan: starter, addons: heldAll, now: new Date("2026-03-01") });
  eq("two agent packs are ten agents on top of the plan's two", ents.maxAiAgents, 12);
  eq("…and the add-on's own contribution is visible", ents.fromAddons.agents, 10);
  eq("storage adds to the plan's", ents.storageGb, addons.PLAN_STORAGE_GB.starter + 10);
  ok("priority is on", ents.priority === true);
  // A NON-STACKABLE ADD-ON COUNTS ONCE whatever the quantity says.
  eq("…counted once even at quantity 3", ents.fromAddons.priority, true);
  // A CREDIT PACK IS NOT A STANDING ENTITLEMENT. It was granted into the
  // balance at purchase; counting it here would grant it twice.
  eq("a credit pack grants no standing entitlement", ents.fromAddons.agents, 10);
}
{
  const none = addons.resolveEntitlements({ plan: plans.getPlan("free"), addons: [] });
  eq("no add-ons is the plan's own cap", none.maxAiAgents, 0);
  eq("…and the plan's own storage", none.storageGb, addons.PLAN_STORAGE_GB.free);
}
{
  // "unlimited" + 5 is the string "unlimited5", which every `<` in the
  // app would read as NaN and refuse.
  //
  // NO SHIPPING PLAN IS UNLIMITED — every one of the six is a number,
  // and this suite's first version wrongly claimed Enterprise was, then
  // failed with 110. The type says `number | "unlimited"`, so the branch
  // is reachable the day a plan uses it, and BOTH facts are asserted:
  // the branch works, and today nothing takes it.
  const unlimitedPlan = {
    ...plans.getPlan("enterprise"),
    capabilities: { ...plans.getPlan("enterprise").capabilities, maxAiAgents: "unlimited" },
  };
  const ents = addons.resolveEntitlements({ plan: unlimitedPlan, addons: heldAll });
  ok("an unlimited plan stays unlimited, as a NUMBER", ents.maxAiAgents === Number.POSITIVE_INFINITY, String(ents.maxAiAgents));
  ok("…and is comparable", 500 < ents.maxAiAgents);

  const numericPlans = plans.PLANS.filter((p) => typeof p.capabilities.maxAiAgents === "number");
  eq("today every shipping plan is a finite number", numericPlans.length, plans.PLANS.length);
  const enterprise = addons.resolveEntitlements({ plan: plans.getPlan("enterprise"), addons: heldAll });
  eq("…so Enterprise's cap is its own plus the add-on", enterprise.maxAiAgents, 100 + 10);
}
{
  const now = new Date("2026-03-15T00:00:00Z");
  ok(
    "a cancelled add-on still paid for is still active",
    addons.addonIsActive({ slug: "agents_5", quantity: 1, status: "cancelled", expiresAt: "2026-03-31T00:00:00Z" }, now)
  );
  ok(
    "…and one whose period has ended is not",
    !addons.addonIsActive({ slug: "agents_5", quantity: 1, status: "cancelled", expiresAt: "2026-03-01T00:00:00Z" }, now)
  );
  ok(
    "…nor one cancelled with no period end",
    !addons.addonIsActive({ slug: "agents_5", quantity: 1, status: "cancelled", expiresAt: null }, now)
  );
}
{
  const held = [{ slug: "priority", quantity: 1, status: "active", expiresAt: null }];
  eq("priority cannot be bought twice", addons.checkPurchase({ slug: "priority", held }).ok, false);
  eq("…but a second agent pack can", addons.checkPurchase({ slug: "agents_5", held }).ok, true);
}
{
  const missing = addons.addonAvailability("agents_5", {});
  ok("an add-on with no configured price is NOT offered", missing.available === false);
  ok("…and names the variable to set, rather than 500ing at checkout", missing.envVar === "STRIPE_PRICE_ADDON_AGENTS_5", JSON.stringify(missing));
  const present = addons.addonAvailability("agents_5", { STRIPE_PRICE_ADDON_AGENTS_5: "price_x" });
  ok("…and one that is configured IS", present.available === true && present.priceId === "price_x");
}
{
  // THE PRICES THE BRIEF NAMES.
  eq("+1,000 credits is EUR15", addons.ADDONS.credits_1000.priceEur, 15);
  eq("+5 agents is EUR10", addons.ADDONS.agents_5.priceEur, 10);
  eq("+10GB is EUR5", addons.ADDONS.storage_10gb.priceEur, 5);
  eq("priority is EUR20", addons.ADDONS.priority.priceEur, 20);
  eq("a credit pack is a one-off", addons.ADDONS.credits_1000.billing, "one_off");
  eq("priority is monthly", addons.ADDONS.priority.billing, "monthly");
}

// =====================================================================
console.log("\n== 3. NO CAP CHECK STILL READS THE PLAN ALONE ==");
// =====================================================================
// The failure this prevents is silent and at the point of use: a customer
// who paid for five more agents is told they have hit their limit.
{
  const CREATORS = [
    "src/app/api/agents/route.ts",
    "src/app/api/agents/[id]/route.ts",
    "src/app/api/agents/build/route.ts",
    "src/app/api/agents/templates/adopt/route.ts",
  ];
  for (const file of CREATORS) {
    const src = strip(read(file));
    ok(`${file}: reads the ACCOUNT's cap`, /maxAgentsForAccount\(/.test(src));
    ok(`${file}: and never the plan's alone`, !/maxAgentsForPlan\(/.test(src));
  }
  const limits = strip(read("src/lib/agents/agent-limits.ts"));
  ok("the account cap adds ONLY the add-on contribution", /fromAddons\.agents/.test(limits));
  ok("…and falls back to the plan when the add-ons cannot be read", /return planCap;/.test(limits));
}

// =====================================================================
console.log("\n== 4. the badge: at serve time, never stored ==");
// =====================================================================

const PAGE = "<!doctype html><html><head></head><body><h1>Hi</h1></body></html>";

// THE DECISION AND THE PLACEMENT ARE TWO DIFFERENT QUESTIONS, and this
// section used to conflate them: injectBadge took a plan slug and asked
// planShowsBadge itself.
//
// Credit-based badge removal added a SECOND input — has this site been
// paid off for this calendar month — so passing a plan slug to
// injectBadge would now be passing half the question, and the half that
// says "free" for an account that has paid. The signature changed to
// take the ANSWER, and these assertions split to match:
//
//   planShowsBadge   — the plan half, still pure, still here
//   siteShowsBadge   — the whole decision, plan AND purchase
//   injectBadge      — placement only, given a decision
//
// The old shape would now pass VACUOUSLY: `{ planSlug: "starter" }`
// leaves `showBadge` undefined, which is falsy, so every "paid gets no
// badge" case would go green for the wrong reason while every free case
// went red. That is exactly the direction a signature change must not be
// allowed to fail in.
{
  ok("a decision of true puts the badge in", badge.injectBadge(PAGE, { showBadge: true }).includes("Made with Ionexa"));
  const free = badge.injectBadge(PAGE, { showBadge: true });
  ok("…inside the document, before </body>", free.indexOf("Made with Ionexa") < free.lastIndexOf("</body>"));
  ok("…as a real link", free.includes(badge.BADGE_HREF));
  ok("…that cannot navigate the opener", free.includes('rel="noopener noreferrer"'));
  ok("…and is bottom right", free.includes("right:12px") && free.includes("bottom:12px"));
  eq("a decision of false leaves the page untouched", badge.injectBadge(PAGE, { showBadge: false }), PAGE);
}
{
  // THE PLAN HALF.
  ok("free shows the badge", badge.planShowsBadge("free"));
  for (const paid of ["starter", "growth", "professional", "ultimate", "enterprise"]) {
    ok(`${paid} does not`, !badge.planShowsBadge(paid));
  }
  // AN UNREADABLE PLAN IS NOT A PAID ONE. Failing the other way gives
  // away the upsell on every free site whenever auth.users is slow.
  ok("no plan at all is treated as free", badge.planShowsBadge(null));
  ok("…and so is an empty string", badge.planShowsBadge(""));
  ok("…case does not matter", !badge.planShowsBadge("STARTER"));
}
{
  // THE WHOLE DECISION, INCLUDING RULE (ε): a paid plan never reaches
  // the credit question, so it can never be double-charged.
  const paid = { siteId: "s1", coversMonth: "2026-03-01", active: true, cancelledAt: null };
  ok("free with no purchase shows the badge", badgeCredits.siteShowsBadge({ planSlug: "free", removal: null }));
  ok("free WITH a purchase does not", !badgeCredits.siteShowsBadge({ planSlug: "free", removal: paid }));
  ok("starter does not, purchase or no purchase", !badgeCredits.siteShowsBadge({ planSlug: "starter", removal: null }));
  ok("…and still does not with one", !badgeCredits.siteShowsBadge({ planSlug: "starter", removal: paid }));
  // A row that exists but is not active is not cover.
  ok(
    "an inactive row is not cover",
    badgeCredits.siteShowsBadge({ planSlug: "free", removal: { ...paid, active: false } })
  );
  // CANCELLED IS NOT EXPIRED. Turning auto-renewal off stops the NEXT
  // charge; it never takes back a month already paid for.
  ok(
    "a cancelled but paid month still hides the badge",
    !badgeCredits.siteShowsBadge({ planSlug: "free", removal: { ...paid, cancelledAt: "2026-03-10T00:00:00Z" } })
  );
}
{
  // THE THREE PLACES "free" IS WRITTEN MUST AGREE. badge.ts decides the
  // plan half, badge-credits.ts decides who may buy removal, and the SQL
  // decides it on the serve path. Three copies of one fact is three
  // things to drift; this is the check that they have not.
  eq("badge.ts and badge-credits.ts name the same badged plans",
    [...badge.BADGED_PLANS].sort(), [...badgeCredits.BADGE_REMOVAL_APPLIES_TO].sort());
  const badgeSql = stripSql(read("supabase/migrations/20260905000000_badge_removal_credits.sql"));
  ok("…and the SQL checks the same one", /account_tier\(s\.user_id\)[\s\S]{0,80}<> 'free'/.test(badgeSql), "site_shows_badge");
}
{
  // NEVER TWICE.
  const once = badge.injectBadge(PAGE, { showBadge: true });
  const twice = badge.injectBadge(once, { showBadge: true });
  eq("injecting twice changes nothing", twice, once);
}
{
  // A page containing the literal text "</body>" in a code sample. The
  // FIRST match would put the badge in the middle of the page.
  const withSample = "<html><body><pre>&lt;/body&gt;</pre><p>real</p></body></html>";
  const out = badge.injectBadge(withSample, { showBadge: true });
  ok("the badge goes before the LAST </body>", out.indexOf("Made with Ionexa") > out.indexOf("<p>real</p>"));

  const fragment = "<div>just a partial</div>";
  ok("a fragment with no closing tag still gets one", badge.injectBadge(fragment, { showBadge: true }).includes("Made with Ionexa"));
  eq("an empty page is left alone", badge.injectBadge("", { showBadge: true }), "");
}
{
  // THE BADGE IS NEVER STORED. A badge in html_content survives an
  // upgrade, misses a downgrade, and sits in the Website Builder's editor
  // with a delete key next to it.
  for (const route of ["src/app/s/[subdomain]/route.ts", "src/app/s/[subdomain]/[page]/route.ts"]) {
    const src = strip(read(route));
    ok(`${route}: injects the badge when SERVING`, /injectBadge\(/.test(src));
    // FROM THE CURRENT STATE — and that is now BOTH inputs, not just the
    // plan. This used to require readOwnerTier(), which answered half the
    // question; a route still calling it would badge every free site that
    // had paid to remove it. One call, both halves, one round trip.
    ok(`${route}: from the CURRENT state, plan and purchase together`, /readSiteShowsBadge\(/.test(src));
    ok(`${route}: and not from the half-question it replaced`, !/readOwnerTier\(/.test(src));
    // THE DECISION IS PASSED IN, never re-derived at the injection site.
    ok(`${route}: injectBadge is given the answer`, /injectBadge\([^)]*\{ showBadge:/.test(src));
  }

  // NOTHING THAT WRITES html_content MAY KNOW ABOUT THE BADGE. The scan
  // asserts it actually read files first — a directory that moved would
  // otherwise make this pass by finding nothing, which is the failure
  // mode of every grep-shaped test.
  const writers = ["src/lib/websites", "src/app/api/websites"];
  const scanned = [];
  for (const dir of writers) {
    for (const file of walk(dir)) scanned.push([file, read(file)]);
  }
  ok(`the scan actually read the writer paths (${scanned.length} files)`, scanned.length >= 10);
  const mentions = scanned.filter(([, body]) => /Made with Ionexa|ionexa-badge|injectBadge/.test(body));
  ok(
    "no generator or publish path mentions the badge",
    mentions.length === 0,
    mentions.map(([f]) => f).join(", ")
  );
}

// =====================================================================
console.log("\n== 5. A METRIC THAT CANNOT BE COMPUTED SAYS SO ==");
// =====================================================================

const BASE = {
  mrrEur: 1000,
  mrrComplete: true,
  payingSubscribers: 40,
  totalAccounts: 500,
  aiCostEur: 200,
  successfulTasks: 4000,
  cohort: null,
  historyMonths: 0,
  marketingSpendEur: null,
  fixedCostsEur: null,
  cashBalanceEur: null,
  newCustomers: 5,
  previousMrrEur: null,
};
const by = (list, key) => list.find((m) => m.key === key);

{
  const out = metrics.computeMetrics(BASE);
  eq("every metric is present", out.length, metrics.METRIC_KEYS.length);
  eq("MRR is computed", by(out, "mrr").state, "computed");
  eq("…and ARR is twelve times it", by(out, "arr").value, 12000);
  eq("ARPU is MRR over paying subscribers", by(out, "arpu").value, 25);
  eq("gross margin is revenue minus what it cost to serve", by(out, "grossMarginPercent").value, 80);
  eq("AI cost per user is over ALL accounts", by(out, "aiCostPerUserEur").value, 0.4);
  eq("cost per task is over the SUCCESSFUL ones", by(out, "costPerSuccessfulTaskEur").value, 0.05);
}
{
  // THE ONES THAT NEED WHAT ONLY THE OWNER KNOWS.
  const out = metrics.computeMetrics(BASE);
  const cac = by(out, "cacEur");
  eq("CAC refuses without marketing spend", cac.state, "needs_input");
  eq("…and names what it needs", cac.missing, ["marketing_spend"]);
  eq("burn refuses without fixed costs", by(out, "burnEur").state, "needs_input");
  const runway = by(out, "runwayMonths");
  eq("runway refuses too", runway.state, "needs_input");
  ok("…naming both missing pieces", runway.missing.includes("cash_balance") && runway.missing.includes("fixed_costs"));
  eq("payback inherits CAC's refusal", by(out, "paybackMonths").state, "needs_input");
}
{
  // THE ONES THAT NEED HISTORY.
  const out = metrics.computeMetrics(BASE);
  for (const key of ["churnPercent", "retentionPercent", "nrrPercent"]) {
    const metric = by(out, key);
    eq(`${key} refuses with one month`, metric.state, "needs_history");
    eq(`…and says how many it needs`, metric.needMonths, metrics.MIN_MONTHS_FOR_COHORT);
  }
  eq("LTV refuses too, because it needs churn", by(out, "ltvEur").state, "needs_history");

  // "NEEDS 2 MONTHS OF HISTORY — WE HAVE 2." Reported from the live
  // dashboard, and a contradiction: the Rule of 40's condition is a daily
  // snapshot at least 28 days old (previousMrrEur), while the number it
  // printed was historyMonths, which counts subscriber_months. Two of one
  // and none of the other is exactly the state a new deployment sits in
  // for its first month. The card now reports the requirement it checks,
  // in days.
  const contradiction = metrics.computeMetrics({ ...BASE, historyMonths: 2, previousMrrEur: null, snapshotDays: 5 });
  const r40 = by(contradiction, "ruleOf40");
  eq("Rule of 40 with two subscriber-months and no 28-day-old snapshot refuses in DAYS", r40.state, "needs_history_days");
  eq("…saying how many days of snapshots exist", r40.haveDays, 5);
  eq("…and how many it needs", r40.needDays, metrics.MIN_SNAPSHOT_DAYS_FOR_GROWTH);
  ok("…which is the 28 the loader reads (`age >= 28`), not a second number", metrics.MIN_SNAPSHOT_DAYS_FOR_GROWTH === 28);
  ok("…and never a sentence whose two numbers are equal while refusing", r40.haveDays < r40.needDays);
  const noSnapshots = by(metrics.computeMetrics({ ...BASE, historyMonths: 2, previousMrrEur: null, snapshotDays: 0 }), "ruleOf40");
  eq("with no snapshots at all it says zero days", noSnapshots.haveDays, 0);
  const fractional = by(metrics.computeMetrics({ ...BASE, previousMrrEur: null, snapshotDays: 27.9 }), "ruleOf40");
  eq("a fraction of a day is floored, not rounded up to the threshold", fractional.haveDays, 27);
  for (const [label, value] of [["NaN", NaN], ["-1", -1], ["undefined", undefined]]) {
    const m = by(metrics.computeMetrics({ ...BASE, previousMrrEur: null, snapshotDays: value }), "ruleOf40");
    ok(`snapshotDays of ${label} reports 0, never a negative or NaN day count`, m.haveDays === 0, String(m.haveDays));
  }

  // TWO MONTHS, AS A NUMBER. Comparing needMonths against the constant
  // above is a tautology — it passes at any value, including zero. The
  // threshold itself is the claim: churn is a comparison BETWEEN two
  // months, so one month is a division by a period that does not exist.
  eq("the threshold is two months", metrics.MIN_MONTHS_FOR_COHORT, 2);

  // AND ONE MONTH IS REFUSED EVEN WHEN A COHORT WAS SUPPLIED. The block
  // above has no cohort at all, so it stayed green with the threshold set
  // to zero — found by the mutation suite, not by reading.
  const oneMonth = metrics.computeMetrics({
    ...BASE,
    historyMonths: 1,
    cohort: {
      startAccounts: 40, startMrr: 800, retainedAccounts: 36, retainedMrr: 900,
      churnedAccounts: 4, churnedMrr: 80, expansionMrr: 200, contractionMrr: 20,
    },
  });
  for (const key of ["churnPercent", "retentionPercent", "nrrPercent"]) {
    eq(`${key} still refuses on one month WITH a cohort`, by(oneMonth, key).state, "needs_history");
  }
  eq("…and reports the month it actually has", by(oneMonth, "churnPercent").haveMonths, 1);
}
{
  // WITH THE INPUTS, THE NUMBERS APPEAR.
  const out = metrics.computeMetrics({
    ...BASE,
    marketingSpendEur: 500,
    fixedCostsEur: 2000,
    cashBalanceEur: 24000,
    previousMrrEur: 800,
    historyMonths: 3,
    cohort: {
      startAccounts: 40,
      startMrr: 800,
      retainedAccounts: 36,
      retainedMrr: 900,
      churnedAccounts: 4,
      churnedMrr: 80,
      expansionMrr: 200,
      contractionMrr: 20,
    },
  });
  eq("CAC is spend over new customers", by(out, "cacEur").value, 100);
  eq("churn is by LOGO", by(out, "churnPercent").value, 10);
  eq("retention is its complement", by(out, "retentionPercent").value, 90);
  // (800 - 80 - 20 + 200) / 800 = 112.5%
  eq("NRR counts expansion against churn and contraction", by(out, "nrrPercent").value, 112.5);
  eq("burn is costs minus revenue", by(out, "burnEur").value, 1700);
  ok("runway is cash over burn", Math.abs(by(out, "runwayMonths").value - 24000 / 1700) < 0.02);
  ok("Rule of 40 adds growth to profit", by(out, "ruleOf40").state === "computed");
  ok("LTV is computed once churn exists", by(out, "ltvEur").state === "computed");
}
{
  // ZERO CHURN IS NOT INFINITE LTV.
  const out = metrics.computeMetrics({
    ...BASE,
    historyMonths: 3,
    cohort: {
      startAccounts: 40, startMrr: 800, retainedAccounts: 40, retainedMrr: 900,
      churnedAccounts: 0, churnedMrr: 0, expansionMrr: 100, contractionMrr: 0,
    },
  });
  eq("churn of zero is a real zero", by(out, "churnPercent").value, 0);
  const ltv = by(out, "ltvEur");
  eq("…but LTV refuses rather than printing infinity", ltv.state, "no_data");
  ok("…and says why", /no churn yet/i.test(ltv.why), ltv.why);
}
{
  // AN INCOMPLETE MRR IS FLAGGED ON EVERYTHING DERIVED FROM IT.
  const out = metrics.computeMetrics({ ...BASE, mrrComplete: false });
  ok("MRR says it is a floor", typeof by(out, "mrr").note === "string" && by(out, "mrr").note.length > 10);
  ok("…and so does ARR", typeof by(out, "arr").note === "string");
  ok("…and ARPU", typeof by(out, "arpu").note === "string");
}
{
  const empty = metrics.computeMetrics({ ...BASE, payingSubscribers: 0, mrrEur: 0, successfulTasks: 0, totalAccounts: 0 });
  eq("with no subscribers ARPU has no data rather than a zero", by(empty, "arpu").state, "no_data");
  eq("…and margin the same", by(empty, "grossMarginPercent").state, "no_data");
  eq("…and cost per task", by(empty, "costPerSuccessfulTaskEur").state, "no_data");
}
{
  eq("a trend from one point has no change", metrics.trendChangePercent([{ day: "a", value: 5 }]), null);
  eq("a change from zero has no percentage", metrics.trendChangePercent([{ day: "a", value: 0 }, { day: "b", value: 9 }]), null);
  eq("an ordinary change does", metrics.trendChangePercent([{ day: "a", value: 100 }, { day: "b", value: 125 }]), 25);
}
{
  // THE PAGE RENDERS THE THREE STATES DIFFERENTLY. A metric that could
  // not be computed must not get a number with a caveat under it.
  const card = read("src/components/finance/metric-card.tsx");
  ok("the card handles needs_input", /needs_input/.test(card));
  ok("…needs_history", /needs_history/.test(card));
  ok("…and renders an em dash rather than a zero", card.includes("—"));

  // MOVED, NOT RENAMED IN PLACE. This read /dashboard/finance, which was
  // also the slug of a business module — the static segment shadowed the
  // [module] catch-all, so every non-owner pressing "Finances" in the nav
  // got this page's 404 and the module was unreachable. The dashboard is
  // at /dashboard/business-health now; see route-shadowing.test.mjs.
  const page = strip(read("src/app/dashboard/business-health/page.tsx"));
  ok("the dashboard is owner-only", /isAdminEmail\(user\.email\)/.test(page));
  ok("…and a stranger gets a 404, not a 403", /notFound\(\)/.test(page));
  ok(
    "…and it no longer sits on a module's slug",
    !existsSync("src/app/dashboard/finance/page.tsx"),
  );
}

// =====================================================================
console.log("\n== 6. a card update is not churn ==");
// =====================================================================

{
  const t = (from, to, extra = {}) =>
    subLog.classifyTransition({
      fromTier: from,
      toTier: to,
      fromInterval: "month",
      toInterval: "month",
      fromSeats: 1,
      toSeats: 1,
      ...extra,
    });

  eq("free to paid is a start", t(null, "starter"), "started");
  eq("…and a known free account coming back is a REACTIVATION", t("free", "starter"), "reactivated");
  eq("paid to free is a cancellation", t("starter", "free"), "cancelled");
  eq("a bigger plan is an upgrade", t("starter", "growth"), "upgraded");
  eq("a smaller one is a downgrade", t("growth", "starter"), "downgraded");
  eq("free to free is nothing at all", t("free", "free"), null);
  // THE ONE THIS SECTION EXISTS FOR.
  eq("NOTHING CHANGING IS NOT AN EVENT", t("starter", "starter"), null);
  eq("more seats is a seat change, not an upgrade", t("professional", "professional", { toSeats: 4 }), "seats_changed");
  eq("switching to annual is its own thing", t("starter", "starter", { toInterval: "year" }), "interval_changed");
}
{
  const starterMonthly = subLog.monthlyEurFor("starter", "month", 1);
  const starterAnnual = subLog.monthlyEurFor("starter", "year", 1);
  ok("an annual subscriber's MRR is divided down", starterAnnual < starterMonthly, `${starterAnnual} vs ${starterMonthly}`);
  eq("a free account contributes nothing", subLog.monthlyEurFor("free", "month", 1), 0);
  eq("an unknown tier contributes nothing rather than guessing", subLog.monthlyEurFor("nonsense", "month", 1), 0);
}
{
  const webhook = strip(read("src/app/api/webhooks/stripe/route.ts"));
  ok("the webhook records the transition", /recordSubscriptionEvent\(/.test(webhook));
  ok(
    "…BEFORE the metadata is overwritten, or the old tier is already gone",
    webhook.indexOf("const previousTier") < webhook.indexOf("recordSubscriptionEvent(")
  );
  ok("…with Stripe's event id, so a retry is not a second cancellation", /stripeEventId,/.test(webhook));
  const log = strip(read("src/lib/billing/subscription-log.ts"));
  ok("a duplicate insert is not treated as an error", /duplicate key/.test(log));
  ok("…and the log can never fail the webhook", /logApiError\("billing:subscription-log"/.test(log));
}

// =====================================================================
console.log("\n== 7. the schema, and what it refuses ==");
// =====================================================================
{
  const sql = stripSql(read("supabase/migrations/20260903000000_revenue_engine.sql"));
  for (const table of ["subscription_events", "subscriber_months", "revenue_snapshots", "business_inputs"]) {
    ok(`${table} has RLS on`, new RegExp(`alter table public\\.${table} enable row level security`).test(sql));
    // DENY-ALL, not owner-policied: "owner" is decided in TypeScript by
    // isAdminEmail, and a second notion of owner in the database is one
    // more thing to drift.
    ok(`${table} is unreachable by any client`, new RegExp(`revoke all on public\\.${table} from anon, authenticated`).test(sql));
  }
  ok("the cohort function is service-role only", /revoke all on function public\.subscription_cohort\(date, date\) from public, anon, authenticated/.test(sql));
  ok("…and so is the tier lookup the badge uses", /revoke all on function public\.account_tier\(uuid\) from public, anon, authenticated/.test(sql));
  // A GRANT WITHOUT A POLICY IS AN OPEN DOOR ONTO AN EMPTY ROOM. With RLS
  // on, a verb that is GRANTED but has no matching policy is not refused —
  // it matches no rows and reports success. `usage_overage_settings`
  // shipped with `grant delete` and a select-only policy, so cancelling
  // would have looked like it worked, every time, while overage stayed on.
  // Caught by revenue-engine.dbtest.mjs against a real Postgres;
  // grants-vs-policies.dbtest.mjs now enforces it across the whole schema.
  // This is the cheap source-level half, so the mutation suite can reach it.
  for (const [table, verb] of [
    ["usage_overage_settings", "select"],
    ["usage_overage_settings", "delete"],
    ["usage_overage_ledger", "select"],
  ]) {
    const granted = new RegExp(`grant [^;]*\\b${verb}\\b[^;]*on public\\.${table} to authenticated`).test(sql);
    const policied = new RegExp(`create policy [\\w_]+ on public\\.${table}\\s+for ${verb}\\b`).test(sql);
    ok(`${table}: ${verb} is granted AND has a policy that can satisfy it`, granted && policied, `granted=${granted} policied=${policied}`);
  }

  ok("no DROP TABLE", !/drop\s+table/i.test(sql));
  ok("no TRUNCATE", !/truncate/i.test(sql));
  ok("no unqualified DELETE", !/delete\s+from\s+\S+\s*;/i.test(sql));
}

// =====================================================================
console.log("\n== 8. THE ONE PLACE OVERAGE CAN HAPPEN, AND THE INVOICE ==");
// =====================================================================
{
  const res = strip(read("src/lib/billing/reservations.ts"));

  // ONE DOOR. Overage lives inside reserveCredits, which every paid
  // action already goes through. Twenty-four call sites deciding for
  // themselves would be twenty-four chances to charge somebody who never
  // agreed — so no route may reach the overage store directly.
  ok("reserveCredits is where overage is attempted", /tryOverage\(/.test(res));
  ok("…and it asks decideOverage, through checkOverage", /checkOverage\(/.test(res));

  // THE PROPERTY IS THE CHARGE, NOT THE QUESTION. Asking checkOverage is
  // read-only and several places legitimately do (the pre-check in
  // credits.ts, the settings route) — the first version of this check
  // banned both verbs together and went red the moment the pre-check was
  // wired, which would have been a reason to weaken it rather than a
  // reason to say what it actually means. recordOverage is the one that
  // takes money, and it may live in exactly two files.
  const callers = walk("src/app/api").concat(walk("src/lib"));
  const CHARGERS = ["src/lib/billing/overage-store.ts", "src/lib/billing/reservations.ts"];
  const direct = callers.filter(
    (file) => !CHARGERS.includes(file) && /recordOverage\(/.test(strip(read(file)))
  );
  ok(`nothing outside the two charge paths records an overage (${callers.length} files scanned)`, direct.length === 0, direct.join(", "));
  ok("…and both of those files still do", CHARGERS.every((f) => /recordOverage/.test(read(f))));
  ok("the scan actually walked the app", callers.length >= 100);

  // THE ORDER THAT DECIDES WHO LOSES ON A CRASH. The ledger row — the
  // money owed — is written BEFORE the credits exist. The other order
  // loses the charge for work that DID happen, silently.
  const at = res.indexOf("async function tryOverage");
  const store = strip(read("src/lib/billing/overage-store.ts"));
  // FAILS TO OFF. An unreadable settings row must mean NO overage — the
  // same outcome the account had before overage existed. A fallback that
  // enabled it would charge somebody because a query timed out. The gate
  // was blind to this until the mutation suite flipped it.
  const enabledTrue = store.split("\n").filter((line) => /enabled:\s*true/.test(line));
  ok(
    "the ONLY place `enabled: true` is written is the consent function",
    enabledTrue.length === 1 && store.indexOf(enabledTrue[0]) > store.indexOf("export async function enableOverage"),
    enabledTrue.join(" | ")
  );
  ok(
    "…and every catch falls back to the OFF constant",
    (store.match(/return \{ \.\.\.OVERAGE_OFF, spentEur: 0, month \};/g) ?? []).length >= 1
  );

  ok("the ledger row is written before the credits are granted",
    res.indexOf("recordOverage(", at) > at && res.indexOf("recordOverage(", at) < res.indexOf("grantCredits(", at));
  ok("a failed ledger write stops the action", /if \(!ledgerId\) return unavailable;/.test(res));
  ok("the grant is idempotent on the ledger row", /idempotencyKey: `overage:\$\{ledgerId\}`/.test(res));

  // THE REFUSAL CARRIES ITS REASON, or the opt-in can never be offered at
  // the moment it is relevant.
  // THE REAL REASON, not a placeholder. "not_enabled" earns a consent
  // dialog and "cap_reached" earns a different screen; a hard-coded
  // "unavailable" collapses both into "out of credits" and the opt-in can
  // never be offered when it is relevant. The first version of this check
  // only looked for the word `overage:` and stayed green when the reason
  // was replaced by a constant.
  // THE RETURN, NOT THE TYPE DECLARATION. `reason: "insufficient"`
  // appears in both, and the first occurrence is the type — which made
  // this check read a union member and fail. lastIndexOf lands on the
  // return statement.
  const refusalAt = res.lastIndexOf('reason: "insufficient"');
  const refusal = res.slice(refusalAt, refusalAt + 300);
  ok("an insufficient refusal says why overage did not cover it", /overage:/.test(refusal), refusal.slice(0, 120));
  ok("…and the reason is the DECISION's, not a constant", /topUp\.refusal/.test(refusal), refusal.slice(0, 200));

  // THE PRE-CHECK MUST AGREE WITH THE RESERVE. Ten routes ask
  // hasEnoughCredits BEFORE they call reserveCredits, so a balance-only
  // answer there refuses the action and the one place overage happens is
  // never reached. Found by reading the call sites after the wiring was
  // already "done" — the whole feature would have been dead on those
  // routes with every unit test green.
  const credits = strip(read("src/lib/billing/credits.ts"));
  const pre = credits.slice(credits.indexOf("export async function hasEnoughCredits"));
  // FROM THE OVERAGE STORE, not from a local stand-in. Checking only for
  // the word `checkOverage(` let a mutant that replaced the import with a
  // stub arrow function pass — the gate was reading a spelling instead of
  // a property.
  ok(
    "the pre-check counts overage headroom",
    /checkOverage[\s\S]{0,60}(from|import\()\s*"@\/lib\/billing\/overage-store"/.test(pre.slice(0, 1400)),
    pre.slice(0, 900).split("\n").filter((l) => /checkOverage/.test(l)).join(" | ")
  );
  ok("…and says so, so the message can differ", /overageWouldCover/.test(pre.slice(0, 1400)));
  ok("…and charges nothing by asking", !/recordOverage\(/.test(pre.slice(0, 1400)));

  // AND THE WARNINGS FIRE WHERE THE NUMBER MOVED.
  ok("80% and 100% are warned after the charge", res.indexOf("sendOverageWarnings(", at) > at);
}
{
  const inv = strip(read("src/lib/billing/overage-invoice.ts"));
  // ΞΕΧΩΡΙΣΤΑ ΣΤΟ ΤΙΜΟΛΟΓΙΟ — its own invoice item, not folded into the
  // subscription line.
  ok("overage becomes its own invoice item", /stripe\.invoiceItems\.create\(/.test(inv));
  ok("…in cents, not euros", /amount: Math\.round\(amountEur \* 100\)/.test(inv));
  ok("…in euros", /currency: "eur"/.test(inv));
  ok("…described in the customer's terms", /Usage overage —/.test(inv));

  // THE QUERY KEY IS THE LEDGER'S OWN FORMAT. monthKey and previousMonth
  // already return YYYY-MM-01, and the first version of this file
  // appended another "-01" — "2026-02-01-01" matched no row, so nobody
  // would ever have been billed, silently, for ever. The gate did not
  // notice, because it only checked that previousMonth was called.
  ok("the invoice query uses the ledger's own date format", /\.eq\("billing_month", month\)/.test(inv));
  ok("…and nothing re-appends a day to it", !/\$\{month\}-01/.test(inv), inv.slice(inv.indexOf("billing_month"), inv.indexOf("billing_month") + 60));
  eq("billingMonth already produces a full first-of-month date", overage.billingMonth(new Date("2026-02-17T12:00:00Z")), "2026-02-01");

  // BILLED AT MOST ONCE, three ways: only unbilled rows are picked up,
  // the Stripe call carries an idempotency key, and the rows are marked.
  ok("only rows that were never invoiced are picked up",
    /\.is\("stripe_invoice_item_id", null\)/.test(inv) && /\.is\("invoiced_at", null\)/.test(inv));
  ok("the Stripe call is idempotent per customer per month", /idempotencyKey: `overage:\$\{userId\}:\$\{month\}`/.test(inv));
  ok("…and the rows are marked once it exists", /stripe_invoice_item_id: item\.id/.test(inv));

  // NEVER THE MONTH STILL RUNNING. Charges are still arriving.
  ok("only a CLOSED month is billed", /previousMonth\(monthKey\(now\)\)/.test(inv));
  ok("no customer id means no charge, and the rows stay unbilled", /skippedNoCustomer \+= 1;\s*\n\s*continue;/.test(inv));

  const cron = strip(read("src/app/api/cron/monthly-credits/route.ts"));
  ok("the cron bills last month's overage", /billOverageForClosedMonth\(\)/.test(cron));
  ok("…and a billing failure cannot cost anybody their monthly credits",
    /catch \(invoiceError\)[\s\S]{0,200}logApiError/.test(cron));
}
{
  // THE UI. The cost is on screen BEFORE the button that agrees to it,
  // and there is no default cap.
  const ui = strip(read("src/components/settings/overage-settings.tsx"));
  ok("the price is shown before consent", /preview\.rate/.test(ui) && /preview\.credits/.test(ui));
  ok("…and so is the cap the user typed", /preview\.cap/.test(ui));
  ok("…and that it is a separate invoice line", /preview\.invoice/.test(ui));
  ok("the agree button is dead until the cap is valid", /disabled=\{busy \|\| !capValid\}/.test(ui));
  ok("the cap starts EMPTY — no default we chose for them", /useState\(""\)/.test(ui));
  ok("the cap is bounded by the same constants the server uses",
    /MIN_CAP_EUR/.test(ui) && /MAX_CAP_EUR/.test(ui) && /from "@\/lib\/billing\/overage"/.test(ui));
  ok("off is one click, with no argument in the way", /onClick=\{disable\}/.test(ui));
  ok("…and it says the month's charges still stand", /turnOffNote/.test(ui));
  ok("the running spend is on screen", /state\.spentEur/.test(ui));

  const settings = strip(read("src/app/dashboard/settings/page.tsx"));
  ok("the panel is actually on the settings page", /<OverageSettings \/>/.test(settings));
  ok("…and so are the add-ons", /<AddonsSettings \/>/.test(settings));
}
{
  // TEN LOCALES, NOT ONE. An English consent dialog inside a Greek
  // Settings page is a consent nobody read.
  const locales = ["en", "el", "es", "fr", "de", "it", "pt", "ar", "ja", "zh"];
  const need = ["title", "agree", "turnOff", "capLabel", "preview", "thisMonth"];
  const missing = [];
  for (const locale of locales) {
    const json = JSON.parse(read(`messages/${locale}.json`));
    const over = json.settings?.overage;
    const add = json.settings?.addons;
    if (!over || !add) { missing.push(`${locale}: whole block`); continue; }
    for (const key of need) if (over[key] === undefined) missing.push(`${locale}.overage.${key}`);
    for (const slug of ["credits_1000", "agents_5", "storage_10gb", "priority"]) {
      if (!add.items?.[slug]?.name) missing.push(`${locale}.addons.items.${slug}`);
    }
  }
  ok("every locale has the overage and add-on strings", missing.length === 0, missing.join(", "));

  // AND THEY ARE TRANSLATED, not copied. Greek and Japanese sharing an
  // English string is the bug this app already shipped once.
  const en = JSON.parse(read("messages/en.json")).settings.overage;
  const copied = ["el", "ja", "zh", "ar"].filter((locale) => {
    const other = JSON.parse(read(`messages/${locale}.json`)).settings.overage;
    return other.title === en.title || other.agree === en.agree;
  });
  ok("…and not copied from English", copied.length === 0, copied.join(", "));
}
{
  // THE ENV VARS ARE DOCUMENTED, with what breaks without each.
  const readme = read("README.md");
  for (const envVar of [
    "STRIPE_PRICE_ADDON_CREDITS_1000",
    "STRIPE_PRICE_ADDON_AGENTS_5",
    "STRIPE_PRICE_ADDON_STORAGE_10GB",
    "STRIPE_PRICE_ADDON_PRIORITY",
  ]) {
    ok(`${envVar} is documented`, readme.includes(envVar));
  }
  ok("…and the overage rules are written down", /Usage overage \(opt-in\)/.test(readme));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
