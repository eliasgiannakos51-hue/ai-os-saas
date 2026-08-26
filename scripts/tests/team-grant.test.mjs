// Leaving a team must not cancel a subscription the person is still paying
// for.
//
// WHAT WAS REPORTED: "Διαγραφή πλάνου = σιωπηλός υποβιβασμός ενώ
// πληρώνει". The mechanism: a team owner's tier was written OVER the
// member's own `subscription_tier` when they accepted the invite, and
// removal wrote a hardcoded "free" back over it. One field held two
// different facts — what you pay for, and what somebody lent you — so
// each write destroyed the other.
//
// Two silent losses fell out of that, in opposite directions:
//   1. A member on a HIGHER plan than the owner was downgraded the moment
//      they accepted the invite.
//   2. A member removed from the team was dropped to Free while Stripe
//      kept charging their card. Nothing in the product could notice:
//      metadata said free, and metadata was the only record left.
//
// Run: node scripts/tests/team-grant.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
function eq(name, actual, expected) {
  check(`${name} (${JSON.stringify(actual)})`, actual === expected, `expected ${JSON.stringify(expected)}`);
}

const plans = await loadTs("src/lib/billing/plans.ts");
const { higherPlanSlug, PLANS } = plans;
// The PURE module, not credits.ts: the decision has to be testable without
// a Supabase client, and splitting it out is what made this file possible.
const { resolvePlanSlug } = await loadTs("src/lib/billing/plan-resolution.ts");

const accept = readFileSync("src/lib/team/accept-pending-invite.ts", "utf8");
const remove = readFileSync("src/app/api/team/remove/route.ts", "utf8");

const SLUGS = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];

console.log("== 1. the higher of two tiers, over the whole cross-product ==");
let wrong = [];
for (const a of SLUGS) {
  for (const b of SLUGS) {
    const got = higherPlanSlug(a, b);
    const expected = SLUGS.indexOf(a) >= SLUGS.indexOf(b) ? a : b;
    if (got !== expected) wrong.push(`(${a}, ${b}) -> ${got}, expected ${expected}`);
  }
}
check(`all ${SLUGS.length ** 2} pairs`, wrong.length === 0, wrong.slice(0, 5).join("\n        "));
eq("null and null", higherPlanSlug(null, null), "free");
eq("a tier and null", higherPlanSlug("growth", null), "growth");
eq("null and a tier", higherPlanSlug(null, "growth"), "growth");
// A corrupt value must never win: ranking it below free is what stops a
// typo in metadata from granting enterprise.
eq("nonsense loses to a real tier", higherPlanSlug("platinum", "starter"), "starter");
eq("nonsense on both sides is free", higherPlanSlug("platinum", "diamond"), "free");
check("the slug list here matches the product's", SLUGS.every((s) => PLANS.some((p) => p.slug === s)));

console.log("\n== 2. what the account is ACTUALLY on ==");
const user = (own, granted) => ({
  email: "member@example.com",
  user_metadata: {
    ...(own ? { subscription_tier: own } : {}),
    ...(granted ? { team_granted_tier: granted } : {}),
  },
});
eq("own plan only", resolvePlanSlug(user("growth", null)), "growth");
eq("granted only", resolvePlanSlug(user(null, "professional")), "professional");
eq("granted is higher — the grant adds", resolvePlanSlug(user("starter", "ultimate")), "ultimate");
// THE FIRST SILENT LOSS. Accepting an invite from an owner on a LOWER plan
// must not cost the member the plan they pay for.
eq("own is higher — the grant cannot take away", resolvePlanSlug(user("ultimate", "starter")), "ultimate");
eq("neither", resolvePlanSlug(user(null, null)), "free");
eq("a corrupt grant cannot beat a real plan", resolvePlanSlug(user("growth", "platinum")), "growth");
eq("a corrupt own tier still reads the grant", resolvePlanSlug(user("platinum", "growth")), "growth");

console.log("\n== 3. accepting an invite writes the GRANT, not the plan ==");
check("it sets team_granted_tier", /team_granted_tier: ownerTier/.test(accept));
check(
  "it does NOT write subscription_tier",
  !/subscription_tier:\s/.test(accept),
  "the member's own plan is not the team's to overwrite"
);
check("it still records who granted it", /team_owner_id: pending\.owner_id/.test(accept));

console.log("\n== 4. removal revokes the grant and leaves billing alone ==");
// THE THREE CHECKS BELOW USED TO BE THREE LITERAL LINES:
//
//     /delete nextMetadata\.team_granted_tier/
//     /delete nextMetadata\.team_owner_id/
//     /stripe_subscription_id \?\? nextMetadata\.stripe_customer_id/
//
// which is a test of how the revoke happens to be SPELLED. The route now
// removes the two keys through mergeUserMetadata's `remove` list instead of
// deleting them from a rebuilt object — the same revoke, done atomically —
// and all three went red without a single behaviour changing. A gate that
// cannot survive a refactor of the thing it guards is a gate somebody
// deletes.
//
// So the claims are read out of the code as VALUES: which keys the revoke
// removes, and whether subscription_tier is written unconditionally.
const removeList = remove.match(/remove:\s*\[([^\]]*)\]/);
const removedKeys = removeList
  ? [...removeList[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
  : // The older shape, kept so this gate still reads a checkout that
    // predates the merge: `delete <obj>.<key>`.
    [...remove.matchAll(/delete\s+\w+\.(\w+)/g)].map((m) => m[1]).sort();
check(
  `the revoke removes exactly the two grant keys (${removedKeys.join(", ") || "none"})`,
  JSON.stringify(removedKeys) === JSON.stringify(["team_granted_tier", "team_owner_id"]),
  "team_granted_tier and team_owner_id, and nothing else"
);

// THE DOWNGRADE IS CONDITIONAL. Not "the old line is absent" — that passes
// when the whole block is gone — but "every write of subscription_tier in
// this file sits inside the paysForThemselves guard".
//
// READ FROM CODE, NOT FROM PROSE. The first version of this check counted
// two writes and one of them was the sentence
//
//     // This used to write `subscription_tier = "free"` unconditionally —
//
// explaining the bug. A comment describing a defect is not the defect, and a
// gate that cannot tell them apart makes the fix's own explanation break it.
const removeCode = remove
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*)/.test(line))
  .join("\n");
const tierWrites = [...removeCode.matchAll(/subscription_tier\s*[=:]\s*"free"/g)];
check(`subscription_tier is written to "free" exactly once (${tierWrites.length})`, tierWrites.length === 1);
const guardIndex = removeCode.search(/if\s*\(!paysForThemselves/);
check("...and only after the paysForThemselves guard", guardIndex !== -1 && tierWrites[0].index > guardIndex);

check(
  "a member with a Stripe subscription is never touched",
  /stripe_subscription_id \?\? \w+\.stripe_customer_id/.test(remove)
);
check(
  "...and the reason is in the file, not just here",
  /Removing someone from a team is not a billing action/.test(remove)
);
// Rule 23: the header used to describe the behaviour that caused the bug.
check(
  "the file no longer claims it resets subscription_tier to free",
  !/reset THEIR OWN\n\/\/ subscription_tier back to "free"/.test(remove)
);

console.log("\n== 5. only Stripe and signup may write subscription_tier ==");
// The structural half. One field, one owner: if team code can write it
// again, the bug comes back with a different name.
import { execFileSync } from "node:child_process";
// Comment lines stripped first. Two files DESCRIBE the field in prose and
// never write it; counting those would make this check pass or fail on
// where someone put a sentence.
const hits = execFileSync(
  "bash",
  ["-lc", "grep -rn 'subscription_tier:' src/ | grep -v ':[0-9]*: *[*/]' | grep -v '// ' | cut -d: -f1 | sort -u || true"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);
const ALLOWED = new Set([
  // Stripe owns the paid tier.
  "src/app/api/webhooks/stripe/route.ts",
  // Signup and the OAuth landing bootstrap a brand-new account to "free".
  "src/app/api/signup/route.ts",
  "src/app/auth/callback/route.ts",
]);
const unexpected = hits.filter((f) => !ALLOWED.has(f));
check(
  `only ${ALLOWED.size} files write subscription_tier`,
  unexpected.length === 0,
  `also written by: ${unexpected.join(", ")}`
);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
