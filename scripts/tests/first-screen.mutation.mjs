#!/usr/bin/env node
/*
 * CAN first-screen.test.mjs SEE THE THREE EXAMPLES STOP WORKING?
 *
 * The failure this is written against is silent in every direction. A
 * renamed query parameter still navigates. A prop threaded to a
 * component that ignores it still renders. A second example of the same
 * capability still fills the row. A generic sentence still reads like a
 * sentence. None of those turn anything red on their own.
 *
 * DIFFERENT DIMENSIONS, ON PURPOSE. The sixth way a gate lies is that
 * every one of its mutations probes the same property — eleven mutants,
 * one question, and the gate looks thorough while being narrow. These
 * are grouped by the dimension each one attacks, and no dimension is
 * left with a single mutant:
 *
 *   A. the capabilities        (three, and three DIFFERENT ones)
 *   B. the runtime string      (link vs page, the invisible pair)
 *   C. arriving RUNS it        (the prop that lands and does nothing)
 *   D. concreteness            (the disease this replaces)
 *   E. the ten languages       (a locale left behind)
 *   F. the hierarchy           (the vaguest thing loudest again)
 *   G. the instruments         (the gate's own reach)
 *
 * Run: node scripts/tests/first-screen.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/first-screen.test.mjs";
const LIB = "src/lib/overview/first-screen-examples.ts";
const STRIP = "src/components/overview/first-screen-examples.tsx";
const GREETING = "src/components/overview/greeting-header.tsx";
const OVERVIEW = "src/app/dashboard/overview/page.tsx";
const CHAT_PAGE = "src/app/dashboard/chat/page.tsx";
const CHAT_WS = "src/components/chat/chat-workspace.tsx";
const AGENTS_WS = "src/components/agents/agents-workspace.tsx";
const EN = "messages/en.json";
const EL = "messages/el.json";
const TEMPLATES_ROUTE = "src/app/api/agents/templates/route.ts";
const TARGETS = [LIB, STRIP, GREETING, OVERVIEW, CHAT_PAGE, CHAT_WS, AGENTS_WS, EN, EL, TEMPLATES_ROUTE];

const MUTANTS = [
  // ---- A. THE CAPABILITIES ------------------------------------------
  {
    dimension: "A. capabilities",
    name: "two examples teach the same capability",
    file: LIB,
    from: '    id: "repeat",',
    to: '    id: "build",',
    expect: "each names a different capability",
  },
  {
    dimension: "A. capabilities",
    name: "the third example is dropped and two are left",
    file: LIB,
    from: "\n];\n\n/** The URL one click follows. */",
    to: "\n].slice(0, 2);\n\n/** The URL one click follows. */",
    expect: "there are exactly three",
  },
  {
    dimension: "A. capabilities",
    name: "two examples land on the same screen",
    file: LIB,
    from: '    path: "/dashboard/agents",',
    to: '    path: "/dashboard/chat",',
    expect: "each lands somewhere different",
  },

  // ---- B. THE RUNTIME STRING ----------------------------------------
  {
    dimension: "B. runtime string",
    name: "the link's parameter is renamed and the page is not",
    file: LIB,
    from: '    param: "ask",',
    to: '    param: "question",',
    expect: "understand: src/app/dashboard/chat/page.tsx reads searchParams.question",
  },
  {
    dimension: "B. runtime string",
    name: "the page stops reading the parameter",
    file: CHAT_PAGE,
    from: "        initialAsk={readExampleParam(searchParams.ask)}",
    to: "        initialAsk={undefined}",
    expect: "understand: src/app/dashboard/chat/page.tsx reads searchParams.ask",
  },
  {
    dimension: "B. runtime string",
    name: "the page trusts the URL instead of clamping it",
    file: CHAT_PAGE,
    from: "readExampleParam(searchParams.ask)",
    to: "String(searchParams.ask ?? '')",
    expect: "understand: the page clamps it through readExampleParam",
  },
  {
    dimension: "B. runtime string",
    name: "the clamp stops clamping",
    file: LIB,
    from: "  return trimmed.slice(0, MAX_EXAMPLE_CHARS);",
    to: "  return trimmed;",
    expect: "readExampleParam clamps at",
  },
  {
    dimension: "B. runtime string",
    name: "a blank parameter is treated as a request",
    file: LIB,
    from: "  if (!trimmed) return undefined;",
    to: "  if (false) return undefined;",
    expect: "readExampleParam refuses an empty value",
  },

  // ---- C. ARRIVING RUNS IT ------------------------------------------
  {
    dimension: "C. arriving runs it",
    name: "the chat accepts the question and never sends it",
    file: CHAT_WS,
    from: "  }, [initialAsk]);",
    to: "  }, []);",
    expect: "understand: ...and an effect depends on it, so arriving RUNS it",
  },
  {
    dimension: "C. arriving runs it",
    name: "the agents workspace stops accepting the request",
    file: AGENTS_WS,
    from: "  initialAgent?: string;",
    to: "  initialAgentXX?: string;",
    expect: "repeat: agents-workspace.tsx accepts initialAgent",
  },
  {
    dimension: "C. arriving runs it",
    name: "the link goes back to a bare path carrying nothing",
    file: LIB,
    from: "  return `${example.path}?${example.param}=${encodeURIComponent(text.slice(0, MAX_EXAMPLE_CHARS))}`;",
    to: "  return example.path;",
    expect: "the link carries ?brief=",
  },

  // ---- I. THE PRICE IS VISIBLE --------------------------------------
  {
    dimension: "I. price is visible",
    name: "a charging example claims to be free",
    file: LIB,
    from: '    cost: "charged",',
    to: '    cost: "free",',
    expect: 'build: "free" agrees with what generate actually does',
  },
  {
    dimension: "I. price is visible",
    name: "a free route grows a charge and the card is not updated",
    file: TEMPLATES_ROUTE,
    from: "export const dynamic = \"force-dynamic\";",
    to: "export const dynamic = \"force-dynamic\";\nimport { reserveCredits } from \"@/lib/billing/credits\";",
    expect: 'repeat: "free" agrees with what templates actually does',
  },
  {
    dimension: "I. price is visible",
    name: "the card stops showing what it costs",
    file: STRIP,
    from: "                    {t(`cost.${example.cost}`)}",
    to: "                    {null}",
    expect: "the strip renders the cost of every card",
  },
  {
    dimension: "I. price is visible",
    name: "Greek loses the wording for a cost",
    file: EL,
    from: '"charged": "Χρεώνει credits"',
    to: '"chargedXX": "Χρεώνει credits"',
    expect: 'build: the "charged" wording exists in all ten locales',
  },

  // ---- H. NOT TWICE -------------------------------------------------
  {
    dimension: "H. not twice",
    name: "the chat leaves the question in the URL, so a reload re-sends it",
    file: CHAT_WS,
    from: '    forgetExampleParam("ask");',
    to: "",
    expect: "understand: ...and forgets the parameter",
  },
  {
    dimension: "H. not twice",
    name: "forgetting keeps the rest of the address bar out",
    file: LIB,
    from: "`${url.pathname}${url.search}${url.hash}`",
    to: "url.pathname",
    expect: "keeps everything else in the address bar",
  },
  {
    dimension: "H. not twice",
    name: "forgetting deletes nothing",
    file: LIB,
    from: "    url.searchParams.delete(param);",
    to: "    void param;",
    expect: "forgetExampleParam removes the parameter",
  },

  // ---- D. CONCRETENESS ----------------------------------------------
  {
    dimension: "D. concreteness",
    name: "an example goes back to being about anything",
    file: EN,
    from: '"example": "Build a website for my shop"',
    to: '"example": "Build something"',
    expect: "names something specific",
  },
  {
    dimension: "D. concreteness",
    name: "two examples say the same sentence",
    file: EN,
    from: '"example": "Every Monday, a summary of my sales"',
    to: '"example": "Build a website for my shop"',
    expect: "no two examples say the same thing",
  },
  {
    dimension: "D. concreteness",
    name: "two capabilities are given the same verb",
    file: EN,
    from: '"verb": "Understand"',
    to: '"verb": "Build"',
    expect: "three distinct verbs",
  },

  // ---- E. THE TEN LANGUAGES -----------------------------------------
  {
    dimension: "E. ten languages",
    name: "Greek loses one of the three examples",
    file: EL,
    from: '"example": "Κάθε Δευτέρα, σύνοψη των πωλήσεών μου"',
    to: '"exampleXX": "Κάθε Δευτέρα, σύνοψη των πωλήσεών μου"',
    expect: "repeat.exampleKey resolves in all ten locales",
  },
  {
    dimension: "E. ten languages",
    name: "a key points at a name no locale has",
    file: LIB,
    from: '    exampleKey: "dashboard.firstScreen.build.example",',
    to: '    exampleKey: "dashboard.firstScreen.build.blurb",',
    expect: "build.exampleKey resolves in all ten locales",
  },

  // ---- F. THE HIERARCHY ---------------------------------------------
  {
    dimension: "F. hierarchy",
    name: "the vague question comes back as the headline",
    file: GREETING,
    from: '          {tPromise("oneSentence")}\n        </h1>',
    to: '          {t("heroQuestion")}\n        </h1>',
    expect: "the one sentence IS the headline",
  },
  {
    dimension: "F. hierarchy",
    name: "the question is left in the locales to be picked up again",
    file: EN,
    from: '      "quickStartBlurb"',
    to: '      "heroQuestion": "What do you want to build today?",\n      "quickStartBlurb"',
    expect: "gone from every locale",
  },
  {
    dimension: "F. hierarchy",
    name: "the greeting climbs back above the headline",
    file: GREETING,
    from: '      <div className="flex flex-wrap items-center justify-center gap-3">',
    to: '      <p className="mt-2 text-sm text-muted">{greeting.text}</p>\n      <div className="flex flex-wrap items-center justify-center gap-3">',
    expect: "is still below the headline",
  },
  {
    dimension: "F. hierarchy",
    name: "the examples move above the input",
    file: OVERVIEW,
    from: "          <CreateChat showHeading={false} />",
    to: "          <FirstScreenExamples />\n          <CreateChat showHeading={false} />",
    expect: "below the input, not above it",
  },
  {
    dimension: "F. hierarchy",
    name: "the strip is taken off the first screen",
    file: OVERVIEW,
    from: "          <FirstScreenExamples />",
    to: "          {null}",
    expect: "the overview renders the examples",
  },

  // ---- G. THE INSTRUMENTS -------------------------------------------
  {
    dimension: "G. instruments",
    name: "the strip stops reading the shared list and writes its own",
    file: STRIP,
    from: "        {FIRST_SCREEN_EXAMPLES.map((example) => {",
    to: "        {[].map((example) => {",
    expect: "the strip is driven by the shared list",
  },
  {
    dimension: "G. instruments",
    name: "the strip hardcodes an example instead of translating it",
    file: STRIP,
    from: "          const sentence = t(`${example.id}.example`);",
    to: '          const sentence = "Build a website for my shop";',
    expect: "and writes no example of its own",
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
    };
  }
}

console.log("first-screen mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
const byDimension = new Map();
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const seen = byDimension.get(m.dimension) ?? 0;
    byDimension.set(m.dimension, seen + 1);
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    const result = runGate();
    restoreAll();
    // NAMED, not merely red. "The gate went red" cannot tell a check
    // that saw this mutation from an unrelated one that happened to
    // break — which is how a suite scores full marks while the clause it
    // claims to hold is dead.
    const named = result.failed.some((f) => f.includes(m.expect));
    if (named) {
      caught++;
      console.log(`  CAUGHT  ${m.name}\n          -> ${result.failed.find((f) => f.includes(m.expect))}`);
    } else {
      missed.push({
        ...m,
        why: result.green
          ? "the gate stayed green"
          : `the gate went red, but not on "${m.expect}" — on: ${result.failed.slice(0, 3).join(" | ")}`,
      });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  restoreAll();
}

console.log(`\nbaseline: the gate is ${runGate().green ? "green" : "RED"} again on the restored tree`);

// EVERY DIMENSION CARRIES MORE THAN ONE. A dimension with a single
// mutant is a dimension one edit can quietly retire.
console.log("\ndimensions probed:");
const thin = [];
for (const [dimension, count] of [...byDimension].sort()) {
  console.log(`  ${count} x ${dimension}`);
  if (count < 2) thin.push(dimension);
}
if (thin.length > 0) {
  console.log(`\nTHIN DIMENSIONS (one mutant each): ${thin.join(", ")}`);
}

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
}
if (missed.length > 0 || thin.length > 0) process.exit(1);
console.log(
  `Every clause of the gate is load-bearing, across ${byDimension.size} dimensions.`,
);
