#!/usr/bin/env node
/*
 * CAN provenance.test.mjs SEE THE SOURCE LINE START LYING?
 *
 * A provenance line is the one piece of UI whose whole value is that it
 * is true. A count that quietly becomes a guess, a capped read that stops
 * saying it was capped, a link that points at a record the model never
 * saw — none of those look broken. They look like a feature working.
 *
 *   1. the cap stops being reported, so a partial read reads as complete
 *   2. empty modules are dropped, and "I have no data" is the only refusal
 *   3. an unparseable date is read as 1970
 *   4. the model is asked to cite, so the citation can be composed
 *   5. headlines and rows are derived separately again
 *   6. the context stops carrying the empty modules
 *   7. provenance is built from the full scan, not what was sent
 *   8. the meta event stops carrying it
 *   9. a source with no id is dropped instead of listed
 *  10. the URL opens a record that is not on the page
 *  11. the statement leaves the first screen
 *  12. one language loses the statement
 *  13. a total-rows field appears for somebody to fill in
 *
 * Run: node scripts/tests/provenance.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/provenance.test.mjs";
const PROV = "src/lib/chat/provenance.ts";
const CTX = "src/lib/user-context.ts";
const ROUTE = "src/app/api/chat/route.ts";
const LINE = "src/components/chat/provenance-line.tsx";
const LIST = "src/components/modules/generic-list.tsx";
const WS = "src/components/chat/chat-workspace.tsx";
const MENTOR = "src/lib/chat/mentor-context.ts";
const TRADING = "src/lib/chat/trading-mentor-context.ts";
const JA = "messages/ja.json";
const TARGETS = [GATE, PROV, CTX, ROUTE, LINE, LIST, WS, MENTOR, TRADING, JA];

const MUTANTS = [
  {
    // "18 entries" in an account with two hundred is a quiet lie, and it
    // is the kind that survives review because the number is real.
    name: "a capped read stops saying it was capped",
    file: PROV,
    from: "    if (rows.length >= perModuleCap) capped = true;",
    to: "",
    expect: "hitting the cap sets capped",
  },
  {
    name: "empty modules are dropped from the summary",
    file: PROV,
    from: "      emptyModules.push({ slug: m.slug, title: m.title });",
    to: "",
    expect: "empty modules are listed by name",
  },
  {
    name: "an unparseable date is read as 1970",
    file: PROV,
    from: "Number.isFinite(ms) && ms > 0 ? ms : null;",
    to: "Number.isFinite(ms) && ms >= 0 ? ms : null;",
    expect: "an unparseable date is dropped, not read as 1970",
  },
  {
    // The whole argument of this feature, inverted: ask the model to cite
    // and it produces citation-shaped text whether or not it read
    // anything.
    name: "the model is asked to cite its sources",
    file: PROV,
    from: '    "Do NOT invent numbers that are not above. If the data is not enough, say so and say what is missing.",',
    to: '    "Cite the entries you used as [1], [2] after each claim.",',
    expect: "does not ask the model to produce citations",
  },
  {
    // A blank headline drops from one list and not the other, and the
    // source list then credits an entry the model never saw.
    name: "headlines and rows are derived separately again",
    file: CTX,
    from: "    const headlines = carried.map((r) => r.headline);",
    to: '    const headlines = rows.map((row) => String(row[config.headlineKey] ?? "").trim()).filter(Boolean);',
    expect: "the rows and the headlines come from ONE filtered list",
  },
  {
    name: "the context stops carrying the empty modules",
    file: CTX,
    from: "  const emptyModules = perModule",
    to: "  const emptyModulesUnused = perModule",
    expect: "the empty modules survive the filter",
  },
  {
    // The relevance pass decides what the model sees. Summarising the
    // full scan credits modules that were dropped before the prompt.
    name: "provenance is built from the full scan, not what was sent",
    file: ROUTE,
    from: "          ...selection.keep.map((m) => ({ slug: m.slug, title: m.title, rows: m.rows })),",
    to: "          ...fullContext.moduleSummaries.map((m) => ({ slug: m.slug, title: m.title, rows: m.rows })),",
    expect: "from the modules that were actually sent",
  },
  {
    // Twelve entries reported as twenty-four, each printed twice.
    name: "the two scans stop deduping",
    file: PROV,
    from: "      if (seen.has(key)) continue;",
    to: "",
    expect: "an entry read by both scans counts once",
  },
  {
    name: "a module one scan found empty is called empty anyway",
    file: PROV,
    from: "      !contributing.has(m.slug) && emptyModules.findIndex((o) => o.slug === m.slug) === i",
    to: "      emptyModules.findIndex((o) => o.slug === m.slug) === i",
    expect: "is NOT called empty",
  },
  {
    name: "the mentor scan's rows stop being counted",
    file: ROUTE,
    from: "          ...mentor.modules,\n",
    to: "",
    expect: "the mentor scan's rows are counted too",
  },
  {
    // The scan takes a userId and used to use it only for an error log.
    name: "a prompt scan goes back to trusting RLS alone",
    file: MENTOR,
    from: '          .eq("user_id", userId)\n',
    to: "",
    expect: "filters on user_id rather than trusting RLS",
  },
  {
    name: "...and so does the trading one",
    file: TRADING,
    from: '      .eq("user_id", userId)\n',
    to: "",
    expect: "filters on user_id rather than trusting RLS",
  },
  {
    // MAX_MODULES_IN_SUMMARY drops modules after they are read.
    name: "the mentor scan credits modules it read but did not send",
    file: MENTOR,
    from: "      modules: withData.map((m) => ({ slug: m.slug, title: m.title, rows: m.rows })),",
    to: "      modules: perModule.filter((m) => m !== null).map((m) => ({ slug: m.slug, title: m.title, rows: m.rows })),",
    expect: "only the modules that survived its own cap",
  },
  {
    name: "the meta event stops carrying it",
    file: ROUTE,
    from: "            provenance: hasProvenance(provenance) ? provenance : undefined,",
    to: "",
    expect: "the meta event carries it",
  },
  {
    // Dropping it makes the list shorter than the count above it.
    name: "a source with no id is dropped instead of listed",
    file: LINE,
    from: "            {s.id ? (",
    to: "            {s.id ?? true ? (",
    expect: "lists an unlinkable one rather than dropping it",
  },
  {
    name: "the URL opens a record that is not on the page",
    file: LIST,
    from: "    if (!records.some((r) => r.id === requestedRecordId)) return;",
    to: "",
    expect: "ignores an id that is not on the page",
  },
  {
    name: "the statement leaves the first screen",
    file: WS,
    from: '<p className="text-xs font-semibold text-foreground/80">{t("dataScope.title")}</p>',
    to: "",
    expect: "it is on the first screen",
  },
  {
    name: "Japanese loses the statement",
    file: JA,
    from: '"body": "あなたの記録、目標、アップロードしたファイルを参照します。あなたが追加していないものは一切参照しません。頼まない限り、何も変更しません。"',
    to: '"body": ""',
    expect: "ja: the data-scope statement is there",
  },
  {
    // A CHECK THAT FORBIDS A SHAPE ONLY GOES RED WHEN THE SHAPE IS THERE.
    // The first version of this mutation defanged the regex instead, and
    // a defanged regex over a clean file is still green — it proved
    // nothing, and said so by being MISSED. So the forbidden thing is
    // planted, which is the only way to learn the check can see it.
    //
    // Why it is forbidden: the scan is capped per module, so a total is a
    // number this module cannot measure. A field named like one gets
    // filled in eventually, and then the line under the answer is a
    // guess wearing a number's clothes.
    name: "a total-rows field appears for somebody to fill in",
    file: PROV,
    from: "  /** Rows actually placed in the prompt. Never a total. */\n  entryCount: number;",
    to: "  /** Rows actually placed in the prompt. Never a total. */\n  entryCount: number;\n  totalEntries: number;",
    expect: "exposes no total-rows field",
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

console.log("provenance mutations\n");
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
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const n = original.split(m.from).length - 1;
    if (n !== 1) {
      missed.push({ ...m, why: `the anchor appears ${n} times in ${m.file}` });
      console.log(`  AMBIG   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, original.replace(m.from, m.to));
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
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
console.log("Every clause of provenance.test.mjs is load-bearing.");
