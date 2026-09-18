// TWO WRITES, AND WHAT IS LEFT WHEN THE SECOND ONE DOES NOT HAPPEN.
//
// 38 of 143 routes perform two or more distinct durable writes. That is
// the population no gate looked at: every other instrument asks whether a
// route is ALLOWED to write, and none asks what state it leaves when the
// first write lands and the second does not.
//
// TEN WERE READ BY HAND ON 2026-09-19 — the ten touching money or
// publishing — and THREE were broken. All three are here, each with the
// clause that would have caught it:
//
//   api/cron/scheduled-runs        a scheduled run whose AI call succeeded
//     but matched no module was marked failed WITHOUT releasing the
//     reservation, four lines below a path that releases it. The user's
//     credits sat held until the daily sweep, for a run that produced
//     nothing. The automations loop in the same file decides it correctly
//     in one branch — `!result.ok || !result.matched` — which is both the
//     defect and the proof of what it should be.
//
//   api/billing/addons             a recurring add-on whose subscription
//     item id was null was SKIPPED by the cancellation loop and then
//     marked cancelled. The product stopped delivering and the card went
//     on paying — word for word the outcome the comment further down that
//     same loop was written to prevent, closed for the Stripe-error path
//     and left open for the null-id path.
//
//   api/published/[id]/rollback    restored html_content and never pages,
//     so a multi-page rollback served a home page from version N with
//     sub-pages from the live version and a nav pointing at whichever
//     survived. 20260822000000_website_pages.sql's own header describes
//     this exact case and names this route.
//
// WHAT THIS FILE IS NOT. It does not try to prove every multi-write route
// is reversible — that is a judgement about what each pair means, and
// nine of the ten read by hand were right for reasons a regex cannot see
// (Stripe first then the local record; a compensating status write; an
// entitlement preserved on purpose). It holds the three that were wrong,
// by name and by mechanism, plus the population floor that says the
// question is still being asked of a real set.
//
// Run: node scripts/tests/multi-write-reversal.test.mjs
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

// Comments stripped. Every route below explains its own reversibility in
// prose, and two of them QUOTE the broken form while explaining why it is
// gone — so an unstripped scan reads the explanation as the defect.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(routes.map((f) => [f, strip(readFileSync(f, "utf8"))]));

// ---------------------------------------------------------------------
// THE POPULATION, so the three below are not the whole claim.
// ---------------------------------------------------------------------
const WRITE_KINDS = [
  /\.from\(\s*"[a-z_0-9]+"\s*\)\s*\n?\s*\.insert\s*\(/g,
  /\.from\(\s*"[a-z_0-9]+"\s*\)\s*\n?\s*\.update\s*\(/g,
  /\.from\(\s*"[a-z_0-9]+"\s*\)\s*\n?\s*\.upsert\s*\(/g,
  /\.from\(\s*"[a-z_0-9]+"\s*\)\s*\n?\s*\.delete\s*\(/g,
  /\.storage\s*\n?\s*\.from\s*\(/g,
  /stripe\s*\.\s*[a-zA-Z]+\s*\.\s*(create|update|del|cancel)\s*\(/g,
];
const writesIn = (src) =>
  new Set(WRITE_KINDS.flatMap((re) => [...src.matchAll(new RegExp(re.source, "g"))].map((m) => m[0].replace(/\s+/g, ""))))
    .size;
const multiWrite = routes.filter((f) => writesIn(SOURCE.get(f)) >= 2);

check(`routes found (${routes.length})`, routes.length >= 100, "the walk found almost nothing");
check(
  `routes with two or more distinct writes (${multiWrite.length})`,
  multiWrite.length >= 20,
  "the write detector matched almost nothing, so the population this file is about is empty"
);
check(
  "…and that is a minority of the tree, not all of it",
  multiWrite.length < routes.length / 2,
  "every route counts as multi-write — the detector is matching something it should not, and the number above means nothing"
);

// ---------------------------------------------------------------------
// 1. THE SCHEDULED RUN THAT MATCHED NOTHING.
// ---------------------------------------------------------------------
const CRON = "src/app/api/cron/scheduled-runs/route.ts";
const cron = SOURCE.get(CRON) ?? "";
check(`${CRON} is in the population`, multiWrite.includes(CRON));

// The block from the not-matched test to its `continue`. Bounded so a
// release belonging to a DIFFERENT branch cannot satisfy this.
const notMatchedAt = cron.indexOf("if (!result.matched) {");
const notMatchedBlock = notMatchedAt === -1 ? "" : cron.slice(notMatchedAt, cron.indexOf("continue;", notMatchedAt));
check(
  "the not-matched branch was located",
  notMatchedAt !== -1 && notMatchedBlock.length > 0,
  "the branch was renamed or restructured — re-anchor before trusting the check below"
);
check(
  "a scheduled run that matched nothing releases its hold",
  /releaseReservation\s*\(\s*userId\s*,\s*runReservationId\s*\)/.test(notMatchedBlock),
  "the AI call has already run here, so this is not a free path: without the release the user's credits sit held until the daily sweep, for a run that produced no record."
);
// AND ITS NEIGHBOUR, so the pair cannot be half-right again.
const notOkAt = cron.indexOf("if (!result.ok) {");
const notOkBlock = notOkAt === -1 ? "" : cron.slice(notOkAt, cron.indexOf("continue;", notOkAt));
check(
  "…and so does the failed-call branch beside it",
  /releaseReservation\s*\(\s*userId\s*,\s*runReservationId\s*\)/.test(notOkBlock),
  "the branch that was already correct has stopped being so"
);
// The automations loop decided this correctly all along, in one branch.
check(
  "the automations loop still decides both cases together",
  /if \(!result\.ok \|\| !result\.matched\) \{[\s\S]{0,200}releaseReservation\s*\(\s*userId\s*,\s*autoReservationId\s*\)/.test(cron),
  "the loop that was right is the evidence for what the other one should do; if it changes, re-derive rather than copying this file"
);

// ---------------------------------------------------------------------
// 2. THE ADD-ON WITH NO SUBSCRIPTION ITEM.
// ---------------------------------------------------------------------
const ADDONS = "src/app/api/billing/addons/route.ts";
const addons = SOURCE.get(ADDONS) ?? "";
check(`${ADDONS} is in the population`, multiWrite.includes(ADDONS));
check(
  "a recurring add-on with no item id is never skipped",
  !/if \(!itemId\) continue;/.test(addons),
  "skipping it falls through to the update below, which marks the row cancelled while the subscription item lives on — the product stops delivering and the card goes on paying."
);
check(
  "…it is recovered from the account's subscription instead",
  /recoverSubscriptionItemId\s*\(/.test(addons) && /subscription\.items\.data\.find/.test(addons),
  "the same lookup api/webhooks/stripe does at purchase time, run again when it usually succeeds"
);
check(
  "…and a recovery that fails refuses rather than cancelling locally",
  /if \(!itemId\)[\s\S]{0,1200}status: 502/.test(addons),
  "returning ok here would be the exact defect: a row saying cancelled with billing still running"
);
// The Stripe-error path that was already right.
check(
  "the Stripe-failure path still refuses too",
  /alreadyGone[\s\S]{0,300}status: 502/.test(addons),
  "the half of this loop that was already correct has regressed"
);
// The one-off case is refused before the loop, which is what makes a null
// item id in the loop unambiguous rather than a legitimate shape.
check(
  "one-off add-ons are refused before the loop, so a null there is never innocent",
  /billing === "one_off"[\s\S]{0,300}one_off_cannot_be_cancelled/.test(addons),
  "without this, a null item id could mean a credit pack and the check above would be wrong to refuse"
);

// ---------------------------------------------------------------------
// 3. THE ROLLBACK THAT RESTORED HALF A SITE.
// ---------------------------------------------------------------------
const ROLLBACK = "src/app/api/published/[id]/rollback/route.ts";
const rollback = SOURCE.get(ROLLBACK) ?? "";
check(`${ROLLBACK} is in the population`, multiWrite.includes(ROLLBACK));
check(
  "the rollback reads the version's pages",
  /\.select\("id, html_content, pages, version_number"\)/.test(rollback),
  "selecting only html_content is how a multi-page rollback served a home page from one version and sub-pages from another"
);
check(
  "…writes them back to the published snapshot",
  /from\("published_sites"\)[\s\S]{0,300}pages: restoredPages\.length > 0 \? restoredPages : null/.test(rollback),
  "/s/<subdomain> reads published_sites, not site_versions — a page not written here is a nav link to a 404"
);
check(
  "…scans every document it is about to serve, not just the home page",
  /\[html, \.\.\.restoredPages\.map/.test(rollback),
  "a sub-page restored without the scan skipped the check its own home page passed"
);
check(
  "…and records them on the new version, so rolling back a rollback works",
  /from\("site_versions"\)\.insert\(\{[\s\S]{0,300}pages: restoredPages/.test(rollback),
  "without this the defect reappears one level down"
);
// The migration that added the column says this route restores it. If
// that sentence stops being there, this section's reason has moved.
const PAGES_MIGRATION = "supabase/migrations/20260822000000_website_pages.sql";
check(
  "the migration still names this route as what restores pages",
  readFileSync(PAGES_MIGRATION, "utf8").includes("/api/published/[id]/rollback"),
  `${PAGES_MIGRATION} no longer names the route — re-read why this section exists before trusting it`
);

// ---------------------------------------------------------------------
// CONTROLS — driving the detector rather than restating it.
// ---------------------------------------------------------------------
check("control: two different tables count as two writes", writesIn('await x.from("a").insert({}); await x.from("b").insert({});') === 2);
check("control: an insert and an update count as two", writesIn('await x.from("a").insert({}); await x.from("a").update({});') === 2);
check("control: one write is not two", writesIn('await x.from("a").insert({});') === 1);
check("control: a read is not a write", writesIn('await x.from("a").select("id");') === 0);
check("control: a Stripe mutation counts", writesIn("await stripe.subscriptions.update(id, {});") === 1);
check("control: a Stripe read does not", writesIn("await stripe.subscriptions.retrieve(id);") === 0);
check(
  "control: a write named only in a comment does not count",
  writesIn(strip('// await supabase.from("a").insert({})\nconst x = 1;')) === 0,
  "the comment stripper is not running, so prose about a write counts as one"
);

console.log(`\n        ${routes.length} routes · ${multiWrite.length} write twice or more · 10 read by hand, 3 were broken`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
