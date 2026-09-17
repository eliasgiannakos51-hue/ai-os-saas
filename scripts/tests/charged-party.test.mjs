// THE ACCOUNT THAT PAYS IS THE ACCOUNT THAT ASKED.
//
// Every gate this project has about money asks HOW MUCH: does the margin
// hold on every plan (billing-coverage), does the charge look at the size
// of its input (charge-sees-input), does the route settle on measured
// usage rather than a guess (credit-flow), is the receipt shown to the
// person (credit-visibility). Not one of them asks WHO.
//
// A route that resolves the caller, reads a resource by id, and then
// reserves against the RESOURCE OWNER rather than the caller is correct
// in every one of those senses and bills a stranger. The amount is right,
// the margin holds, the receipt is accurate, and it is charged to
// somebody who did not ask for it. `reserveCredits(agent.user_id, ...)`
// is one character different from `reserveCredits(user.id, ...)`.
//
// MEASURED 2026-09-17: 30 charge sites on a request path, and every one
// charges `user.id`. Two more are in /api/cron/scheduled-runs and charge
// a `userId` read off the row the cron found, which is the correct answer
// there and is declared below. /api/agents/[id]/run — the one that most
// looks like it could bill an owner, because an agent HAS an owner — rate
// limits, reads the agent through the caller's own client so RLS settles
// ownership, and then starts the job for `user.id`.
//
// No defect. This file is what keeps that true, since nothing else in the
// build would notice the day it stopped being.
//
// Run: node scripts/tests/charged-party.test.mjs
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

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".ts")) files.push(full.replace(/\\/g, "/"));
  }
})("src");

// Comments stripped: this header spells `reserveCredits(agent.user_id,
// ...)` as the thing to prevent, and a scan that read it would report its
// own warning as an offence.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(files.map((f) => [f, strip(readFileSync(f, "utf8"))]));
check(`source files walked (${files.length})`, files.length >= 300, "the walk found almost nothing");

// The definitions themselves take the id as a parameter, so they are not
// call sites and must not be counted as ones.
const DEFINITIONS = new Set([
  "src/lib/billing/reservations.ts",
  "src/lib/billing/credits.ts",
  "src/lib/jobs/start-job.ts",
]);

// ---------------------------------------------------------------------
// EVERY SITE THAT MOVES CREDITS, AND THE FIRST ARGUMENT IT MOVES THEM
// FROM. `reserveCredits(X, ...)` and `deductCredits(X, ...)` take the
// account first; `startJob({ userId: X })` names it.
// ---------------------------------------------------------------------
// TAKING AND GIVING ARE DIFFERENT RULES. reserveCredits and deductCredits
// take credits away from an account; grantCredits puts them in. Billing a
// stranger is the defect here — granting to one is a different and much
// smaller problem (the three grant sites are signup and the Stripe
// webhook, where there is no caller at all), so grants get their own,
// weaker rule below rather than being forced through this one.
const POSITIONAL = /\b(reserveCredits|deductCredits)\s*\(\s*\n?\s*([A-Za-z_$][\w$.]*)/g;
// THE RELAYS ARE DERIVED, NOT LISTED. A helper under src/lib that charges
// an account it was HANDED is not choosing the account — the choice is at
// its call site. lib/publishing/badge-credits-store.ts deducts
// `params.userId`, and what decides whether that is right is the
// `purchaseRemoval({ userId: user.id, … })` in the route above it.
//
// So: find every lib that charges a handed-in id, take the names it
// exports, and require THOSE calls to name the caller. Matching every
// call that mentions `userId:` instead was tried first and gave 144 sites
// across 66 files — logging, inserts, anything with that key.
const RELAY_CHARGE = /\b(?:reserveCredits|deductCredits)\s*\(\s*\n?\s*(?:params\.userId|userId)\b/;
const relayNames = new Set(["startJob"]);
for (const f of files) {
  if (!f.startsWith("src/lib/") || DEFINITIONS.has(f)) continue;
  if (!RELAY_CHARGE.test(SOURCE.get(f))) continue;
  for (const m of SOURCE.get(f).matchAll(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g)) relayNames.add(m[1]);
}
const NAMED = new RegExp(
  `\\b(${[...relayNames].join("|")})\\s*\\(\\s*\\{[\\s\\S]{0,200}?userId:\\s*([A-Za-z_$][\\w$.]*)`,
  "g"
);
const GRANTS = /\bgrantCredits\s*\(\s*\n?\s*([A-Za-z_$][\w$.]*)/g;

const sites = [];
for (const f of files) {
  if (DEFINITIONS.has(f)) continue;
  const src = SOURCE.get(f);
  for (const m of src.matchAll(new RegExp(POSITIONAL.source, "g"))) {
    sites.push({ file: f, fn: m[1], account: m[2] });
  }
  for (const m of src.matchAll(new RegExp(NAMED.source, "g"))) {
    sites.push({ file: f, fn: m[1], account: m[2] });
  }
}
check(`charging relays derived from src/lib (${relayNames.size}: ${[...relayNames].join(", ")})`, relayNames.size >= 2, "no lib was found charging a handed-in id, so the relay half of this check is off");
check(`charge sites found (${sites.length})`, sites.length >= 25, "the charge-site scraper found almost nothing, so the rule below applies to nobody");
check(
  `...spread across more than one file (${new Set(sites.map((s) => s.file)).size})`,
  new Set(sites.map((s) => s.file)).size >= 15,
  "one file matched many times, which usually means the pattern is matching a definition rather than call sites"
);

// A REQUEST PATH IS ONE WHERE THERE IS A CALLER TO CHARGE. A cron has no
// caller: its accounts come off the rows it found, which is the only
// correct answer there and is why those sites are named rather than
// pattern-matched.
// EACH ENTRY NAMES THE EXPRESSION, not just the file. A file-level
// exemption is a blank cheque: a mutant that changed `row.userId` to
// `otherRow.userId` inside badge-renewal.ts left this green, because the
// file was excused rather than the account it charges.
const CHARGES_A_ROW_OWNER = {
  "src/lib/publishing/badge-renewal.ts": {
    accounts: ["row.userId"],
    why: "the monthly badge-removal renewal, called from /api/cron/monthly-credits behind CRON_SECRET. `row.userId` is the account that BOUGHT the removal and left auto-renew on; charging anyone else would be charging somebody for a subscription they do not hold.",
  },
  "src/app/api/cron/scheduled-runs/route.ts": {
    accounts: ["userId"],
    why: "cron, behind CRON_SECRET. `userId` is read off each scheduled_agent_runs / automation row it found, which IS the account that asked — when they pressed schedule. There is no caller here to charge instead: the caller is Vercel.",
  },
};

const CALLER = /^user\.id$|^userId$|^claimed\.user_id$|^params\.userId$/;
const wrong = sites
  .filter((s) => !(CHARGES_A_ROW_OWNER[s.file]?.accounts ?? []).includes(s.account))
  .filter((s) => !CALLER.test(s.account))
  .map((s) => `${s.file.replace("src/app/api/", "")}: ${s.fn}(${s.account}, …)`);
check(
  "every charge on a request path is charged to the caller",
  wrong.length === 0,
  wrong.length
    ? `${wrong.join("\n        ")}\n        ` +
      "The amount being right is a different question from the account being right. If this is a cron or a webhook with no caller, declare it in CHARGES_A_ROW_OWNER with where the id comes from."
    : ""
);

const staleDeclarations = Object.keys(CHARGES_A_ROW_OWNER).filter((f) => !sites.some((s) => s.file === f));
check("no declaration names a file that no longer charges anyone", staleDeclarations.length === 0, staleDeclarations.join(", "));
for (const [f, entry] of Object.entries(CHARGES_A_ROW_OWNER)) {
  check(`${f.replace("src/app/api/", "")}: the reason is an argument`, entry.why.length >= 60, entry.why);
  const used = sites.filter((s) => s.file === f).map((s) => s.account);
  const unusedNames = entry.accounts.filter((a) => !used.includes(a));
  check(
    `${f.replace("src/app/api/", "")}: every excused expression is still the one it charges`,
    unusedNames.length === 0,
    `declared but not charged any more: ${unusedNames.join(", ")} — the file charges ${used.join(", ") || "nothing"}`
  );
}

// ---------------------------------------------------------------------
// GRANTS: not "to the caller", but "not from a request at all".
//
// Every place credits are GIVEN is a place where an account gains money,
// and the account named is legitimately not the caller — signup has no
// prior session, and the Stripe webhook is told which account paid. The
// rule that matters is that none of them sits on an ordinary
// authenticated route, where a caller could name an account.
// ---------------------------------------------------------------------
const grantSites = files
  .filter((f) => !DEFINITIONS.has(f))
  .flatMap((f) => [...SOURCE.get(f).matchAll(new RegExp(GRANTS.source, "g"))].map((m) => ({ file: f, account: m[1] })));
check(`grant sites found (${grantSites.length})`, grantSites.length >= 3, "the grant scraper found nothing");

const GRANT_WITHOUT_A_CALLER = {
  "src/app/api/signup/route.ts": "the welcome allowance, granted to the account being created. There is no prior session to charge or credit; the id is the one Supabase just returned.",
  "src/app/api/webhooks/stripe/route.ts": "authenticated by Stripe's signature, not a cookie. The account is the one Stripe names as having paid, which is the only source of truth for who bought credits.",
  "src/app/auth/callback/route.ts":
    "the OAuth landing bootstraps an account api/signup would normally have set up, and grants the same starting allowance — to `user.id`, the account the single-use code exchange just returned. There is no other account in scope.",
  "src/lib/publishing/badge-credits-store.ts":
    "the REFUND path: when a badge-removal purchase fails after the deduction, the same `userId` it was taken from gets it back. A refund that could name another account would be the mint this rule exists to forbid.",
};
const looseGrants = grantSites.filter((g) => !GRANT_WITHOUT_A_CALLER[g.file]).map((g) => `${g.file}: grantCredits(${g.account}, …)`);
check(
  "no route grants credits to an account a request named",
  looseGrants.length === 0,
  looseGrants.join("\n        ") + "\n        A grant reachable from an ordinary authenticated route is a way to mint credits for any account."
);
const staleGrants = Object.keys(GRANT_WITHOUT_A_CALLER).filter((f) => !grantSites.some((g) => g.file === f));
check("no grant declaration outlives its file", staleGrants.length === 0, staleGrants.join(", "));

// ---------------------------------------------------------------------
// AND THE ROUTE THAT MOST LOOKS LIKE IT COULD BILL SOMEBODY ELSE.
// An agent HAS an owner, and running one is exactly the shape where a
// caller's id and a resource owner's id are both in scope.
// ---------------------------------------------------------------------
const RUN = "src/app/api/agents/[id]/run/route.ts";
const runSrc = SOURCE.get(RUN) ?? "";
check("the agent-run route exists and charges", sites.some((s) => s.file === RUN));
check(
  "...for the caller, not the agent's owner",
  sites.filter((s) => s.file === RUN).every((s) => CALLER.test(s.account)),
  "an agent has an owner and this is where the two ids are both in scope"
);
check(
  "...after RLS has settled whose agent it is",
  /createClient\s*\(\s*\)/.test(runSrc) && /\.eq\(\s*"id"\s*,\s*agentId\s*\)/.test(runSrc),
  "the agent is read through the caller's own client, so the policy decides ownership before anything is charged"
);
check(
  "...and it is rate limited",
  /checkRateLimit\s*\(/.test(runSrc),
  "running an agent on demand spends real money per call"
);

// ---------------------------------------------------------------------
// CONTROLS, driving the same scrapers on text of their own.
// ---------------------------------------------------------------------
function accountsIn(text) {
  const out = [];
  for (const m of text.matchAll(new RegExp(POSITIONAL.source, "g"))) out.push(m[2]);
  for (const m of text.matchAll(new RegExp(NAMED.source, "g"))) out.push(m[2]);
  return out;
}
check("control: a positional charge is read", accountsIn("await reserveCredits(user.id, 4, 'x', {});")[0] === "user.id");
check(
  "control: a grant is NOT counted as a charge",
  accountsIn("await grantCredits(someoneElse, 500, 'x');").length === 0,
  "taking and giving are different rules, and forcing grants through the charge rule would make three correct sites look wrong"
);
check("control: a named one is too", accountsIn("await startJob({ kind: 'k', userId: user.id, reserve: 3 });")[0] === "user.id");
check(
  "control: charging a resource owner is NOT the caller",
  accountsIn("await reserveCredits(agent.user_id, 4, 'x', {});").every((a) => !CALLER.test(a)),
  "this is the defect the file exists for and the pattern has to be able to see it"
);
check(
  "control: a charge written only in a comment does not count",
  accountsIn(strip("// await reserveCredits(agent.user_id, 4, 'x', {});\nconst a = 1;")).length === 0,
  "the comment stripper is not running, so this file's own header would be an offence"
);

console.log(`\n        ${sites.length} charge sites · ${new Set(sites.map((s) => s.file)).size} files · ${Object.keys(CHARGES_A_ROW_OWNER).length} charging a row owner, declared`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
