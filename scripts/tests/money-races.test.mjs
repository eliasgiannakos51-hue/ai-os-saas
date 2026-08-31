#!/usr/bin/env node
/*
 * NO DOUBLE CHARGE, NO MISSED CHARGE.
 *
 * The two failure modes are opposites and the naive fix for either is the
 * other, which is why they are asserted together.
 *
 * WHAT WAS FOUND. settle_reservation() opened with what reads like a
 * guard — `update credit_reservations set status='settled' where ... and
 * status='active'` — and never read its row count. When the reservation
 * had already been settled the UPDATE matched nothing and the function
 * carried on and charged again. Reproduced against a real Postgres:
 *
 *     without the fix: 100 -> 88 -> 76 -> 64, three ledger rows
 *     with it:         100 -> 88 -> 88 -> 88, one ledger row
 *
 * And the naive fix is the other bug: refusing to charge whenever the
 * compare-and-swap misses would refuse a reservation that EXPIRED
 * mid-action and was swept — work that happened and is owed. Both
 * directions are exercised in credit-flow.dbtest.mjs against a server.
 *
 * WHAT IS ASSERTED HERE is everything that does not need one: which
 * Stripe calls move money and which of them carry replay protection, and
 * which writes compute a new value in Node from a value read a round trip
 * ago.
 *
 * Run: node scripts/tests/money-races.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => readFileSync(p, "utf8");
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})("src");

console.log("== 1. the settlement cannot be replayed into a second charge ==");
{
  const mig = read("supabase/migrations/20260920000000_settle_reservation_replay.sql");
  check("the compare-and-swap's result is READ", /get diagnostics v_rows = row_count;/.test(mig),
    "a `where status = 'active'` whose row count nobody looks at is a comment, not a guard");
  check("an already-settled reservation returns without charging",
    /if v_status = 'settled' then\s*\n\s*return;/.test(mig));
  check("an EXPIRED or RELEASED reservation still falls through to the charge",
    /Falls through to the charge/.test(mig) && !/if v_rows = 0 then\s*\n\s*return;/.test(mig),
    "refusing to charge on any CAS miss turns a double-charge into a missed charge");
  check("the charge and the ledger row are still one statement each",
    /insert into public\.credit_transactions/.test(mig) && /update public\.user_credits/.test(mig));
  check("the signature is unchanged, so no caller and no grant moves",
    /p_stage_breakdown jsonb default '\{\}'::jsonb,\s*\n\s*p_metadata jsonb default '\{\}'::jsonb/.test(mig));
  // The application must not have grown a second settle path around it.
  const settlers = files.filter((f) => /rpc\("settle_reservation"/.test(read(f)));
  check(`settle_reservation is called from exactly one module (${settlers.length})`,
    settlers.length === 1, settlers.join(", "));
}

console.log("== 2. every Stripe call that moves money, and what protects it ==");
{
  // NAMED, NOT COUNTED. Each entry is a call that was read: what it does,
  // and what stops it happening twice. A call that appears in the source
  // and not here fails the gate — that is the point.
  const MONEY_CALLS = [
    {
      where: "src/lib/affiliate/connect.ts",
      call: "stripe.transfers.create",
      protection: /idempotencyKey: `affiliate_payout_\$\{payoutId\}`/,
      why: "moves money OUT to an affiliate. Stripe's own key, on our payout row.",
    },
    {
      where: "src/lib/billing/overage-invoice.ts",
      call: "stripe.invoiceItems.create",
      protection: /idempotencyKey: `overage:\$\{userId\}:\$\{month\}`/,
      why: "bills a month of overage. A retried cron run cannot add a second line.",
    },
    {
      where: "src/app/api/checkout/route.ts",
      call: "stripe.subscriptions.update",
      protection: /scope: "subscription_change"/,
      why: "proration_behavior 'always_invoice' charges the card there and then. Guarded by consume_rate_limit on (user, plan, interval) — atomic, no 24h cache — with a Stripe key as the backstop.",
    },
  ];
  for (const { where, call, protection, why } of MONEY_CALLS) {
    const src = read(where);
    check(`${call} is still in ${where.split("/").pop()}`, src.includes(call.replace("stripe.", "stripe.")),
      "if the call moved, this entry is checking nothing");
    check(`  ...and is protected: ${why}`, protection.test(src), src.slice(0, 0) || "protection not found");
  }
  // The Stripe backstop on the subscription update, and its stated limit.
  const checkout = read("src/app/api/checkout/route.ts");
  check("the subscription update also passes a Stripe idempotency key",
    /idempotencyKey: `sub_update:/.test(checkout));
  check("...whose 24-hour-cache limitation is written down, not left to be found",
    /24 hours/.test(checkout) && /A -> B -> A -> B/.test(checkout));

  // THE INVENTORY IS COMPLETE. Any Stripe call that creates or updates
  // something, anywhere, must be either in the list above or in the
  // no-money list below. A new one fails here rather than shipping
  // unprotected.
  const NO_MONEY = new Set([
    "stripe.customers.create", "stripe.customers.update",
    "stripe.checkout.sessions.create", "stripe.billingPortal.sessions.create",
    "stripe.accounts.create", "stripe.accountLinks.create",
    "stripe.subscriptionItems.del",
  ]);
  const found = new Set();
  for (const f of files) {
    for (const m of read(f).matchAll(/\b(stripe\.[a-zA-Z.]+\.(?:create|update|pay|del|cancel|finalizeInvoice))\s*\(/g)) {
      found.add(m[1]);
    }
  }
  check(`the scan found Stripe mutations (${found.size})`, found.size >= 8,
    "an empty scan makes the completeness check below vacuous");
  const named = new Set([...MONEY_CALLS.map((c) => c.call), ...NO_MONEY]);
  const unclassified = [...found].filter((c) => !named.has(c));
  check("every Stripe mutation is classified as money-moving or not", unclassified.length === 0,
    `unclassified: ${unclassified.join(", ")}`);
  const stale = [...named].filter((c) => !found.has(c));
  check("...and no entry names a call that no longer exists", stale.length === 0, `stale: ${stale.join(", ")}`);
  // checkout.sessions.create is in NO_MONEY for a reason worth stating:
  // a duplicate SESSION is two payment pages, not two payments. The
  // webhook's grant is keyed on session.id, so two completed sessions are
  // two deliberate purchases and two grants — which is correct.
  const webhook = read("src/app/api/webhooks/stripe/route.ts");
  check("the credit grant from a completed session is keyed on that session",
    /idempotencyKey: `stripe_checkout:\$\{session\.id\}`/.test(webhook) &&
    /idempotencyKey: `stripe_addon:\$\{session\.id\}`/.test(webhook),
    "a webhook Stripe retries must not grant twice");
}

console.log("== 3. read-modify-write: every counter written from a value read earlier ==");
{
  // A value read in one round trip and written back in the next is a lost
  // update waiting for two callers. The fix is either a single-statement
  // increment in Postgres or a compare-and-swap that re-asserts the value
  // the decision was made from. Each site is named with which it uses.
  const SITES = [
    {
      file: "src/app/api/websites/generate/process/route.ts",
      what: "attempt_count — the generation circuit breaker's own counter",
      guard: /\.eq\("attempt_count", website\.attempt_count\)/,
      kind: "compare-and-swap",
    },
    {
      file: "src/lib/notify/dispatch.ts",
      what: "group_count — 'and N more' on a grouped notification",
      guard: /\.eq\("group_count", open\.groupCount\)/,
      kind: "compare-and-swap, with a re-read on a miss",
    },
    {
      file: "src/lib/ai-circuit-breaker.ts",
      what: "daily_ai_spend_tracking.total_calls — the platform breaker's only input",
      guard: /admin\.rpc\("increment_daily_ai_spend"/,
      kind: "single-statement increment in Postgres",
    },
    {
      file: "src/lib/rate-limit.ts",
      what: "rate_limit_log — every rate limit in the product",
      guard: /admin\.rpc\("consume_rate_limit"/,
      kind: "count and insert in one function under an advisory lock",
    },
  ];
  for (const { file, what, guard, kind } of SITES) {
    check(`${what} — ${kind}`, guard.test(read(file)), `${file}: the guard is gone`);
  }
  // THE FIFTH SITE, and the reason this section exists at all. It was a
  // bare read-modify-write, and the first version of this gate excused it
  // as display-only. That check went red on its first run: run-research.ts
  // refuses to continue at `chunkNumber >= MAX_RESEARCH_CHUNKS`, and
  // chunkNumber is chunk_count + 1. A lost increment buys a report one
  // more chunk than its ceiling allows, and a chunk is a billed AI call.
  const research = read("src/app/api/research/[id]/continue/route.ts");
  check("research chunk_count reads fresh under the claim",
    /\.select\("chunk_count"\)\s*\n\s*\.eq\("id", reportId\)/.test(research),
    "the value it increments must be the one that is true while the lock is held");
  check("...and compare-and-swaps on it", /\.eq\("chunk_count", seen\)/.test(research));
  check("...and says so out loud if the swap misses",
    /logApiError\([^)]*"chunk_count moved while the chunk lock was held"/.test(research),
    "a miss means claimChunk is not the lock the comment claims; silence would hide that");
  check("chunk_count really is a ceiling, so this is money and not a label",
    /chunkNumber >= MAX_RESEARCH_CHUNKS/.test(read("src/lib/research/run-research.ts")) &&
      /const chunkNumber = \(report\.chunk_count \?\? 0\) \+ 1;/.test(read("src/lib/research/run-research.ts")),
    "if the ceiling stops reading chunk_count, this section is guarding the wrong number");
}

console.log("== 4. a settlement that measured nothing is reported, not silently free ==");
{
  const s = read("src/lib/billing/reservations.ts");
  check("a zero-cost settlement is logged as an error",
    /billing:zeroCostSettlement/.test(s),
    "credits_charged = 0 looks identical to a legitimate admin bypass in the log");
  check("...and says which of the two causes it was",
    /callCount 0 means nothing was ever recorded/.test(s));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
