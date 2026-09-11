#!/usr/bin/env node
/*
 * THE LEDGER, IN THE SHAPE OF THE BILL — one month of public.ai_cost_log
 * laid out so it can be put beside an Anthropic invoice line by line.
 *
 * WHAT WAS WRONG, SAID FIRST. The margin machinery in this repository is
 * internally consistent and, until this file, was compared against
 * nothing. CREDIT_MARGIN_* multiplies a cost that lib/billing/
 * model-pricing.ts computed from its own table; the achieved margin
 * stored beside it is measured against that same computed cost. If the
 * table is wrong, every number downstream is wrong in the same direction
 * and still reads healthy — which is exactly how the 2026-08 incident
 * happened, when MODEL_PRICING_USD held one model and a chat turn served
 * by a pricier one was billed at a third of its cost while the log
 * reported a comfortable 4x.
 *
 * THE HOLE THIS FILE HAD TO FILL BEFORE IT COULD ASK THE QUESTION.
 * ai_cost_log has input_tokens, output_tokens, cache_write_tokens and
 * cache_read_tokens, and it has NO MODEL COLUMN. The counts are summed
 * across every sub-call of an action, and an action is routinely served
 * by two or three different models (the clarifier and the classifier on
 * the cheap tier, the generation on the expensive one). So a row reading
 * `input_tokens = 50000` is equally consistent with $0.05 of Haiku and
 * $0.50 of Fable. An Anthropic invoice — and the usage report in the
 * console — is broken down BY MODEL. Nothing below the monthly total
 * could be placed beside it.
 *
 * That is now recorded: settleReservation writes
 * `metadata.modelBreakdown` on every settlement (see
 * CostAccumulator.byModel). It is written into metadata rather than into
 * new columns for the same reason cacheWrite1hTokens is: migrations in
 * this repository are pasted in by hand, so a change that needs no
 * migration is a change that cannot silently not-run.
 *
 * ROWS SETTLED BEFORE THAT DEPLOY HAVE NO SPLIT AND NEVER WILL. They are
 * not dropped from the report and not spread across models by
 * proportion: they get their own line, with their own money on it, so the
 * answer to "how much of this month can actually be checked" is a number
 * rather than an impression.
 *
 * THE THREE QUERIES, and what each is for:
 *
 *   1. INVOICE SHAPE   one row per (model, token kind), priced at the
 *                      published rate. This is the one to put beside the
 *                      console's usage table.
 *   2. RECONCILIATION  eleven lines that walk from "everything the ledger
 *                      booked" to "what Anthropic should invoice", naming
 *                      every subtraction on the way.
 *   3. COVERAGE        how many rows carry a model split at all. Read
 *                      this one FIRST: it is the denominator of the other
 *                      two, and a month that is 40% unattributed cannot
 *                      be reconciled no matter what queries 1 and 2 say.
 *
 * TWO WAYS TO ASK.
 *   DATABASE_URL=postgres://... node scripts/db/anthropic-reconcile.mjs
 *   node scripts/db/anthropic-reconcile.mjs --sql   # paste into the SQL editor
 *
 * --month YYYY-MM picks the window; the default is the last COMPLETE
 * calendar month, because that is the only kind an invoice exists for.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const PRICING_SOURCE = "src/lib/billing/model-pricing.ts";

/**
 * ANTHROPIC'S PUBLISHED LIST PRICES, USD per million tokens.
 *
 * NOT the same table as MODEL_PRICING_USD, and the difference is the
 * whole point of this file. That table is what the app CHARGES on, and it
 * deliberately departs from the published price in at least one place
 * (Sonnet 5 is booked at the permanent $3/$15 rather than its $2/$10
 * introductory rate, because over-charging is the safe direction to fail
 * in). Reconciling a ledger against the table that produced it would
 * prove only that arithmetic works.
 *
 * Source: the pricing table carried by the bundled `claude-api` skill,
 * read 2026-06-24. NOT read off a bill — see the honesty note in the
 * report this file was written for. A rate here that Anthropic has since
 * changed produces a difference on line 9 of query 2, which is the line
 * that exists to be looked at.
 *
 * A MODEL MISSING FROM THIS TABLE IS NOT PRICED AT ZERO. It reports as
 * "no published rate", its tokens are counted on their own line, and the
 * reconciliation says how much of the month it covers. Guessing a rate
 * for a model nobody has confirmed would put an invented number in the
 * one report whose entire purpose is to be checkable against a real one.
 */
export const INVOICE_RATES_USD = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

/**
 * MODELS THE APP CAN BOOK BUT THIS FILE CANNOT PRICE, or prices
 * differently on purpose. Every entry carries the reason, and the gate
 * (scripts/tests/anthropic-reconcile.test.mjs) requires the register to
 * be exact in BOTH directions: a model in MODEL_PRICING_USD that is
 * neither matched nor listed here reddens the build, and so does an entry
 * here for a model that has stopped diverging. An allowlist that can go
 * stale is the shape this repository has already been bitten by twice.
 */
export const DIVERGENCES = [
  {
    model: "claude-sonnet-5",
    why:
      "Booked at $3/$15, invoiced at $2/$10. Deliberate: model-pricing.ts " +
      "refuses to charge on introductory pricing that expires on its own, " +
      "so the ledger OVERSTATES this model and line 9 of query 2 will be " +
      "negative by roughly a third of its Sonnet 5 spend.",
  },
  {
    model: "claude-sonnet-4-5",
    why:
      "No published rate in this file. It is still in MODEL_PRICING_USD as " +
      "a superseded id; if the month contains any of it, query 1 reports " +
      "its tokens with a null rate rather than pricing them at the 4-6 rate " +
      "on the assumption they are the same.",
  },
  {
    model: "claude-opus-4-5",
    why: "No published rate in this file — superseded id, same treatment as claude-sonnet-4-5.",
  },
  {
    model: "claude-mythos-5",
    why:
      "No published rate in this file. It sits in MODEL_PRICING_USD at the " +
      "Fable tier so that FALLBACK_MODEL_PRICING stays genuinely 'the most " +
      "expensive known model'; that is a charging decision, not a quoted price.",
  },
];

/** Per-request price of the web_search server tool: $10 per 1,000. */
export const WEB_SEARCH_USD_PER_QUERY = 10 / 1000;

/**
 * The rates MODEL_PRICING_USD actually books at, read out of the
 * TypeScript rather than copied into this file.
 *
 * Copied, it would be a second table to keep in step, and the register
 * above would go stale the day somebody added a model — silently, because
 * a comparison between two copies of the same stale list always passes.
 * Only the literal `"id": tier(a, b)` rows are read: the non-Anthropic
 * models are spread in from the routing catalog by fromCatalog() and do
 * not appear on an Anthropic invoice at all.
 */
export function readBookedRates(src = readFileSync(PRICING_SOURCE, "utf8")) {
  const block = src.slice(src.indexOf("export const MODEL_PRICING_USD"));
  const end = block.indexOf("\n};");
  const body = end === -1 ? block : block.slice(0, end);
  const out = {};
  for (const m of body.matchAll(/^\s*"([a-z0-9.-]+)":\s*tier\(([\d.]+),\s*([\d.]+)\)/gm)) {
    out[m[1]] = { input: Number(m[2]), output: Number(m[3]) };
  }
  return out;
}

/**
 * Every model the two tables disagree about, or that only one of them
 * knows. Returned rather than thrown so the gate can name each one.
 */
export function divergenceProblems(booked = readBookedRates()) {
  const declared = new Map(DIVERGENCES.map((d) => [d.model, d.why]));
  const problems = [];
  for (const [model, rate] of Object.entries(booked)) {
    const listed = INVOICE_RATES_USD[model];
    const agrees = listed && listed.input === rate.input && listed.output === rate.output;
    if (agrees && declared.has(model)) {
      problems.push(`${model}: declared as diverging, but the two tables now agree — delete the entry`);
    }
    if (!agrees && !declared.has(model)) {
      problems.push(
        listed
          ? `${model}: booked ${rate.input}/${rate.output}, invoiced ${listed.input}/${listed.output}, undeclared`
          : `${model}: booked ${rate.input}/${rate.output}, no published rate in this file, undeclared`
      );
    }
  }
  for (const model of Object.keys(INVOICE_RATES_USD)) {
    if (!booked[model]) problems.push(`${model}: priced here but not in ${PRICING_SOURCE}`);
  }
  for (const d of DIVERGENCES) {
    if (!booked[d.model]) problems.push(`${d.model}: declared as diverging but ${PRICING_SOURCE} does not book it`);
    if (!d.why || d.why.length < 40) problems.push(`${d.model}: the reason is too short to be a reason`);
  }
  return problems;
}

/**
 * The five token kinds an invoice separates, at the ratios Anthropic
 * publishes: a 5-minute cache write costs 1.25x input, a 1-hour write 2x,
 * a read 0.1x. Derived here rather than stored, because the ratios are
 * the published rule and a per-model literal would be four more numbers
 * per row to keep true.
 */
export function rateRows(rates = INVOICE_RATES_USD) {
  const rows = [];
  for (const [model, r] of Object.entries(rates)) {
    rows.push([model, "input", r.input]);
    rows.push([model, "output", r.output]);
    rows.push([model, "cache_write_5m", r.input * 1.25]);
    rows.push([model, "cache_write_1h", r.input * 2]);
    rows.push([model, "cache_read", r.input * 0.1]);
  }
  return rows;
}

/**
 * ONE MODEL'S SLICE OF ONE ROW, REPRICED AT THE PUBLISHED RATE — the same
 * arithmetic query 2 does, in JavaScript.
 *
 * Two implementations of one rule is a liability unless something
 * compares them, so scripts/tests/anthropic-reconcile.dbtest.mjs runs the
 * SQL against fixtures and checks every model's figure against this one.
 * That is the property scripts/db/role-grants.mjs earns the same way, and
 * for the same reason: the SQL is what a person pastes into the
 * production editor and reads an answer off, so a divergence between the
 * two is a wrong answer in the only place it matters.
 *
 * NULL, NOT ZERO, for a model with no published rate and for a
 * non-Anthropic provider. Zero would quietly enlarge the agreement: a
 * model nobody can price would contribute nothing to the difference and
 * the report would look better the less it knew.
 */
export function repriceModel(modelKey, usage, rates = INVOICE_RATES_USD) {
  const billing = String(modelKey).startsWith("external:")
    ? "non-anthropic"
    : String(modelKey).startsWith("batch:")
      ? "batch"
      : "standard";
  const model = billing === "batch" ? String(modelKey).slice("batch:".length) : String(modelKey);
  if (billing === "non-anthropic") return { billing, model, listUsd: null };
  const r = rates[model];
  if (!r) return { billing, model, listUsd: null };
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const usd =
    (n(usage?.inputTokens) / 1e6) * r.input +
    (n(usage?.outputTokens) / 1e6) * r.output +
    (n(usage?.cacheWriteTokens) / 1e6) * r.input * 1.25 +
    (n(usage?.cacheWrite1hTokens) / 1e6) * r.input * 2 +
    (n(usage?.cacheReadTokens) / 1e6) * r.input * 0.1 +
    n(usage?.webSearches) * WEB_SEARCH_USD_PER_QUERY;
  return { billing, model, listUsd: usd * (billing === "batch" ? 0.5 : 1) };
}

/** The SQL VALUES list the rate table compiles to, so the query a person
 *  pastes carries its own prices and needs no parameters. */
function ratesCte(rates = INVOICE_RATES_USD) {
  const rows = rateRows(rates).map(
    ([model, kind, usd]) => `    ('${model}', '${kind}', ${Number(usd.toFixed(6))}::numeric)`
  );
  return `rates(model, kind, usd_per_mtok) as (values\n${rows.join(",\n")}\n  )`;
}

/** The last COMPLETE calendar month before `now` — the only kind an
 *  invoice exists for. */
export function defaultMonth(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * `YYYY-MM` to a half-open UTC window. Half-open, not `between`: a closed
 * upper bound on a timestamptz column silently includes or excludes the
 * last microsecond of the month depending on the value, and an invoice
 * boundary is exactly where that matters.
 */
export function monthWindow(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) {
    throw new Error(`--month expects YYYY-MM, got ${JSON.stringify(month)}`);
  }
  const [y, m] = String(month).split("-").map(Number);
  const stop = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start: `${month}-01`, stop, label: month };
}

/**
 * The shared head of all three queries: the month, its rows, and the
 * per-model expansion of metadata.modelBreakdown.
 *
 * `metadata->'modelBreakdown' is not null` rather than the shorter
 * `metadata ? 'modelBreakdown'`: the question mark is a bound-parameter
 * marker in several drivers, and this text has to survive being pasted
 * anywhere without being edited first.
 */
function commonCte({ start, stop }, table) {
  return `
  window_rows as (
    select id, metadata, real_cost_usd, real_cost_eur, credits_charged
    from ${table}
    where created_at >= timestamptz '${start} 00:00:00+00'
      and created_at <  timestamptz '${stop} 00:00:00+00'
  ),
  attributed as (
    select r.id, e.key as model_key, e.value as usage
    from window_rows r
    cross join lateral jsonb_each(r.metadata->'modelBreakdown') as e(key, value)
    where r.metadata->'modelBreakdown' is not null
  ),
  classified as (
    select
      a.id,
      case
        when a.model_key like 'external:%' then 'non-anthropic'
        when a.model_key like 'batch:%'    then 'batch'
        else 'standard'
      end as billing,
      case when a.model_key like 'batch:%' then substring(a.model_key from 7) else a.model_key end as model,
      a.usage
    from attributed a
  )`;
}

/** QUERY 1 — one row per (model, token kind), in the shape the console's
 *  usage table and the invoice both use. */
export function buildInvoiceQuery(month, table = "public.ai_cost_log") {
  const w = monthWindow(month);
  return `
-- Anthropic reconciliation, query 1 of 3: ${w.label} in invoice shape.
-- Compare with console.anthropic.com -> Usage, grouped by model, same month.
with
  ${ratesCte()},
${commonCte(w, table)},
  kinds as (
    select c.billing, c.model, k.kind, k.tokens
    from classified c
    cross join lateral (values
      ('input',          coalesce((c.usage->>'inputTokens')::numeric, 0)),
      ('output',         coalesce((c.usage->>'outputTokens')::numeric, 0)),
      ('cache_write_5m', coalesce((c.usage->>'cacheWriteTokens')::numeric, 0)),
      ('cache_write_1h', coalesce((c.usage->>'cacheWrite1hTokens')::numeric, 0)),
      ('cache_read',     coalesce((c.usage->>'cacheReadTokens')::numeric, 0))
    ) as k(kind, tokens)
  ),
  searches as (
    select c.billing, c.model, 'web_search' as kind,
           coalesce((c.usage->>'webSearches')::numeric, 0) as units
    from classified c
  )
select
  k.model,
  k.billing,
  k.kind,
  'tokens'                                as unit,
  sum(k.tokens)::bigint                   as quantity,
  r.usd_per_mtok,
  -- Batch lines really are invoiced at half, so the comparison has to
  -- halve them too; the TOKENS are not halved, because the tokens were
  -- genuinely consumed and only the rate was discounted.
  round(sum(k.tokens) / 1000000.0 * r.usd_per_mtok
        * (case when k.billing = 'batch' then 0.5 else 1 end), 6) as invoice_usd,
  case when r.usd_per_mtok is null then 'no published rate in this script' else null end as note
from kinds k
left join rates r on r.model = k.model and r.kind = k.kind
where k.tokens > 0
group by k.model, k.billing, k.kind, r.usd_per_mtok
union all
select
  s.model, s.billing, s.kind, 'searches',
  sum(s.units)::bigint, null,
  round(sum(s.units) * ${WEB_SEARCH_USD_PER_QUERY}, 6),
  'server tool, billed per request'
from searches s
where s.units > 0
group by s.model, s.billing, s.kind
order by 1, 3;
`.trim();
}

/** QUERY 2 — the walk from what the ledger booked to what Anthropic
 *  should invoice, with every subtraction on its own line. */
export function buildReconcileQuery(month, table = "public.ai_cost_log") {
  const w = monthWindow(month);
  return `
-- Anthropic reconciliation, query 2 of 3: ${w.label}, ledger -> invoice.
-- Read line 9. Everything above it exists to make line 9 mean something.
with
  ${ratesCte()},
${commonCte(w, table)},
  per_model as (
    select
      c.billing,
      c.model,
      coalesce((c.usage->>'usdCost')::numeric, 0) as booked_usd,
      coalesce((c.usage->>'inputTokens')::numeric, 0)      as t_input,
      coalesce((c.usage->>'outputTokens')::numeric, 0)     as t_output,
      coalesce((c.usage->>'cacheWriteTokens')::numeric, 0) as t_cw5m,
      coalesce((c.usage->>'cacheWrite1hTokens')::numeric, 0) as t_cw1h,
      coalesce((c.usage->>'cacheReadTokens')::numeric, 0)  as t_cread,
      coalesce((c.usage->>'webSearches')::numeric, 0)      as n_search
    from classified c
  ),
  repriced as (
    select
      p.*,
      (select r.usd_per_mtok from rates r where r.model = p.model and r.kind = 'input')          as r_input,
      (select r.usd_per_mtok from rates r where r.model = p.model and r.kind = 'output')         as r_output,
      (select r.usd_per_mtok from rates r where r.model = p.model and r.kind = 'cache_write_5m') as r_cw5m,
      (select r.usd_per_mtok from rates r where r.model = p.model and r.kind = 'cache_write_1h') as r_cw1h,
      (select r.usd_per_mtok from rates r where r.model = p.model and r.kind = 'cache_read')     as r_cread
    from per_model p
  ),
  priced as (
    select
      x.*,
      case when x.r_input is null then null else
        (x.t_input / 1000000.0 * x.r_input
         + x.t_output / 1000000.0 * x.r_output
         + x.t_cw5m  / 1000000.0 * x.r_cw5m
         + x.t_cw1h  / 1000000.0 * x.r_cw1h
         + x.t_cread / 1000000.0 * x.r_cread
         + x.n_search * ${WEB_SEARCH_USD_PER_QUERY})
        * (case when x.billing = 'batch' then 0.5 else 1 end)
      end as list_usd
    from repriced x
  )
select * from (
  select 1 as ord, 'ai_cost_log.real_cost_usd, every row in the month' as line,
         round(coalesce(sum(real_cost_usd), 0), 6) as usd,
         count(*)::bigint as rows_n
  from window_rows
  union all
  select 2, '  ... on rows that carry a model split',
         round(coalesce(sum(real_cost_usd), 0), 6), count(*)::bigint
  from window_rows where metadata->'modelBreakdown' is not null
  union all
  select 3, '  ... on rows with NO model split (not reconcilable, ever)',
         round(coalesce(sum(real_cost_usd), 0), 6), count(*)::bigint
  from window_rows where metadata->'modelBreakdown' is null
  union all
  select 4, 'sum of modelBreakdown usdCost (should equal line 2)',
         round(coalesce(sum(booked_usd), 0), 6), count(*)::bigint from per_model
  union all
  select 5, '  of which external: providers, never on an Anthropic invoice',
         round(coalesce(sum(booked_usd), 0), 6), count(*)::bigint
  from per_model where billing = 'non-anthropic'
  union all
  select 6, '  of which batch:, invoiced at 50%',
         round(coalesce(sum(booked_usd), 0), 6), count(*)::bigint
  from per_model where billing = 'batch'
  union all
  select 7, '= booked against Anthropic models this script can price',
         round(coalesce(sum(booked_usd), 0), 6), count(*)::bigint
  from priced where billing <> 'non-anthropic' and list_usd is not null
  union all
  select 8, 'the same tokens, repriced at the published Anthropic rate',
         round(coalesce(sum(list_usd), 0), 6), count(*)::bigint
  from priced where billing <> 'non-anthropic' and list_usd is not null
  union all
  select 9, 'DIFFERENCE, line 8 minus line 7 (negative = we booked more than Anthropic bills)',
         round(coalesce(sum(list_usd - booked_usd), 0), 6), count(*)::bigint
  from priced where billing <> 'non-anthropic' and list_usd is not null
  union all
  select 10, 'booked on Anthropic models with NO published rate here (excluded from 7-9)',
         round(coalesce(sum(booked_usd), 0), 6), count(*)::bigint
  from priced where billing <> 'non-anthropic' and list_usd is null
  union all
  select 11, 'credits charged for the month (not money — see CREDITS.md)',
         coalesce(sum(credits_charged), 0)::numeric, count(*)::bigint
  from window_rows
) t order by ord;
`.trim();
}

/** QUERY 3 — the denominator. How much of the month can be checked at
 *  all, and how much of it predates the split being recorded. */
export function buildCoverageQuery(month, table = "public.ai_cost_log") {
  const w = monthWindow(month);
  return `
-- Anthropic reconciliation, query 3 of 3: ${w.label}, coverage.
-- Run this FIRST. A month that is largely unattributed cannot be
-- reconciled, and queries 1 and 2 will happily report on the remainder
-- without saying so.
-- No rate table and no per-model expansion: this query is about the ROWS,
-- and pulling the model split apart here would count a row once per model
-- it used, which is the exact miscount the report is meant to expose.
with
  window_rows as (
    select id, metadata, real_cost_usd, real_cost_eur
    from ${table}
    where created_at >= timestamptz '${w.start} 00:00:00+00'
      and created_at <  timestamptz '${w.stop} 00:00:00+00'
  )
select
  case
    when metadata->'modelBreakdown' is null                then 'no split recorded (settled before V5 #12)'
    when metadata->'modelBreakdown' = '{}'::jsonb          then 'split recorded but EMPTY (a bug — nothing was accumulated)'
    else 'attributable'
  end                                                       as state,
  count(*)::bigint                                          as rows_n,
  round(coalesce(sum(real_cost_usd), 0), 6)                 as usd,
  round(coalesce(sum(real_cost_eur), 0), 6)                 as eur,
  min(id::text)                                             as an_example_row
from window_rows
group by 1
order by 2 desc;
`.trim();
}

/**
 * WHAT TO OPEN, AND WHAT TO READ, on console.anthropic.com. Kept as data
 * rather than prose in a report so the gate can require the report and
 * the script to say the same thing — a checklist that drifts from the
 * tool it describes is the shape docs/shapes.md already names.
 */
export const CONSOLE_STEPS = [
  {
    where: "console.anthropic.com -> Usage",
    look: "Set the date range to the same calendar month, group by MODEL. Note the token count per model, split into input / output / cache write / cache read.",
    against: "Query 1. Same model, same four kinds. The token counts should match to within the rows query 3 reports as unattributed.",
  },
  {
    where: "console.anthropic.com -> Cost",
    look: "Same month, grouped by model. This is dollars, not tokens, and it is the number the invoice is built from.",
    against: "Query 2, line 8. Line 9 is the difference, and every legitimate source of one is named in DIVERGENCES in this file.",
  },
  {
    where: "console.anthropic.com -> Settings -> Billing -> Invoices",
    look: "The invoice PDF for that month. Its total includes anything bought outside the API (seats, credits purchased, tax), which query 2 knows nothing about.",
    against: "Query 2, line 8 — but only after subtracting non-API lines from the invoice by hand. The Cost page is the better comparison; the invoice is the authority.",
  },
  {
    where: "The workspace selector, top left",
    look: "Whether the key this app uses belongs to the workspace whose usage you are reading. A key in another workspace produces a report that is correct and about somebody else's traffic.",
    against: "Nothing in this repository can check that for you.",
  },
  {
    where: "console.anthropic.com -> Usage, grouped by API KEY",
    look: "Whether more than one key is spending. The app is not the only thing that can hold a key from this account.",
    against: "Query 2, line 1. Spend from another key appears on the invoice and in no row of ai_cost_log — a difference the ledger cannot see and this list exists to name.",
  },
];

export function parsePsql(out) {
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("\t"));
}

function psqlArgsFromEnv() {
  if (process.env.DATABASE_URL) return [process.env.DATABASE_URL];
  if (process.env.PGDATABASE || process.env.PGHOST) return [];
  return null;
}

export function parseArgs(argv) {
  const month = argv.includes("--month") ? argv[argv.indexOf("--month") + 1] : defaultMonth();
  return { month, sql: argv.includes("--sql") };
}

function main() {
  const { month, sql } = parseArgs(process.argv.slice(2));
  const queries = [
    ["coverage", buildCoverageQuery(month)],
    ["invoice shape", buildInvoiceQuery(month)],
    ["reconciliation", buildReconcileQuery(month)],
  ];

  const problems = divergenceProblems();
  if (problems.length > 0) {
    console.error(
      `The price register is out of step with ${PRICING_SOURCE}:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nThe queries below would price those models wrong. Fix DIVERGENCES first.\n"
    );
  }

  if (sql) {
    for (const [name, text] of queries) {
      console.log(`-- ==== ${name} ====\n${text}\n`);
    }
    console.log("-- What to compare each of these against:");
    for (const s of CONSOLE_STEPS) {
      console.log(`--   ${s.where}\n--     look:    ${s.look}\n--     against: ${s.against}`);
    }
    return;
  }

  const args = psqlArgsFromEnv();
  if (!args) {
    console.error(
      "SKIPPED: no DATABASE_URL / PGDATABASE — this reads the production cost log.\n" +
        "  DATABASE_URL=postgres://... node scripts/db/anthropic-reconcile.mjs --month 2026-08\n" +
        "  node scripts/db/anthropic-reconcile.mjs --sql   # to paste into the SQL editor"
    );
    process.exit(2);
  }

  for (const [name, text] of queries) {
    const out = execFileSync(
      "psql",
      [...args, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", text],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const rows = parsePsql(out);
    console.log(`\n  ==== ${name} · ${month} ====`);
    if (rows.length === 0) {
      // NOT a zero. An empty month is a month with no settlements in it.
      console.log("  no rows in this window — that is no data, not a cost of zero");
      continue;
    }
    for (const r of rows) console.log(`  ${r.join("  ")}`);
  }

  console.log("\n  Now open the console:");
  for (const s of CONSOLE_STEPS) {
    console.log(`   ${s.where}\n     look:    ${s.look}\n     against: ${s.against}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("anthropic-reconcile.mjs")) main();
