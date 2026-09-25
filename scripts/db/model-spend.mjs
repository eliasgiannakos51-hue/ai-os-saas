#!/usr/bin/env node
/**
 * WHERE THE MONEY ACTUALLY GOES, BEFORE ANY MODEL IS CHANGED.
 *
 * Run: node scripts/db/model-spend.mjs            (needs DATABASE_URL)
 *      node scripts/db/model-spend.mjs --sql      (prints one read-only query)
 *
 * WHY THIS COMES FIRST. V6 #15 — the semantic cache — was killed by a
 * measurement rather than by an argument: 0 repeats out of 4 questions, so
 * the cache would have been complexity for nothing. The model-downgrade
 * lever is the same shape and deserves the same treatment.
 *
 * Sonnet is $3/$15 per MTok and Haiku is $1/$5 (lib/billing/model-pricing.ts),
 * so moving a task down saves two thirds of its spend. Two thirds of
 * nothing is nothing. `scripts/measure-prompt-cache-headroom.mjs` already
 * showed what happens when a lever is counted instead of measured: "18 of
 * 26 call sites do not cache" collapses to 2 once the 1,024-token minimum
 * is applied, because sixteen of those prompts are too short to cache at
 * all and Anthropic would never have said so.
 *
 * So: rank features by what they REALLY cost, and only then ask which of
 * them could run cheaper. A feature at the bottom of this list is not
 * worth a quality risk in ten languages whatever model it uses.
 *
 * WHAT THE COLUMNS ARE FOR:
 *
 *   real_cost_usd / credits_charged  the two halves of margin. This is the
 *                                    per-feature version of the number
 *                                    resolveMarginFor() sets globally.
 *   cache_read_tokens share          whether prompt caching is LANDING,
 *                                    not whether it was asked for. A site
 *                                    that sets cache_control on a prefix
 *                                    under 1,024 tokens reports zero cache
 *                                    writes and no error, so the only
 *                                    honest test is whether reads appear.
 *   output/input ratio               an extraction or classification task
 *                                    has a tiny ratio; a generation task
 *                                    does not. It is the cheapest hint at
 *                                    which features are downgrade
 *                                    candidates without reading any code.
 *
 * READ-ONLY. No insert, no update, no delete, no DDL — this is a file the
 * owner pastes into the Supabase SQL editor.
 */
import { execFileSync } from "node:child_process";

const QUERY = `select
  feature,
  count(*)                                              as rows_logged,
  sum(ai_calls)                                         as ai_calls,
  sum(input_tokens)                                     as input_tokens,
  sum(output_tokens)                                    as output_tokens,
  sum(cache_read_tokens)                                as cache_read_tokens,
  sum(cache_write_tokens)                               as cache_write_tokens,
  round(sum(real_cost_usd), 4)                          as real_cost_usd,
  sum(credits_charged)                                  as credits_charged,
  -- The output/input ratio. Small means the model is deciding or
  -- extracting; large means it is writing. Only the first kind is a
  -- candidate for a cheaper model without a quality argument.
  case when sum(input_tokens) = 0 then null
       else round(sum(output_tokens)::numeric / sum(input_tokens), 3)
  end                                                   as out_per_in,
  -- Is caching landing? Zero reads against a non-zero write is a prefix
  -- that is being paid for and never reused; zero of both on a feature
  -- that sets cache_control is a prefix under the 1,024-token minimum.
  case when sum(input_tokens) + sum(cache_read_tokens) = 0 then null
       else round(100.0 * sum(cache_read_tokens) / (sum(input_tokens) + sum(cache_read_tokens)), 1)
  end                                                   as cache_read_pct
from public.ai_cost_log
where created_at >= now() - interval '30 days'
group by feature
order by real_cost_usd desc nulls last;`;

if (process.argv.includes("--sql")) {
  console.log(QUERY);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("No DATABASE_URL, so nothing was measured — which is not the same as");
  console.log("a feature costing nothing. Re-run with one, or use --sql and paste the");
  console.log("query into the Supabase SQL editor.");
  process.exit(2);
}

try {
  const out = execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", QUERY], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(out);
  console.log("Rank by real_cost_usd. A feature near the bottom is not worth a");
  console.log("quality risk in ten languages, whatever model it runs on today.");
} catch (e) {
  console.log("The query did not run, so nothing here is a measurement.");
  console.log(`  ${String(e.stderr ?? e).slice(0, 400)}`);
  process.exit(2);
}
