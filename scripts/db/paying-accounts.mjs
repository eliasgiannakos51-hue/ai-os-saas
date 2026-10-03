#!/usr/bin/env node
/*
 * HAS ANYONE PAID? — the measurement before credits change size.
 *
 *   node scripts/db/paying-accounts.mjs          # with DATABASE_URL, through psql
 *   node scripts/db/paying-accounts.mjs --sql    # one read-only query, to paste into the SQL editor
 *
 * The owner's question, 2026-10-03, before a credit becomes EUR 0.02 on
 * every plan: how many accounts have ever paid, and how many purchased
 * packs exist? If the answer is zero, the decisions about converting old
 * balances ("leave monthly balances until the next reset", "honour bought
 * packs as they are") cost nothing today, and the report says so.
 *
 * WHERE EACH NUMBER COMES FROM, and nothing is inferred:
 *
 *   subscription_events   a subscription started, upgraded or came back —
 *                         written by api/webhooks/stripe in revenue terms
 *   subscriber_months     the MRR an account carried in a month; > 0 is a
 *                         month somebody was billed for
 *   credit_transactions   action_type 'purchase' is a credit pack or a
 *                         credit add-on (grantCredits(..., "purchase", ...)
 *                         in api/webhooks/stripe)
 *   user_credits          purchased_credits is the sub-ledger that survives
 *                         every monthly reset — what "honour them as they
 *                         are" applies to
 *
 * It writes nothing. Every statement is a SELECT.
 *
 * Run: node scripts/db/paying-accounts.mjs
 */
import { execFileSync } from "node:child_process";

export const SQL = `
select 'accounts that ever started or upgraded a paid subscription' as measure,
       count(distinct user_id)::text as value
  from public.subscription_events
 where kind in ('started', 'upgraded', 'reactivated')
union all
select 'accounts billed in any month (subscriber_months, mrr > 0)',
       count(distinct user_id)::text
  from public.subscriber_months
 where mrr_eur > 0
union all
select 'accounts billed this month',
       count(distinct user_id)::text
  from public.subscriber_months
 where mrr_eur > 0 and month = date_trunc('month', now())::date
union all
select 'credit purchases (packs and credit add-ons)',
       count(*)::text
  from public.credit_transactions
 where action_type = 'purchase' and amount > 0
union all
select 'accounts that bought credits',
       count(distinct user_id)::text
  from public.credit_transactions
 where action_type = 'purchase' and amount > 0
union all
select 'credits bought, in total',
       coalesce(sum(amount), 0)::text
  from public.credit_transactions
 where action_type = 'purchase' and amount > 0
union all
select 'purchased credits still unspent (user_credits.purchased_credits)',
       coalesce(sum(purchased_credits), 0)::text
  from public.user_credits
 where purchased_credits > 0;
`.trim();

function psqlArgsFromEnv() {
  if (process.env.DATABASE_URL) return [process.env.DATABASE_URL];
  if (process.env.PGDATABASE || process.env.PGHOST) return [];
  return null;
}

function main() {
  if (process.argv.includes("--sql")) {
    console.log(SQL);
    return;
  }
  const args = psqlArgsFromEnv();
  if (!args) {
    console.error(
      "SKIPPED: no DATABASE_URL / PGDATABASE — this reads real billing rows.\n" +
        "  DATABASE_URL=postgres://... node scripts/db/paying-accounts.mjs\n" +
        "  node scripts/db/paying-accounts.mjs --sql   # to paste into the SQL editor"
    );
    process.exit(2);
  }
  const out = execFileSync("psql", [...args, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", SQL], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("HAS ANYONE PAID? — measured\n");
  for (const line of out.trim().split("\n")) {
    const [measure, value] = line.split("\t");
    console.log(`  ${String(value).padStart(8)}  ${measure}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
