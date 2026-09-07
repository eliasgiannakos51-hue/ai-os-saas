#!/usr/bin/env node
/*
 * HOW OFTEN DOES THE PRODUCT ASK INSTEAD OF GUESSING? — asked of the
 * database, per day.
 *
 * THE TWO THIRDS THAT SHIPPED AND THE THIRD THAT COULD NOT. V5 #6 built a
 * free ambiguity reader (lib/ai/ambiguity.ts) and a one-question cap
 * (lib/clarification-client.ts). Both are gated, both are live. The
 * measured rate was not, and it could not be: the verdict was computed
 * inside checkNeedsClarification, used to decide whether to spend, and
 * then DROPPED. So the only trace a request left was a cost-log row —
 * and only the requests the free reader could NOT decide produced one.
 * Every measurable request was, by construction, one it had failed on.
 *
 * WHAT CHANGED. Every surface that runs the check now writes three keys
 * into its settlement metadata (see clarificationMetadata in
 * lib/clarification-client.ts):
 *
 *   clarification_verdict   clear | vague | unsure — the free reader's answer
 *   clarification_paid      whether a model call was made to get there
 *   clarification_asked     whether the person was actually asked something
 *
 * and api/websites/generate writes a ZERO-COST row when the verdict was
 * `clear`, under its own feature name, because otherwise the cheap path
 * stays invisible and the ratio has no denominator.
 *
 * WHAT THIS CANNOT TELL YOU, said before the numbers. Whether the
 * questions were the RIGHT questions. A day of 90% `clear` is a good day
 * only if those requests were genuinely clear; the same number would be
 * produced by a reader that had stopped reading. That needs the held-out
 * set item 6 still names, and this query is not it.
 *
 * TWO WAYS TO ASK.
 *   DATABASE_URL=postgres://... node scripts/db/clarification-rate.mjs
 *   node scripts/db/clarification-rate.mjs --sql    # paste into the SQL editor
 *
 * --days N changes the window (default 30).
 */
import { execFileSync } from "node:child_process";

export const DEFAULT_DAYS = 30;

/**
 * ONE QUERY, NO PARAMETERS. Everything is a literal so the same text runs
 * in psql and pastes into the Supabase SQL editor — the same rule
 * scripts/db/pending-migrations.mjs follows, and for the same reason:
 * a query that has to be edited before it can be pasted is a query
 * nobody pastes.
 */
export function buildQuery(days = DEFAULT_DAYS) {
  const window = Math.max(1, Math.floor(Number(days) || DEFAULT_DAYS));
  return `
select
  (created_at at time zone 'UTC')::date            as day,
  metadata->>'clarification_verdict'               as verdict,
  count(*)                                          as requests,
  count(*) filter (where (metadata->>'clarification_paid')::boolean)   as paid_checks,
  count(*) filter (where (metadata->>'clarification_asked')::boolean)  as questions_asked,
  round(sum(coalesce(real_cost_eur, 0))::numeric, 4)                   as cost_eur
from public.ai_cost_log
where created_at >= now() - interval '${window} days'
  and metadata ? 'clarification_verdict'
group by 1, 2
order by 1 desc, 2;
`.trim();
}

/** The same rows, folded into the one line the item actually asks for. */
export function summarise(rows) {
  const total = rows.reduce((n, r) => n + r.requests, 0);
  const by = new Map();
  for (const r of rows) by.set(r.verdict, (by.get(r.verdict) ?? 0) + r.requests);
  const paid = rows.reduce((n, r) => n + r.paidChecks, 0);
  const asked = rows.reduce((n, r) => n + r.questionsAsked, 0);
  return {
    total,
    clear: by.get("clear") ?? 0,
    vague: by.get("vague") ?? 0,
    unsure: by.get("unsure") ?? 0,
    paid,
    asked,
    // THE NUMBER THE ITEM IS ABOUT. Not "how many were vague" — how often
    // the product opened its mouth to ask rather than getting on with it.
    askedShare: total === 0 ? null : asked / total,
    // AND THE ONE THAT SAYS WHETHER THE FREE READER EARNS ITS PLACE: the
    // share of requests it settled without spending anything.
    freeShare: total === 0 ? null : (total - paid) / total,
  };
}

export function parsePsql(out) {
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [day, verdict, requests, paidChecks, questionsAsked, costEur] = line.split("\t");
      return {
        day,
        verdict,
        requests: Number(requests),
        paidChecks: Number(paidChecks),
        questionsAsked: Number(questionsAsked),
        costEur: Number(costEur),
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
        "  DATABASE_URL=postgres://... node scripts/db/clarification-rate.mjs\n" +
        "  node scripts/db/clarification-rate.mjs --sql   # to paste into the SQL editor"
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
    // NOT "0%". An empty window is a window with no traffic in it, and
    // printing a rate for it would be inventing one — the mistake this
    // repository has made in four instruments and gates against in two.
    console.log(
      `No request in the last ${days} days carried a clarification verdict.\n` +
        "That is not a rate of zero: it is no data. The keys are written from the deploy of\n" +
        "V5 #6 onward, so a window that starts before it will be empty."
    );
    return;
  }

  console.log(`  day         verdict   requests   paid   asked   cost EUR`);
  for (const r of rows) {
    console.log(
      `  ${r.day}  ${String(r.verdict).padEnd(8)} ${String(r.requests).padStart(8)} ${String(r.paidChecks).padStart(6)} ${String(r.questionsAsked).padStart(7)}   ${r.costEur.toFixed(4)}`
    );
  }
  const s = summarise(rows);
  console.log(
    `\n  ${s.total} requests · clear ${s.clear} · vague ${s.vague} · unsure ${s.unsure}` +
      `\n  asked a question in ${(s.askedShare * 100).toFixed(1)}% of them` +
      `\n  decided for free in ${(s.freeShare * 100).toFixed(1)}%` +
      `\n\n  What this does NOT say: whether the questions were the right ones.`
  );
}

if (process.argv[1] && process.argv[1].endsWith("clarification-rate.mjs")) main();
