// EVERY CLAUSE OF money-races.test.mjs, BROKEN ON PURPOSE.
//
// The gate answers "no double charge, no missed charge". Both defects it
// was written for are mutations here: the settlement whose
// compare-and-swap nobody read, and the research chunk counter that was a
// bare read-modify-write in front of a ceiling that decides how many
// billed AI calls a report may make.
//
// The settlement's own behaviour is proved against a real Postgres in
// credit-flow.dbtest.mjs — measured at 100 -> 88 -> 76 -> 64 without the
// fix and 100 -> 88 -> 88 -> 88 with it. What is mutated here is
// everything that can go wrong without a server.
//
// Run: node scripts/tests/money-races.mutation.mjs
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/money-races.test.mjs";
const MIG = "supabase/migrations/20260920000000_settle_reservation_replay.sql";
const CHECKOUT = "src/app/api/checkout/route.ts";
const CONTINUE = "src/app/api/research/[id]/continue/route.ts";
const RESEARCH = "src/lib/research/run-research.ts";
const CONNECT = "src/lib/affiliate/connect.ts";
const OVERAGE = "src/lib/billing/overage-invoice.ts";
const DISPATCH = "src/lib/notify/dispatch.ts";
const RESERVATIONS = "src/lib/billing/reservations.ts";

function gateIsGreen() {
  try { execFileSync("node", [GATE], { stdio: "pipe" }); return true; } catch { return false; }
}

const MUTATIONS = [
  {
    name: "the settlement stops reading its compare-and-swap's row count",
    file: MIG,
    from: "    get diagnostics v_rows = row_count;",
    to: "",
    expect: "a `where status = 'active'` nobody looks at is a comment, not a guard",
  },
  {
    name: "a replayed settlement charges again",
    file: MIG,
    from: "      if v_status = 'settled' then\n        return;\n      end if;",
    to: "",
    expect: "the replay branch",
  },
  {
    name: "any CAS miss refuses to charge — the OTHER bug",
    file: MIG,
    from: "    if v_rows = 0 then\n      select status into v_status",
    to: "    if v_rows = 0 then\n      return;\n      select status into v_status",
    expect: "an expired-and-swept reservation is work that happened and is owed",
  },
  {
    name: "the affiliate transfer loses its idempotency key",
    file: CONNECT,
    from: "      { idempotencyKey: `affiliate_payout_${payoutId}` }",
    to: "      {}",
    expect: "it moves money OUT",
  },
  {
    name: "the overage invoice item loses its idempotency key",
    file: OVERAGE,
    from: "        { idempotencyKey: `overage:${userId}:${month}` }",
    to: "        {}",
    expect: "a retried cron run would add a second line",
  },
  {
    name: "the subscription upgrade loses its database guard",
    file: CHECKOUT,
    from: '            scope: "subscription_change",',
    to: '            scope: "checkout",',
    expect: "always_invoice charges the card there and then",
  },
  {
    name: "the subscription upgrade loses its Stripe key",
    file: CHECKOUT,
    from: "            idempotencyKey: `sub_update:${existingSubscriptionId}:${plan}:${interval}:${Math.floor(",
    to: "            foo: `sub_update:${existingSubscriptionId}:${plan}:${interval}:${Math.floor(",
    expect: "the backstop",
  },
  {
    name: "the 24-hour-cache limitation stops being written down",
    file: CHECKOUT,
    from: "          // silently no-op a customer who moved A -> B -> A -> B inside a",
    to: "          // be fine inside a",
    expect: "a limit nobody wrote down is a limit somebody rediscovers in production",
  },
  {
    name: "the webhook's credit grant stops being keyed on the session",
    file: "src/app/api/webhooks/stripe/route.ts",
    from: "    { idempotencyKey: `stripe_checkout:${session.id}`, purchased: true }",
    to: "    { purchased: true }",
    expect: "a webhook Stripe retries must not grant twice",
  },
  {
    name: "the research chunk counter goes back to the stale read",
    file: CONTINUE,
    from: '    const { data: fresh } = await admin\n      .from("research_reports")\n      .select("chunk_count")\n      .eq("id", reportId)\n      .maybeSingle();',
    to: "    const fresh = { chunk_count: row.chunk_count };",
    expect: "the value must be the one that is true while the lock is held",
  },
  {
    name: "the research chunk counter loses its compare-and-swap",
    file: CONTINUE,
    from: '      .eq("chunk_count", seen)',
    to: "",
    expect: "a lost increment buys a report a chunk past its ceiling",
  },
  {
    name: "a missed swap becomes silent",
    file: CONTINUE,
    from: '      logApiError("/api/research/[id]/continue", "chunk_count moved while the chunk lock was held", {',
    to: '      void ("chunk_count moved while the chunk lock was held" && {',
    expect: "a miss means the claim is not the lock the comment claims",
  },
  {
    name: "the chunk ceiling stops reading chunk_count, so the section guards the wrong number",
    file: RESEARCH,
    from: "  const chunkNumber = (report.chunk_count ?? 0) + 1;",
    to: "  const chunkNumber = 1;",
    expect: "the premise check",
  },
  {
    name: "the notification group counter loses its compare-and-swap",
    file: DISPATCH,
    from: '        .eq("group_count", open.groupCount)',
    to: "",
    expect: "five agent runs finishing together would land the row one higher instead of five",
  },
  {
    name: "the daily spend counter goes back to a read-modify-write",
    file: "src/lib/ai-circuit-breaker.ts",
    from: '  const { error } = await admin.rpc("increment_daily_ai_spend", {',
    to: '  const { error } = await admin.rpc("increment_daily_ai_spend_renamed", {',
    expect: "the breaker's only input",
  },
  {
    // A RENAME, not a contrivance. The first version of this mutation
    // wrapped the call in `void (0 && ...)`, which left the tag string in
    // the file — and the gate was matching the STRING rather than the
    // call, so it survived. Both were fixed: the check now requires the
    // phrase to follow `logApiError(`, and the mutation is the realistic
    // one.
    name: "the zero-cost settlement alert is renamed, so nothing searches for it",
    file: RESERVATIONS,
    from: 'logApiError("billing:zeroCostSettlement"',
    to: 'logApiError("billing:settlement"',
    expect: "credits_charged = 0 is indistinguishable from an admin bypass in the log",
  },

  // ---- THE INSTRUMENT'S OWN CLAUSES ----
  {
    name: "the Stripe-mutation scan matches nothing, so 'every call is classified' is vacuous",
    file: GATE,
    from: "/\\b(stripe\\.[a-zA-Z.]+\\.(?:create|update|pay|del|cancel|finalizeInvoice))\\s*\\(/g",
    to: "/NOTHING_MATCHES_THIS()/g",
    expect: "the floor on how many mutations were found",
  },
  {
    name: "the no-money list grows a call that does not exist",
    file: GATE,
    from: '    "stripe.subscriptionItems.del",',
    to: '    "stripe.subscriptionItems.del", "stripe.refunds.create",',
    expect: "the stale-entry check",
  },
];

console.log("money-races mutations\n");
if (!gateIsGreen()) { console.log("baseline: the gate is RED on the unmutated tree — fix that first."); process.exit(1); }
console.log("baseline: the gate is GREEN on the unmutated tree");

let caught = 0;
const survivors = [];
const missed = [];
for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) { missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}`); continue; }
  if (before.split(m.from).length - 1 !== 1) { missed.push(`${m.name} — anchor appears more than once in ${m.file}`); continue; }
  writeFileSync(m.file, before.replace(m.from, () => m.to));
  const red = !gateIsGreen();
  writeFileSync(m.file, before);
  if (red) { caught++; console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`); }
  else { survivors.push(`${m.name} (${m.file})`); console.log(`  SURVIVED  ${m.name}`); }
}

console.log("");
if (!gateIsGreen()) { console.log("baseline: the gate is RED on the restored tree — a mutation was not put back."); process.exit(1); }
console.log("baseline: the gate is green again on the restored tree\n");
console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length) { console.log("\nMISSED ANCHORS:"); for (const s of missed) console.log(`  - ${s}`); }
if (survivors.length) { console.log("\nSURVIVORS:"); for (const s of survivors) console.log(`  - ${s}`); }
if (missed.length || survivors.length) process.exit(1);
console.log("Every clause of money-races.test.mjs is load-bearing.");
