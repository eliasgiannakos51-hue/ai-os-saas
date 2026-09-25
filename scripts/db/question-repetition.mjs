#!/usr/bin/env node
/*
 * HOW OFTEN IS THE SAME QUESTION ASKED TWICE? — V6 #15, the measurement
 * that decides whether a cache is worth building at all.
 *
 * THE OWNER'S OWN THRESHOLD: under 5% repetition, say so and do not
 * build it. A cache that never hits is a lookup, a storage cost and a
 * new way to serve one person another person's answer, in exchange for
 * nothing. The repetition rate is the whole business case and it is
 * cheap to ask.
 *
 * ------------------------------------------------------------------
 * WHAT "THE SAME QUESTION" MEANS HERE, AND WHY IT IS THE STRICT ONE
 * ------------------------------------------------------------------
 *
 * Two questions count as the same when their FOLDS match — the same
 * normalisation chat_memory dedups with (public.search_fold), so case,
 * accents and spacing do not make two questions out of one. Nothing
 * looser: no stemming, no embedding, no "90% similar".
 *
 * That is deliberate and it biases the answer DOWNWARD. A semantic
 * cache would find more repetition than this does, so a number below 5%
 * here does not prove a semantic cache would fail — it proves the CHEAP
 * cache would. And the cheap one is the only one that can be made safe
 * by construction: "έσοδα" and "έξοδα" are one edit apart and opposite,
 * which is the pair that makes similarity thresholds a bad way to
 * decide whether two people may share an answer.
 *
 * Erring downward is the right direction. Over-stating repetition sells
 * a cache that will not pay, and the cost of that is not the build — it
 * is a permanent surface where one account's answer can reach another.
 *
 * ------------------------------------------------------------------
 * WHAT IT ALSO SPLITS OUT, because the average would hide it
 * ------------------------------------------------------------------
 *
 *   * ACROSS ACCOUNTS vs WITHIN ONE. A question one person asks twice
 *     can be answered from their own cache with no sharing at all. Only
 *     the cross-account number justifies a SHARED cache, and only the
 *     shared one carries the leak risk. They are reported apart because
 *     they buy different things at different prices.
 *   * QUESTIONS THAT MUST NEVER BE CACHED, counted rather than assumed:
 *     anything naming now/today/this week, and anything whose answer is
 *     about the asker's own data. If those are most of the traffic, the
 *     cacheable share is smaller than the repetition rate suggests and
 *     the headline number is a lie by omission.
 *
 * TWO WAYS TO ASK.
 *   DATABASE_URL=postgres://... node scripts/db/question-repetition.mjs
 *   node scripts/db/question-repetition.mjs --sql   # paste into the SQL editor
 *
 * --days N changes the window (default 30).
 *
 * Run: node scripts/db/question-repetition.mjs
 */
import { execFileSync } from "node:child_process";

export const DEFAULT_DAYS = 30;

/** The owner's line. Under this, the honest answer is "do not build it". */
export const WORTH_BUILDING_AT = 0.05;

/**
 * ONE QUERY, NO PARAMETERS — every value a literal, so the same text runs
 * under psql and pastes into the Supabase editor unedited. The rule
 * scripts/db/pending-migrations.mjs and clarification-rate.mjs follow.
 *
 * THE TABLE IS A PARAMETER only so a gate can build fixture rows in a
 * scratch schema instead of in the real one.
 */
export function buildQuery(days = DEFAULT_DAYS, table = "public.chat_messages") {
  const window = Math.max(1, Math.floor(Number(days) || DEFAULT_DAYS));
  return `
with asked as (
  select
    public.search_fold(content) as q,
    user_id,
    content
  from ${table}
  where role = 'user'
    and created_at >= now() - interval '${window} days'
    and length(btrim(content)) between 8 and 2000
),
grouped as (
  select
    q,
    count(*)                       as times_asked,
    count(distinct user_id)        as accounts,
    min(content)                   as example,
    -- TIME-BOUND: an answer to "what are my revenues today" is wrong the
    -- moment tomorrow starts, and a cache that serves it is worse than
    -- no cache. Counted, never quietly excluded.
    bool_or(q ~ '(σημερα|τωρα|αυτη τη βδομαδα|αυτον τον μηνα|today|right now|this week|this month|latest|yesterday)') as time_bound,
    -- ABOUT THE ASKER: a first-person possessive means the answer is
    -- theirs and cannot be shared with anybody.
    bool_or(q ~ '(μου |μας |δικα μου|my |our |mine)') as about_the_asker
  from asked
  group by q
)
select
  count(*)                                                        as distinct_questions,
  sum(times_asked)                                                as questions_asked,
  sum(times_asked) filter (where times_asked > 1)                 as asked_more_than_once,
  sum(times_asked) filter (where accounts > 1)                    as asked_by_more_than_one_account,
  sum(times_asked) filter (where time_bound)                      as time_bound,
  sum(times_asked) filter (where about_the_asker)                 as about_the_asker,
  sum(times_asked) filter (
    where times_asked > 1 and accounts > 1 and not time_bound and not about_the_asker
  )                                                               as shareable_repeats
from grouped;
`.trim();
}

/**
 * THE VERDICT, and it is deliberately the SHAREABLE rate rather than the
 * repetition rate.
 *
 * "20% of questions are repeats" sells a cache. "20% are repeats, and
 * after removing the time-bound ones and the ones about the asker's own
 * data, 1% can be shared" sells nothing, which is the correct outcome.
 * The headline is the number that survives every exclusion.
 */
export function verdict(row) {
  const asked = Number(row.questionsAsked ?? 0);
  if (asked === 0) {
    return { known: false, reason: "no_traffic" };
  }
  const repeatRate = Number(row.askedMoreThanOnce ?? 0) / asked;
  const shareableRate = Number(row.shareableRepeats ?? 0) / asked;
  return {
    known: true,
    asked,
    repeatRate,
    shareableRate,
    // THE SHAREABLE RATE DECIDES, not the repeat rate.
    worthBuilding: shareableRate >= WORTH_BUILDING_AT,
  };
}

function psqlArgsFromEnv() {
  if (process.env.DATABASE_URL) return [process.env.DATABASE_URL];
  if (process.env.PGDATABASE || process.env.PGHOST) return [];
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const days = argv.includes("--days") ? Number(argv[argv.indexOf("--days") + 1]) : DEFAULT_DAYS;
  const sql = buildQuery(days);
  if (argv.includes("--sql")) {
    console.log(sql);
    return;
  }
  const args = psqlArgsFromEnv();
  if (!args) {
    console.error(
      "SKIPPED: no DATABASE_URL / PGDATABASE — this reads real questions.\n" +
        "  DATABASE_URL=postgres://... node scripts/db/question-repetition.mjs\n" +
        "  node scripts/db/question-repetition.mjs --sql   # to paste into the SQL editor"
    );
    process.exit(2);
  }
  const out = execFileSync("psql", [...args, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [
    distinctQuestions, questionsAsked, askedMoreThanOnce,
    askedByMoreThanOneAccount, timeBound, aboutTheAsker, shareableRepeats,
  ] = out.trim().split("\t").map((v) => Number(v || 0));
  const row = { distinctQuestions, questionsAsked, askedMoreThanOnce, askedByMoreThanOneAccount, timeBound, aboutTheAsker, shareableRepeats };
  const v = verdict(row);

  console.log("IS A SHARED ANSWER CACHE WORTH BUILDING? — measured\n");
  if (!v.known) {
    console.log(`  No questions in the last ${days} days. That is no data, not a rate of zero.`);
    return;
  }
  const pct = (n) => `${((n / v.asked) * 100).toFixed(1)}%`;
  console.log(`  ${row.questionsAsked} questions asked, ${row.distinctQuestions} distinct`);
  console.log(`  ${row.askedMoreThanOnce} asked more than once            ${pct(row.askedMoreThanOnce)}`);
  console.log(`  ${row.askedByMoreThanOneAccount} asked by more than one account  ${pct(row.askedByMoreThanOneAccount)}`);
  console.log(`  ${row.timeBound} time-bound — NEVER cacheable         ${pct(row.timeBound)}`);
  console.log(`  ${row.aboutTheAsker} about the asker's own data        ${pct(row.aboutTheAsker)}`);
  console.log(`\n  SHAREABLE REPEATS: ${row.shareableRepeats}  (${pct(row.shareableRepeats)})`);
  console.log(
    v.worthBuilding
      ? `\n  Above the ${(WORTH_BUILDING_AT * 100).toFixed(0)}% line. A shared cache would pay.`
      : `\n  BELOW the ${(WORTH_BUILDING_AT * 100).toFixed(0)}% line. Do not build it: a cache that rarely hits is a\n` +
          "  lookup, a storage cost and a permanent surface where one account's\n" +
          "  answer can reach another — in exchange for nothing."
  );
  console.log(
    "\n  THE FOLD IS STRICT, so this UNDER-states repetition: a semantic cache\n" +
      "  would find more. A number below the line proves the cheap cache fails,\n" +
      "  not that the expensive one would — and the cheap one is the only kind\n" +
      "  that can be made safe by construction."
  );
}

if (process.argv[1] && process.argv[1].endsWith("question-repetition.mjs")) main();
