#!/usr/bin/env node
/*
 * THE QUALITY BASELINE (V4 #33).
 *
 * 154 real cases across seven capabilities, each one carrying the failure
 * it exists to catch. Almost every check is MECHANICAL — a regex, a
 * structural property, a numeric bound — so the number is reproducible
 * and can be argued with by reading it.
 *
 * WHY A BASELINE AT ALL. #34 changes which model serves which request and
 * #35 routes automatically. Neither can ship without a before-and-after,
 * and "it seems fine" is not one. This is the before.
 *
 * IT MAKES REAL, BILLED CALLS. That is why it lives in scripts/evals/ and
 * not scripts/tests/: it must never run in the build gate. The SCORER is
 * unit-tested separately with no key (scripts/tests/evals.test.mjs), so
 * the instrument is checked before it is trusted.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/evals/run.mjs
 *   ... node scripts/evals/run.mjs --capability chat --model claude-haiku-4-5-20251001
 *   ... node scripts/evals/run.mjs --out baseline.json
 *   ... node scripts/evals/run.mjs --compare baseline.json      # #34's gate
 *
 * --compare turns this into the rollback decision: it re-runs, diffs
 * against the stored baseline, and EXITS NON-ZERO if any capability's
 * success rate fell by more than 10%.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
      "This suite makes 154 real, billed Anthropic calls — that is why it is not part\n" +
      "of the build gate. The SCORER is tested without a key by\n" +
      "scripts/tests/evals.test.mjs; only the numbers need the key.\n\n" +
      "  ANTHROPIC_API_KEY=sk-ant-... node scripts/evals/run.mjs"
  );
  process.exit(2);
}

const { loadTs } = await import("../tests/load-ts.mjs");
const scoring = await loadTs("src/lib/evals/scoring.ts");

const DATASET_DIR = path.resolve("scripts/evals/datasets");
const MODEL = flag("model", "claude-sonnet-4-6");
const ONLY = flag("capability");
const CONCURRENCY = Number(flag("concurrency", "4"));

// ---------------------------------------------------------------------
// Loading, with the dataset validated before a single euro is spent.
// ---------------------------------------------------------------------
function loadCases() {
  const cases = [];
  for (const file of readdirSync(DATASET_DIR).sort()) {
    if (!file.endsWith(".jsonl")) continue;
    const capability = file.replace(/\.jsonl$/, "");
    if (ONLY && capability !== ONLY) continue;
    const lines = readFileSync(path.join(DATASET_DIR, file), "utf8").trim().split("\n");
    for (const [i, line] of lines.entries()) {
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        throw new Error(`${file} line ${i + 1} is not valid JSON: ${err.message}`);
      }
      if (parsed.capability !== capability) {
        throw new Error(`${file} line ${i + 1}: capability "${parsed.capability}" does not match the file`);
      }
      cases.push(parsed);
    }
  }
  return cases;
}

// ---------------------------------------------------------------------
// THE SYSTEM PROMPT PER CAPABILITY.
//
// Deliberately short and NEUTRAL. This measures the MODEL on the task,
// which is what #34 changes; it is not a re-run of the production prompts
// (the website prompt alone is 29k characters and would make every
// capability a measurement of that prompt instead). When a capability's
// real prompt changes, this baseline stays comparable across models,
// which is the only property that makes a before/after meaningful.
// ---------------------------------------------------------------------
const SYSTEM = {
  chat: "You are a careful business assistant. Answer directly. If you do not know something, say so rather than guessing.",
  create:
    'Classify what the user wants to create. Reply with JSON only: {"type": one of website|mission|moduleEntry|automation|document, "module": the best-matching module slug or null, "fields": {...}}. No prose.',
  website:
    "You generate complete, self-contained HTML pages. Output only the HTML document. Follow every explicit instruction in the brief exactly, including prohibitions.",
  agents:
    'Turn the request into a scheduled agent. Reply with JSON only: {"name": string, "prompt": string, "schedule_cron": 5-field cron, "timezone": IANA zone, "delivery_method": string, "delivery_target": string, "depth": simple|standard|deep}. A schedule may run at most once per hour. Agents produce text; they cannot modify data, send mail on the user\'s behalf to third parties, or learn between runs. If the request needs something you cannot do, say so in prose instead of inventing a field.',
  research:
    "You are a research assistant. Give sourced, specific answers. Cite URLs when asked. Say plainly when you do not know or cannot verify something, and never invent a source, a statistic or an organisation.",
  files:
    "You answer questions about the attached data. Compute exactly. Never state a value the data does not contain, and say so when the data cannot answer the question.",
  mission:
    'Break the goal into concrete steps. Reply with JSON only: {"steps": [string, ...], "notes": string}. If the goal is too vague or not achievable as stated, say so in "notes".',
};

// ---------------------------------------------------------------------
// The call. One place, so latency and cost are measured identically for
// every case and every model.
// ---------------------------------------------------------------------
async function callModel(evalCase) {
  const userText = evalCase.attachment
    ? `${evalCase.input}\n\n--- attached data ---\n${evalCase.attachment}`
    : evalCase.input;

  const started = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM[evalCase.capability],
      messages: [{ role: "user", content: userText }],
    }),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, reason: `HTTP ${res.status}: ${body.slice(0, 200)}`, latencyMs, costUsd: 0 };
  }
  const json = await res.json();
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // COST FROM THE RESPONSE'S OWN USAGE, never from an estimate. An
  // estimated cost in a table headed "Cost" is a guess wearing a
  // measurement's clothes.
  const usage = json.usage ?? {};
  const price = MODEL_PRICES[MODEL] ?? null;
  const costUsd = price
    ? ((usage.input_tokens ?? 0) / 1e6) * price.in + ((usage.output_tokens ?? 0) / 1e6) * price.out
    : 0;

  return { ok: true, text, latencyMs, costUsd, priced: Boolean(price) };
}

// USD per million tokens. A model absent from this map reports cost 0 AND
// sets `priced: false`, so the table can say the cost column is unknown
// rather than printing a confident zero.
const MODEL_PRICES = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-6": { in: 15, out: 75 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

async function runAll(cases) {
  const outcomes = [];
  let unpriced = 0;
  let done = 0;
  const queue = [...cases];

  async function worker() {
    for (;;) {
      const evalCase = queue.shift();
      if (!evalCase) return;
      let result;
      try {
        result = await callModel(evalCase);
      } catch (err) {
        result = { ok: false, reason: String(err.message ?? err), latencyMs: 0, costUsd: 0 };
      }
      done++;
      process.stdout.write(`\r  ${done}/${cases.length}   `);

      if (!result.ok) {
        outcomes.push({
          id: evalCase.id,
          capability: evalCase.capability,
          status: "error",
          reason: result.reason,
          latencyMs: result.latencyMs,
          costUsd: 0,
        });
        continue;
      }
      if (result.priced === false) unpriced++;
      const { score, results } = scoring.scoreCase(result.text, evalCase.checks);
      const failed = results.find((r) => !r.passed);
      outcomes.push({
        id: evalCase.id,
        capability: evalCase.capability,
        status: failed ? "fail" : "pass",
        score,
        checks: results,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        ...(failed ? { firstFailure: `${failed.kind} ${failed.detail ?? ""}`.trim() } : {}),
      });
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
  process.stdout.write("\r");
  return { outcomes, unpriced };
}

// ---------------------------------------------------------------------
const cases = loadCases();
console.log(`\nIONEXA QUALITY BASELINE`);
console.log(`  model        ${MODEL}`);
console.log(`  cases        ${cases.length}${ONLY ? ` (capability: ${ONLY})` : ""}`);
console.log(`  graded by    mechanical checks only — no model grades any case in this run`);
console.log(`\n  running...`);

const { outcomes, unpriced } = await runAll(cases);
const summaries = scoring.summarise(outcomes);

console.log("\n  Capability   Success   AvgScore   Median   p90      Cost/case   Total");
console.log("  " + "-".repeat(74));
for (const s of summaries) {
  const pct = (v) => (v === null ? "    —" : `${(v * 100).toFixed(1)}%`.padStart(6));
  const ms = (v) => (v === null ? "    —" : `${v}ms`.padStart(7));
  const usd = (v) => (v === null || unpriced > 0 ? "        —" : `$${v.toFixed(5)}`.padStart(9));
  console.log(
    `  ${s.capability.padEnd(12)} ${pct(s.successRate)}   ${pct(s.avgScore)}     ` +
      `${ms(s.medianLatencyMs)} ${ms(s.p90LatencyMs)}  ${usd(s.avgCostUsd)}   ` +
      (unpriced > 0 ? "—" : `$${s.totalCostUsd.toFixed(4)}`) +
      (s.errors ? `   (${s.errors} errored)` : "")
  );
}
if (unpriced > 0) {
  console.log(`\n  COST NOT REPORTED: ${MODEL} is not in MODEL_PRICES, so per-token cost is unknown.`);
  console.log(`  A zero would read as free. Add the model's real rates to price this run.`);
}

// EVERY FAILURE, NAMED. A percentage with no failing cases under it
// cannot be acted on, and the point of a baseline is to be improved.
const failures = outcomes.filter((o) => o.status === "fail");
if (failures.length) {
  console.log(`\n  ${failures.length} failing cases:`);
  for (const f of failures) console.log(`    ${f.id.padEnd(12)} score ${f.score.toFixed(2)}  first failure: ${f.firstFailure}`);
}
const errored = outcomes.filter((o) => o.status === "error");
if (errored.length) {
  console.log(`\n  ${errored.length} cases could not run (EXCLUDED from every rate above):`);
  for (const e of errored) console.log(`    ${e.id.padEnd(12)} ${e.reason.slice(0, 100)}`);
}

const outPath = flag("out");
if (outPath) {
  writeFileSync(outPath, JSON.stringify({ model: MODEL, summaries, outcomes }, null, 2));
  console.log(`\n  written to ${outPath}`);
}

// ---- #34's automatic rollback decision -------------------------------
const comparePath = flag("compare");
if (comparePath) {
  const baseline = JSON.parse(readFileSync(comparePath, "utf8"));
  const drops = scoring.regressions(baseline.summaries, summaries, 10);
  console.log(`\n  COMPARED AGAINST ${comparePath} (model ${baseline.model})`);
  if (drops.length === 0) {
    console.log("  No capability lost more than 10% of its success rate. Safe to keep.");
  } else {
    console.log("  QUALITY REGRESSION — roll back:");
    for (const d of drops) {
      console.log(
        `    ${d.capability.padEnd(12)} ${(d.before * 100).toFixed(1)}% -> ${(d.after * 100).toFixed(1)}%  (-${d.dropPercent.toFixed(1)}% relative)`
      );
    }
    process.exit(1);
  }
}

console.log("");
