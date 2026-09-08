#!/usr/bin/env node
/*
 * CAN THE LEDGER STILL DISAGREE WITH THE BILL?
 *
 * A reconciliation is only worth running if it can come out wrong. Every
 * mutation below makes the ledger agree with the invoice by construction
 * — by pricing what it cannot price at zero, by discounting what is not
 * discounted, by folding a provider that will never appear on an
 * Anthropic invoice into the comparison — and names the check in
 * scripts/tests/anthropic-reconcile.test.mjs that has to go red.
 *
 * WHY THE ZEROES ARE THE DANGEROUS ONES. A model with no published rate
 * priced at $0 does not look like a hole; it looks like agreement. The
 * report gets better the less it knows, which is the exact shape of the
 * failure CLAUDE.md records for /api/health and for i18n-coverage.
 *
 * WHAT THIS SUITE CANNOT REACH. The three SQL queries are executed by
 * scripts/tests/anthropic-reconcile.dbtest.mjs, and no mutation sweep on
 * this machine has a Postgres to run them against. So the mutations that
 * touch the SQL below are caught by what the unit gate can read of the
 * query TEXT, which is weaker than execution and is why the dbtest
 * exists as well.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/anthropic-reconcile.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/anthropic-reconcile.test.mjs";
const SRC = "scripts/db/anthropic-reconcile.mjs";
const ACC = "src/lib/billing/cost-accumulator.ts";
const RES = "src/lib/billing/reservations.ts";
const TARGETS = [SRC, ACC, RES];

const MUTANTS = [
  {
    // 1. A PROVIDER THAT IS NOT ANTHROPIC, PRICED AT ZERO. It then sits
    // inside the comparison contributing nothing, and every dollar of
    // voice spend silently improves the agreement.
    name: "a non-Anthropic provider is priced at zero instead of left unpriced",
    file: SRC,
    from: 'if (billing === "non-anthropic") return { billing, model, listUsd: null };',
    to: 'if (billing === "non-anthropic") return { billing, model, listUsd: 0 };',
    expect: "a non-Anthropic provider prices to null, never to zero",
  },
  {
    // 2. THE SAME TRICK ON AN UNKNOWN MODEL. This is the one that would
    // have hidden the 2026-08 incident: a model the table cannot price
    // costs nothing, so the difference against the invoice shrinks
    // exactly as the ignorance grows.
    name: "a model with no published rate is priced at zero",
    file: SRC,
    from: "if (!r) return { billing, model, listUsd: null };",
    to: "if (!r) return { billing, model, listUsd: 0 };",
    expect: "a model with no published rate prices to null, never to zero",
  },
  {
    // 3. A CACHE READ AT THE FULL INPUT RATE — ten times what Anthropic
    // charges. The invoice comparison then reads high on every cached
    // conversation, which is most of them.
    name: "a cache read is repriced as a full input token",
    file: SRC,
    from: "(n(usage?.cacheReadTokens) / 1e6) * r.input * 0.1 +",
    to: "(n(usage?.cacheReadTokens) / 1e6) * r.input +",
    expect: "a cache read costs a tenth of an input token, not the same",
  },
  {
    // 4. THE 1-HOUR CACHE WRITE AT THE 5-MINUTE RATE — 37.5% low, the
    // exact under-count model-pricing.ts's own header documents.
    name: "a 1-hour cache write is repriced at the 5-minute rate",
    file: SRC,
    from: "(n(usage?.cacheWrite1hTokens) / 1e6) * r.input * 2 +",
    to: "(n(usage?.cacheWrite1hTokens) / 1e6) * r.input * 1.25 +",
    expect: "a 1-hour cache write costs 2x, not 1.25x",
  },
  {
    // 5. THE BATCH DISCOUNT FORGOTTEN ON THE INVOICE SIDE. Anthropic
    // halves it; the comparison would not, and every batched run would
    // read as if we had under-booked by 2x.
    name: "the batch half-rate is dropped from the repricer",
    file: SRC,
    from: 'return { billing, model, listUsd: usd * (billing === "batch" ? 0.5 : 1) };',
    to: "return { billing, model, listUsd: usd };",
    expect: "a batch line is halved",
  },
  {
    // 6. THE REGISTER STOPS LOOKING FOR NEW MODELS. Somebody adds a
    // model to MODEL_PRICING_USD, this file cannot price it, and nothing
    // says so — the allowlist becomes furniture.
    name: "the register stops noticing a model it cannot price",
    file: SRC,
    from: "    if (!agrees && !declared.has(model)) {",
    to: "    if (!agrees && declared.has(model)) {",
    expect: "a model in the pricing table that this file cannot price reddens it",
  },
  {
    // 7. AND STOPS LOOKING THE OTHER WAY. A divergence that has been
    // fixed upstream keeps its exemption for ever, which is how an
    // allowlist goes stale without a line of output changing.
    name: "the register stops noticing a divergence that has been resolved",
    file: SRC,
    from: "    if (agrees && declared.has(model)) {",
    to: "    if (agrees && declared.has(model) && model === '') {",
    expect: "a declared divergence that has stopped diverging reddens it",
  },
  {
    // 8. THE MONTH STOPS ROLLING OVER. December's window would run to a
    // thirteenth month, which Postgres rejects — but only when somebody
    // runs it in January, on the invoice that matters most.
    name: "December's window does not roll into the next year",
    file: SRC,
    from: 'const stop = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;',
    to: 'const stop = `${y}-${String(m + 1).padStart(2, "0")}-01`;',
    expect: "December rolls into the next year",
  },
  {
    // 9. THE DEFAULT BECOMES THE CURRENT MONTH — a partial month
    // compared against an invoice that does not exist yet, which
    // disagrees for a reason that has nothing to do with pricing.
    name: "the default window becomes the month in progress",
    file: SRC,
    from: "const prev = new Date(Date.UTC(y, m - 1, 1));",
    to: "const prev = new Date(Date.UTC(y, m, 1));",
    expect: "the default is the last COMPLETE month, not the current one",
  },
  {
    // 10. THE UPPER BOUND BECOMES INCLUSIVE. One row lands on two
    // invoices — invisible at any scale where a single settlement does
    // not matter, and wrong every month.
    name: "the month's upper bound becomes inclusive",
    file: SRC,
    from: "and created_at <  timestamptz",
    to: "and created_at <= timestamptz",
    all: true,
    expect: "query's upper bound is exclusive",
  },
  {
    // 11. NON-ANTHROPIC SPEND WALKS INTO THE COMPARISON. Lines 7-9 of
    // query 2 would then be measuring a bill that includes a provider
    // Anthropic has never heard of.
    name: "the reconciliation stops excluding non-Anthropic spend",
    file: SRC,
    from: "billing <> 'non-anthropic'",
    to: "billing is not null",
    all: true,
    expect: "excludes non-Anthropic spend from the comparison",
  },
  {
    // 12. THE ROWS THAT CANNOT BE RECONCILED STOP SAYING SO. The money
    // is still on the line; the line no longer admits what it is. That
    // is the difference between a report and a reassurance.
    name: "the unreconcilable rows lose the line that names them",
    file: SRC,
    from: "'  ... on rows with NO model split (not reconcilable, ever)'",
    to: "'  ... other rows'",
    expect: "names the rows it CANNOT reconcile",
  },
  {
    // 13. THE BATCH PREFIX IS TIDIED AWAY IN THE ACCUMULATOR. The cost
    // row then claims full-rate Sonnet where half-rate Sonnet was
    // served, and the invoice comparison reads 2x high.
    name: "byModel drops the batch prefix from the key",
    file: ACC,
    from: "          ? `batch:${normalizeModelId(bareModelId(e.model))}`",
    to: "          ? normalizeModelId(bareModelId(e.model))",
    expect: "the batch prefix survives, because it changes the rate",
  },
  {
    // 14. THE DATED SNAPSHOT ID IS KEPT. Every deploy that pins a dated
    // model produces a key the console has never heard of, and the
    // invoice comparison finds nothing to compare it with.
    name: "byModel keeps the dated snapshot id instead of the alias",
    file: ACC,
    from: "          : normalizeModelId(e.model);",
    to: "          : e.model;",
    expect: "a dated snapshot id folds onto its alias",
  },
  {
    // 15. THE `?? 0` GOES. A snapshot written by an earlier deploy has
    // no cacheWrite1hTokens, `+ undefined` is NaN, and NaN serialises to
    // null in jsonb — a blank where a token count belongs.
    name: "byModel adds a field an older snapshot does not carry",
    file: ACC,
    from: "      row.cacheWrite1hTokens += e.usage.cacheWrite1hTokens ?? 0;",
    to: "      row.cacheWrite1hTokens += e.usage.cacheWrite1hTokens;",
    expect: "does not turn the split into NaN",
  },
  {
    // 16. THE SPLIT IS WRITTEN ONLY WHEN IT IS NON-EMPTY. A row settled
    // before this shipped and a row that accumulated nothing then look
    // identical, and the coverage query — the denominator of the whole
    // report — cannot tell an old row from a bug.
    name: "settlement omits an empty split instead of recording it",
    file: RES,
    from: "        modelBreakdown: costs.byModel(),",
    to: "        modelBreakdown: costs.byModel() || undefined,",
    expect: "never as `|| undefined`",
  },
];

function runGate(file) {
  try {
    execFileSync(process.execPath, [file], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("anthropic-reconcile mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate(GATE);
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const src = originals.get(m.file);
    if (!src.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = m.all ? src.split(m.from).join(m.to) : src.replace(m.from, m.to);
    writeFileSync(m.file, mutated);
    let result;
    try {
      result = runGate(GATE);
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate(GATE);
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A reconciliation that cannot disagree with the invoice turns this red.");
