#!/usr/bin/env node
/*
 * CAN metric-clarity.test.mjs SEE A NUMBER STOP EXPLAINING ITSELF?
 *
 * Nine mutations, nine dimensions. Two of them are the mistakes this
 * branch has already made once each, put back deliberately:
 *
 *   - handing an ICU plural a formatNumber() string, so the message
 *     prints NaN (voice-player.tsx, found two commits ago);
 *   - a `>=` that calls "the same" an improvement, so two empty weeks
 *     render a green up-arrow.
 *
 *   1. the currency formatter ignores the locale
 *   2. ...or drops the grouping pin, so server and browser disagree
 *   3. ...or lets a float tail through
 *   4. a money field stops being marked as money
 *   5. the record card goes back to interpolating the raw value
 *   6. a metric loses its explanation
 *   7. a metric stops linking to its records
 *   8. a plural is handed a formatted string
 *   9. equal counts as a win again
 *
 * Run: node scripts/tests/metric-clarity.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/metric-clarity.test.mjs";
const FORMAT = "src/lib/format-number.ts";
const MODULES = "src/lib/modules.ts";
const CARD = "src/components/modules/generic-record-card.tsx";
const OVERVIEW = "src/app/dashboard/overview/page.tsx";
const REFLECTION = "src/components/reflection/reflection-generator.tsx";
const TARGETS = [GATE, FORMAT, MODULES, CARD, OVERVIEW, REFLECTION];

const MUTANTS = [
  {
    name: "the currency formatter ignores the locale it is given",
    file: FORMAT,
    from: '  return new Intl.NumberFormat(locale, {\n    style: "currency",',
    to: '  return new Intl.NumberFormat("en", {\n    style: "currency",',
    expect: "Greek does not use the English form",
  },
  {
    name: "the grouping pin is dropped, so the two runtimes can disagree",
    file: FORMAT,
    from: '    currency: "EUR",\n    useGrouping: "always",',
    to: '    currency: "EUR",',
    expect: "formatCurrency pins useGrouping",
  },
  {
    name: "a float tail reaches the screen",
    file: FORMAT,
    from: '  if (!Number.isFinite(value)) return "—";\n  return new Intl.NumberFormat(locale, {\n    style: "currency",',
    to: '  if (!Number.isFinite(value)) return "—";\n  if (String(value).length > 8) return String(value);\n  return new Intl.NumberFormat(locale, {\n    style: "currency",',
    expect: "no float tail",
  },
  {
    name: "the finance amount stops being marked as money",
    file: MODULES,
    from: '{ key: "amount", labelKey: "moduleData.fields.amount", type: "number", required: true, badge: true, money: true },',
    to: '{ key: "amount", labelKey: "moduleData.fields.amount", type: "number", required: true, badge: true },',
    expect: "money-shaped key is unmarked",
  },
  {
    name: "the record card goes back to interpolating the raw value",
    file: CARD,
    from: "label: `${tKey(field.labelKey)}: ${displayValue(field, record[field.key], locale)}`,",
    to: "label: `${tKey(field.labelKey)}: ${record[field.key]}`,",
    expect: "the tag value goes through a formatter",
  },
  {
    name: "a metric loses its explanation",
    file: OVERVIEW,
    from: 'explain={t("statRow.mostActiveExplain")}',
    to: "",
    expect: "carry an explain line",
  },
  {
    name: "a metric stops opening the records behind it",
    file: OVERVIEW,
    from: '            href="/dashboard/timeline?range=week"',
    to: "",
    expect: "the entry counts open the timeline",
  },
  {
    // THE ONE THIS BRANCH ALREADY GOT WRONG ONCE.
    name: "a plural is handed a formatted string, so it prints NaN",
    file: OVERVIEW,
    from: 't("statRow.fromEntries", { count: mostActive.count })',
    to: 't("statRow.fromEntries", { count: formatNumber(mostActive.count, locale) })',
    expect: "neither plural is handed a formatted string",
  },
  {
    name: "equal counts as a win again",
    file: REFLECTION,
    from: "      : stats.totalThisWeek > stats.totalLastWeek",
    to: "      : stats.totalThisWeek >= stats.totalLastWeek",
    expect: "equal is not a win either",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
      body: out,
    };
  }
}

console.log("metric-clarity mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget =
      result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
    if (!onTarget) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
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
console.log("Every clause of metric-clarity.test.mjs is load-bearing.");
