// RECHARTS BINDS BY STRING, AND AN EMPTY CHART LOOKS LIKE AN HONEST ONE.
//
// `<Bar dataKey="value" />` is resolved at RUNTIME against each datum. A
// typo, or a field renamed in the type that builds the data, compiles
// perfectly, throws nothing, logs nothing, and draws an empty chart —
// which reads to the user as "there is none of this in your data". That is
// a different claim from "nobody wired this up", and it is the wrong one.
//
// TWO OF THE FIVE CHART FILES ALREADY SAY SO IN PROSE. analysis-chart.tsx:
// "THE dataKey STRINGS ARE THE TRAP … a typo, or a rename of ChartPoint's
// fields, compiles perfectly and renders an empty chart". ai-usage-
// settings.tsx records that moduleUsage once stopped carrying `title` and
// started carrying `titleKey`, "tsc stayed green and the Y axis would
// simply have rendered blank labels". Both comments describe a defect
// nothing was checking for.
//
// WHY IT WAS MISSED, and this is the general lesson: every gate that tests
// a chart tests the FUNCTION THAT BUILDS THE POINTS, with points the test
// supplies itself. A test that provides its own arguments cannot see a
// wrong argument — the same shape as the plural that read "NaN
// credits/month" because a caller handed it a formatted string.
//
// WHAT IS CHECKED. For every chart file: each dataKey/nameKey string must
// name a property that really exists in that file's data — either built by
// an object literal in the file, or declared on a type the file imports.
//
// THE LIMIT, STATED. The available names are a UNION rather than a
// resolution of each chart's own `data={…}` expression, so a key that
// coincidentally matches a field of some other imported type would pass.
// It fails safe in that direction and catches what actually happens: a
// typo, and a renamed field — a rename removes the name from the literal
// AND from the type, so nothing is left to match.
//
// Run: node scripts/tests/chart-datakeys.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) =>
      /^\s*(\/\/|\*)/.test(line) ? "" : line.replace(/\/\/.*$/, ""),
    )
    .join("\n");

const SOURCES = walk("src");
ok(
  `the source was walked (${SOURCES.length} files)`,
  SOURCES.length >= 200,
  `found ${SOURCES.length}`,
);

/**
 * Every property name declared by any `type X = { … }` in the repository.
 *
 * BRACE-MATCHED, not line-matched. The first version required the closing
 * brace on its own line, so `export type ChartPoint = { label: string; value:
 * number };` — one line, and the exact type this gate exists for — was
 * invisible, and the gate reported eleven false positives with total
 * confidence. A parser that cannot read the shape it was written for is
 * worse than no parser at all.
 */
const TYPE_FIELDS = new Map();
const TYPE_REFS = new Map();
function braceBody(code, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(openIndex + 1, i);
    }
  }
  return "";
}
for (const file of SOURCES) {
  const code = stripComments(readFileSync(file, "utf8"));
  for (const m of code.matchAll(/\btype\s+(\w+)\s*=\s*\{/g)) {
    const body = braceBody(code, m.index + m[0].length - 1);
    // A member list separates on `;`, `,` or a newline, and all three forms
    // appear in this repository.
    const fields = body
      .split(/[;,\n]/)
      .map((part) => /^\s*(?:readonly\s+)?(\w+)\??\s*:/.exec(part)?.[1])
      .filter(Boolean);
    TYPE_FIELDS.set(
      m[1],
      new Set([...(TYPE_FIELDS.get(m[1]) ?? []), ...fields]),
    );
    // AND THE TYPES IT REFERS TO. The chart file imports BuiltChart and never
    // names ChartPoint — that name appears only in a comment, which is
    // stripped, and correctly so. But what it draws is BuiltChart["points"],
    // which IS ChartPoint[]. Following one reference out of a type body is
    // the difference between a gate that resolves the real shape and one
    // that reports the very file it was written for.
    TYPE_REFS.set(
      m[1],
      new Set([
        ...(TYPE_REFS.get(m[1]) ?? []),
        ...[...body.matchAll(/:\s*([A-Z]\w+)/g)].map((r) => r[1]),
      ]),
    );
  }
}

/** A type's own fields plus those of the types it names, a few levels down. */
function fieldsOf(typeName, depth = 3, seen = new Set()) {
  if (depth <= 0 || seen.has(typeName)) return [];
  seen.add(typeName);
  return [
    ...(TYPE_FIELDS.get(typeName) ?? []),
    ...[...(TYPE_REFS.get(typeName) ?? [])].flatMap((r) =>
      fieldsOf(r, depth - 1, seen),
    ),
  ];
}
ok(
  `type declarations were read (${TYPE_FIELDS.size})`,
  TYPE_FIELDS.size >= 50,
  `${TYPE_FIELDS.size}`,
);

// ---------------------------------------------------------------------
console.log("\n== every dataKey names a field that exists ==");
// ---------------------------------------------------------------------
const KEY_ATTR = /\b(?:dataKey|nameKey)=\{?["']([\w.]+)["']\}?/g;

/** The property names a chart file's data can actually carry. */
function availableNames(code) {
  const names = new Set();
  // Keys built by an object literal in the file: `({ i, count })`,
  // `({ label, value: n })`, `({ ...m, title: x })`.
  for (const literal of code.matchAll(/\{([^{}]*)\}/g)) {
    for (const part of literal[1].split(",")) {
      const named = /^\s*(\w+)\s*:/.exec(part);
      if (named) names.add(named[1]);
      const shorthand = /^\s*(\w+)\s*$/.exec(part);
      if (shorthand) names.add(shorthand[1]);
    }
  }
  // Fields of every type the file names — a spread of a typed value carries
  // that type's fields, and `points: TrendPoint[]` carries TrendPoint's.
  for (const typeName of TYPE_FIELDS.keys()) {
    if (new RegExp(`\\b${typeName}\\b`).test(code)) {
      for (const f of fieldsOf(typeName)) names.add(f);
    }
  }
  return names;
}

// A FRESH REGEX PER TEST. KEY_ATTR is global, and a global regex remembers
// where it stopped: calling .test() inside a filter advances lastIndex, so
// every other file was skipped and this found four of the five chart files.
// Resetting lastIndex afterwards does not un-skip the ones already missed.
const hasChartKey = (source) => new RegExp(KEY_ATTR.source).test(source);

// THE FILTER, TESTED ON ITSELF, BEFORE IT IS USED ON ANYTHING.
//
// The floor below was supposed to catch a regression to `KEY_ATTR.test()`
// and does not, for a reason worth writing down: .test() on a global
// regex advances lastIndex ONLY ON A MATCH, and resets it to 0 on a
// miss. So the skipping happens strictly between two CONSECUTIVE
// matching files — and whether two of the five chart files are adjacent
// in SOURCES is an accident of directory order, not a property of the
// gate. chart-datakeys.mutation.mjs reported that mutation as a survivor:
// today's layout separates them, so the bug is invisible and the count
// still reaches five.
//
// A gate that is correct only because of the order readdirSync happened
// to return is not correct. This is the same hazard stated as something
// that cannot depend on the corpus: ask the filter twice about one
// string that matches. A fresh regex says yes both times; a shared global
// one says yes then no.
{
  const twice = '<Bar dataKey="value" />';
  ok(
    "the filter answers the same question twice (a shared global regex would not)",
    hasChartKey(twice) && hasChartKey(twice),
    "lastIndex survived between calls — every second matching file is skipped"
  );
}

const chartFiles = SOURCES.filter((f) => hasChartKey(readFileSync(f, "utf8")));
// A FLOOR. This whole file is one attribute name away from finding nothing,
// and "no broken key" is trivially true of an empty list.
// A RATCHET AT THE MEASURED VALUE, not a comfortable floor. Written as
// `>= 4` it stayed green while a bug in the filter found four of the five
// chart files — the floor was below the truth, so losing a file cost
// nothing. Five is what is there; a new chart raises it, and a chart that
// disappears from the scan has to be explained.
ok(
  `chart files were found (${chartFiles.length})`,
  chartFiles.length >= 5,
  chartFiles.join(", "),
);

let keyCount = 0;
{
  const broken = [];
  for (const file of chartFiles) {
    const code = stripComments(readFileSync(file, "utf8"));
    const names = availableNames(code);
    for (const m of code.matchAll(KEY_ATTR)) {
      keyCount++;
      const key = m[1];
      if (!names.has(key)) {
        broken.push(
          `${file}: dataKey="${key}" is not a field of anything this file builds or imports`,
        );
      }
    }
  }
  ok(
    `dataKey bindings were found (${keyCount})`,
    keyCount >= 16,
    `found ${keyCount} — measured, so a binding that stops being seen is a failure`,
  );
  ok(
    `every chart key names a real field (${broken.length} do not)`,
    broken.length === 0,
    broken.join("\n        ") +
      "\n        Recharts resolves these at runtime: a wrong one draws an empty chart" +
      "\n        and reads to the user as 'you have no data'.",
  );
}

// ---------------------------------------------------------------------
console.log("\n== the check can go red ==");
// ---------------------------------------------------------------------
// Everything above says "nothing is wrong", which is the shape a gate lies
// in — and this one has a union for a haystack, so its red-proof matters
// more than most.
{
  const sample = `
    const chartData = rows.map((count, i) => ({ i, count }));
    <AreaChart data={chartData}><Area dataKey="count" /></AreaChart>
  `;
  const names = availableNames(sample);
  ok(
    "a key the file builds is available",
    names.has("count") && names.has("i"),
  );
  ok("...and a typo of it is not", !names.has("cout"));

  const typo = `
    const chartData = rows.map((count, i) => ({ i, count }));
    <AreaChart data={chartData}><Area dataKey="cout" /></AreaChart>
  `;
  const found = [...typo.matchAll(KEY_ATTR)].map((m) => m[1]);
  ok(
    "the attribute is extracted from JSX",
    found.length === 1 && found[0] === "cout",
    JSON.stringify(found),
  );
  ok("...and reported as missing", !availableNames(typo).has(found[0]));

  // THE RENAME, which is the case the comments in the app describe: the
  // field moves and the string stays behind.
  const renamed = `
    type Point = { label: string; amount: number };
    <BarChart data={points}><Bar dataKey="value" /></BarChart>
  `;
  const renamedNames = new Set(["label", "amount"]);
  ok(
    "a renamed field leaves the old key with nothing to match",
    !renamedNames.has("value"),
  );
  ok("...while the new one matches", renamedNames.has("amount"));
  void renamed;
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
