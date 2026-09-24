#!/usr/bin/env node
/*
 * DOES THE NUMBER ON THE SCREEN RESEMBLE THE BILL? — asked of the
 * database, per feature, instead of guessed from the code.
 *
 * THE FAILURE IT LOOKS FOR. lib/billing/estimate.ts holds one profile
 * per action: how much input it expects and how much OUTPUT. That one
 * figure is shown to the person before they press AND used to size the
 * credit hold, so a profile that understates the output shows "3
 * credits", reserves 4, and settles 19 — and the affordability check
 * passed against 4. estimate.ts's own header says exactly this in the
 * past tense about the Website Builder: "reserved far less than it went
 * on to cost, which defeats the point of reserving."
 *
 * ----------------------------------------------------------------------
 * WHY THIS READS ROWS AND NOT THE CODE — the whole reason it exists
 * ----------------------------------------------------------------------
 *
 * scripts/scan-estimate-realism.mjs asked this question statically:
 * compare each profile's expected output against the `maxTokens` ceiling
 * of the call it estimates, and flag the ones expecting a small fraction
 * of it. It ran on 2026-09-23 and flagged SEVEN. Every one was settled
 * by hand, and ZERO were real.
 *
 * It died twice, and the second death is the one worth keeping:
 *
 *   1. It invented the input. Four of the seven routes TRANSFORM the
 *      input before estimating — api/presentations/generate passes
 *      deckEstimateInputChars(brief, slides), the brief plus 1,000
 *      characters per slide asked for. Judged at a made-up 1,200
 *      characters, a ten-slide deck looked like 3 credits; at the input
 *      its route actually passes it estimates 13 and reserves 15.
 *
 *   2. THE METRIC DOES NOT DISCRIMINATE. Measured 2026-09-23, at the
 *      professional plan's rate with margin 5: every profile's reserve
 *      is short of what its own ceiling would cost — including the ones
 *      the scan ranked SAFEST.
 *
 *          presentation, 10 slides   reserved 15   at the ceiling 59
 *          meetingAnalyse, 60 min    reserved 15   at the ceiling 33
 *          missionPlan  (ranked 1.1x, "fine")      reserved 11 vs 15
 *          createAnything (ranked 1.6x, "fine")    reserved  5 vs  8
 *
 *      A ceiling is a limit, not a prediction, and a ranking every
 *      member of the population fails sorts nothing. No threshold on it
 *      separates a real defect from a model that is simply allowed to
 *      write more than it will.
 *
 * So the static scan was deleted rather than tuned, and this is what
 * replaced it. Settlement already stores both halves of the comparison:
 * `credits_charged` on the row, and `reservedCredits` /
 * `estimatedCredits` in its metadata. The question needs no model of
 * what a call might do — it has what the calls DID.
 *
 * ----------------------------------------------------------------------
 * WHAT IT CANNOT TELL YOU, said before the numbers
 * ----------------------------------------------------------------------
 *
 * Only actions that RESERVED appear. A bypassed account (admin, active
 * beta) writes `reservedCredits: 0`, and those rows are excluded rather
 * than counted as a 100% shortfall — see the WHERE clause. A feature
 * with no paid traffic in the window is absent, not "accurate": an empty
 * window is no data, never a rate of zero.
 *
 * TWO WAYS TO ASK.
 *   DATABASE_URL=postgres://... node scripts/db/reserve-accuracy.mjs
 *   node scripts/db/reserve-accuracy.mjs --sql   # paste into the SQL editor
 *
 * --days N changes the window (default 30).
 *
 * Run: node scripts/db/reserve-accuracy.mjs
 */
import { execFileSync } from "node:child_process";

export const DEFAULT_DAYS = 30;

/**
 * ONE QUERY, NO PARAMETERS — every value a literal, so the same text
 * runs under psql and pastes into the Supabase SQL editor unedited. The
 * rule scripts/db/pending-migrations.mjs and clarification-rate.mjs both
 * follow, for the reason clarification-rate.mjs writes down: a query
 * that has to be edited before it can be pasted is a query nobody
 * pastes.
 *
 * THE TABLE IS A PARAMETER for one reason only: so a gate can build
 * fixture rows in a scratch schema instead of in the real one.
 */
export function buildQuery(days = DEFAULT_DAYS, table = "public.ai_cost_log") {
  const window = Math.max(1, Math.floor(Number(days) || DEFAULT_DAYS));
  return `
select
  feature,
  count(*)                                                        as settlements,
  count(*) filter (
    where credits_charged > (metadata->>'reservedCredits')::numeric
  )                                                               as over_reserve,
  round(avg((metadata->>'reservedCredits')::numeric), 2)          as avg_reserved,
  round(avg(credits_charged), 2)                                  as avg_charged,
  max(credits_charged - (metadata->>'reservedCredits')::numeric)  as worst_shortfall,
  round(
    avg(credits_charged::numeric
        / nullif((metadata->>'estimatedCredits')::numeric, 0)), 3
  )                                                               as charged_over_estimated
from ${table}
where created_at >= now() - interval '${window} days'
  and metadata ? 'reservedCredits'
  -- A bypassed account reserves nothing by design. Counting those rows
  -- would report every admin request as an infinite under-reserve.
  and (metadata->>'reservedCredits')::numeric > 0
group by feature
order by worst_shortfall desc nulls last, over_reserve desc;
`.trim();
}

/**
 * THE VERDICT PER FEATURE, and it is deliberately not a single score.
 *
 * `over_reserve` counts the settlements that cost more than was held —
 * the failure itself. `charged_over_estimated` says whether the number
 * the PERSON SAW was honest, which is the other half and can be wrong
 * while the hold is fine: a reserve is the estimate plus
 * RESERVE_BUFFER_PERCENT, so an estimate can be 20% low and still never
 * breach.
 */
export function summarise(rows) {
  const settlements = rows.reduce((n, r) => n + r.settlements, 0);
  const over = rows.reduce((n, r) => n + r.overReserve, 0);
  // A feature is called out when it breaches for more than one request
  // in twenty. One breach in a hundred is variance in a measured cost,
  // not a wrong profile.
  const BREACH_SHARE = 0.05;
  const offenders = rows.filter(
    (r) => r.settlements > 0 && r.overReserve / r.settlements > BREACH_SHARE
  );
  return {
    settlements,
    over,
    breachShare: settlements === 0 ? null : over / settlements,
    offenders,
    breachShareThreshold: BREACH_SHARE,
  };
}

export function parsePsql(out) {
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [feature, settlements, overReserve, avgReserved, avgCharged, worstShortfall, chargedOverEstimated] =
        line.split("\t");
      return {
        feature,
        settlements: Number(settlements),
        overReserve: Number(overReserve),
        avgReserved: Number(avgReserved),
        avgCharged: Number(avgCharged),
        worstShortfall: Number(worstShortfall),
        // Null when no row in the window carried an estimate, which is
        // different from a ratio of zero.
        chargedOverEstimated: chargedOverEstimated === "" ? null : Number(chargedOverEstimated),
      };
    });
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
      "SKIPPED: no DATABASE_URL / PGDATABASE — this reads the production cost log.\n" +
        "  DATABASE_URL=postgres://... node scripts/db/reserve-accuracy.mjs\n" +
        "  node scripts/db/reserve-accuracy.mjs --sql   # to paste into the SQL editor"
    );
    process.exit(2);
  }

  const out = execFileSync(
    "psql",
    [...args, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const rows = parsePsql(out);
  if (rows.length === 0) {
    console.log(
      `No settlement in the last ${days} days carried a reservation.\n` +
        "That is not an accuracy of 100%: it is no data. Only actions that reserved\n" +
        "appear here, and a bypassed account reserves nothing."
    );
    return;
  }

  console.log("DID THE HOLD COVER THE BILL? — measured, per feature\n");
  console.log("  feature                    rows   over   avg held   avg charged   worst   charged/estimated");
  for (const r of rows) {
    console.log(
      `  ${r.feature.padEnd(24)} ${String(r.settlements).padStart(6)} ${String(r.overReserve).padStart(6)}` +
        ` ${r.avgReserved.toFixed(2).padStart(10)} ${r.avgCharged.toFixed(2).padStart(13)}` +
        ` ${String(r.worstShortfall).padStart(7)}   ${r.chargedOverEstimated === null ? "     —" : r.chargedOverEstimated.toFixed(3).padStart(6)}`
    );
  }

  const s = summarise(rows);
  console.log(
    `\n  ${s.settlements} settlements that reserved · ${s.over} cost more than was held` +
      ` (${(s.breachShare * 100).toFixed(1)}%)`
  );
  if (s.offenders.length === 0) {
    console.log(
      `  No feature breaches on more than ${(s.breachShareThreshold * 100).toFixed(0)}% of its requests.`
    );
  } else {
    console.log(
      `\n  BREACHING ON MORE THAN ${(s.breachShareThreshold * 100).toFixed(0)}% OF REQUESTS — the profile is wrong, not the variance:`
    );
    for (const r of s.offenders) {
      console.log(
        `    ${r.feature} — ${r.overReserve} of ${r.settlements}, worst ${r.worstShortfall} credits over`
      );
    }
    console.log(
      "\n  Fix these in lib/billing/estimate.ts ACTION_PROFILES: raise baseOutputChars\n" +
        "  or outputCharsPerInputChar until the held amount covers the measured one."
    );
  }
  console.log(
    "\n  What this does NOT say: whether the CHARGE was right. It compares the\n" +
      "  estimate to the settlement; both come from the same rate table, and a\n" +
      "  wrong rate moves them together. That is model-pricing.ts's question."
  );
}

if (process.argv[1] && process.argv[1].endsWith("reserve-accuracy.mjs")) main();
