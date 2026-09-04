// A TIER IN METADATA IS NOT A PAYMENT — mrr_inputs() against a real Postgres.
//
// Reported from /dashboard/business-health: "MRR EUR 2,000, ARR EUR
// 24,000, 12 subscribers — I have not received a single payment." The
// function grouped auth.users by subscription_tier, and a beta invite code
// writes subscription_tier: "ultimate" at signup without Stripe ever being
// involved (api/signup/route.ts, lib/beta.ts). Twelve beta testers were
// twelve subscribers.
//
// 20260923000000_mrr_paid_only.sql makes the rule "a subscriber has a live
// stripe_subscription_id". This file seeds every shape of account the
// product actually produces and reads the function back:
//
//   - a Stripe-backed paid tier          -> counted, at its tier
//   - a beta grant (tier, no Stripe)     -> free
//   - a hand-set tier with no Stripe     -> free
//   - a lapsed subscription (id nulled)  -> free
//   - a plain free account               -> free
//   - a deleted account                  -> not counted at all
//
// Run: node scripts/tests/mrr-paid-only.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("SKIP: no DATABASE_URL / PGDATABASE — run through `npm run test:db`");
  process.exit(0);
}

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);
function rows(query) {
  const out = execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
}
const sql = (q) => rows(q);

const P = "eeeeeeee-1111-0000-0000-0000000000";
const IDS = {
  paidGrowth: `${P}01`,
  paidProAnnual: `${P}02`,
  beta: `${P}03`,
  handSet: `${P}04`,
  lapsed: `${P}05`,
  free: `${P}06`,
  deletedPaid: `${P}07`,
};
const all = Object.values(IDS).map((id) => `'${id}'`).join(", ");

// Clean slate for THESE ids only; the function reads the whole table, so
// the assertions below are on differences, never on absolute counts.
sql(`delete from auth.users where id in (${all})`);

const meta = (obj) => `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
const insert = (id, email, m, deleted = false) =>
  sql(`insert into auth.users (id, email, raw_user_meta_data${deleted ? ", deleted_at" : ""}) values
       ('${id}', '${email}', ${meta(m)}${deleted ? ", now()" : ""})`);

function read() {
  const out = {};
  for (const line of sql(`select tier, billing_interval, subscribers, seats from public.mrr_inputs() order by 1, 2`)) {
    const [tier, interval, subscribers, seats] = line.split("|");
    out[`${tier}/${interval}`] = { subscribers: Number(subscribers), seats: Number(seats) };
  }
  return out;
}
const count = (r, key) => r[key]?.subscribers ?? 0;

console.log("== 0. the baseline, before the seven accounts exist ==");
const before = read();
console.log(`        ${JSON.stringify(before)}`);

console.log("\n== 1. seven accounts, one of each shape ==");
insert(IDS.paidGrowth, "mrr-paid-growth@test.local", {
  subscription_tier: "growth", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", billing_interval: "month",
});
insert(IDS.paidProAnnual, "mrr-paid-pro@test.local", {
  subscription_tier: "pro", stripe_customer_id: "cus_2", stripe_subscription_id: "sub_2", billing_interval: "year", seat_count: 3,
});
// THE REPORTED SHAPE: what api/signup writes for a valid beta code.
insert(IDS.beta, "mrr-beta@test.local", { subscription_tier: "ultimate", is_beta_tester: true });
insert(IDS.handSet, "mrr-handset@test.local", { subscription_tier: "growth" });
// What the webhook leaves behind when a subscription ends.
insert(IDS.lapsed, "mrr-lapsed@test.local", {
  subscription_tier: "growth", stripe_customer_id: "cus_5", stripe_subscription_id: null, billing_interval: "month",
});
insert(IDS.free, "mrr-free@test.local", { subscription_tier: "free" });
insert(IDS.deletedPaid, "mrr-deleted@test.local", {
  subscription_tier: "pro", stripe_customer_id: "cus_7", stripe_subscription_id: "sub_7",
}, true);

const after = read();
console.log(`        ${JSON.stringify(after)}`);
const delta = (key) => count(after, key) - count(before, key);

ok("the Stripe-backed monthly Growth account is one Growth subscriber", delta("growth/month") === 1, String(delta("growth/month")));
ok("the Stripe-backed annual Pro account is one Pro subscriber on the annual interval", delta("pro/year") === 1, String(delta("pro/year")));
ok("...carrying its three seats", (after["pro/year"]?.seats ?? 0) - (before["pro/year"]?.seats ?? 0) === 3);
ok("THE BUG: the beta grant on 'ultimate' is NOT an Ultimate subscriber",
  delta("ultimate/month") === 0, `ultimate/month moved by ${delta("ultimate/month")}`);
ok("a hand-set tier with no Stripe is not a subscriber either", delta("growth/month") === 1,
  "if this reads 2, the hand-set account was counted");
ok("a lapsed subscription (id nulled by the webhook) is not a subscriber", delta("growth/month") === 1);
// beta + hand-set + lapsed + free = four free rows; the deleted one is nowhere.
ok("the four non-paying accounts all land on free", delta("free/month") === 4, `free/month moved by ${delta("free/month")}`);
const total = Object.values(after).reduce((n, r) => n + r.subscribers, 0) - Object.values(before).reduce((n, r) => n + r.subscribers, 0);
ok("a deleted account is not counted anywhere (6 of 7 rows land)", total === 6, String(total));

console.log("\n== 2. and it is still the owner's function, not a public one ==");
const anon = (() => {
  try {
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-At", "-c",
      "set role anon; select count(*) from public.mrr_inputs();"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.stderr ?? e.message) };
  }
})();
ok("anon cannot call mrr_inputs()", !anon.ok, "the revoke from 20260823000000 must survive the replace");

sql(`delete from auth.users where id in (${all})`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
