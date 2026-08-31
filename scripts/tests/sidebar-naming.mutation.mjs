#!/usr/bin/env node
/*
 * CAN sidebar-naming.test.mjs SEE ONE PAGE WITH TWO NAMES?
 *
 * Scope: section 4c-bis, the one added when /dashboard/coding and
 * /dashboard/data-analysis were found filed in the nav as "Coding notes"
 * and "Analysis notes" — in all ten languages — above pages whose own
 * headings read "AI Coding" and "Data Analysis". Both had stopped being
 * trackers in V4 and become real tools; the headings were renamed and the
 * nav was not, and because both pages take their browser tab from the
 * sidebar key, the tab said "notes" as well.
 *
 * The section derives its list from the pages rather than holding one, so
 * there are two ways it can be wrong and both are silent: the derivation
 * finding nothing, and the comparison not being read. Both are mutated
 * here, alongside the drift itself in two different scripts.
 *
 * The other 130-odd checks in that gate predate this file and are not
 * covered; saying so is better than implying a suite that reads the whole
 * gate.
 *
 * Run: node scripts/tests/sidebar-naming.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/sidebar-naming.test.mjs";
const EN = "messages/en.json";
const EL = "messages/el.json";
const JA = "messages/ja.json";
const TARGETS = [GATE, EN, EL, JA];

const MUTANTS = [
  {
    // THE BUG ITSELF, put back exactly as it stood.
    name: "the nav files a real tool under a note-taking name again",
    file: EN,
    from: '"coding": "AI Coding",\n      "dataAnalysis": "Data Analysis",',
    to: '"coding": "Coding notes",\n      "dataAnalysis": "Analysis notes",',
    expect: "en: the nav and the heading agree",
  },
  {
    // A DRIFT IN ONE LANGUAGE ONLY, which is how the four in es/fr/it/pt
    // survived: English agreed with itself and nobody read the rest.
    name: "one language's nav name drifts from its heading",
    file: EL,
    from: '"tradingWorkflow": "Ροή Εργασίας Trading",',
    to: '"tradingWorkflow": "Ροή Trading",',
    expect: "el: the nav and the heading agree",
  },
  {
    name: "the derivation stops recognising a page's nav key",
    file: GATE,
    from: 'const navKey = src.match(/pageTitle\\("(sidebar\\.items\\.[A-Za-z]+)"\\)/);',
    to: 'const navKey = src.match(/pageTitleXX\\("(sidebar\\.items\\.[A-Za-z]+)"\\)/);',
    expect: "the scan found the pages that name themselves twice",
  },
  {
    name: "the derivation stops recognising a page's own heading",
    file: GATE,
    from: 'const rendersOwnTitle = /<PageHeader[\\s\\S]{0,220}?title=\\{t\\("title"\\)\\}/.test(src);',
    to: 'const rendersOwnTitle = /<PageHeaderXX[\\s\\S]{0,220}?title=\\{t\\("title"\\)\\}/.test(src);',
    expect: "the scan found the pages that name themselves twice",
  },
  {
    // SECTION 5b. A heading that drifts in ONE language, on a row section
    // 5's six-item English list never looks at. This is the shape the
    // whole section exists for: English agrees with itself, and the
    // Japanese reader gets two names.
    name: "a page heading drifts from its nav row in Japanese only",
    file: JA,
    from: '"deepResearch": {\n      "title": "ディープリサーチ"',
    to: '"deepResearch": {\n      "title": "詳細リサーチ"',
    expect: "no row disagrees with its page in any language",
  },
  {
    // The derivation, not the data. If it stops recognising the shape
    // "the page renders the config's own key", those rows silently leave
    // the comparison and the gate reports a smaller, cleaner world.
    // The twelve module rows have no page file; the [module] catch-all
    // renders their heading from the same key the sidebar uses. If that
    // stops being recognised they leave the count silently.
    name: "5b stops recognising the [module] catch-all",
    file: GATE,
    from: 'const DYNAMIC_USES_CONFIG_KEY = /title=\\{t\\(moduleConfig\\.titleKey\\)\\}/.test(dynamicSrc);',
    to: 'const DYNAMIC_USES_CONFIG_KEY = /title=\\{t\\(moduleConfigXX\\.titleKey\\)\\}/.test(dynamicSrc);',
    expect: "rows whose page renders the sidebar's own key",
  },
  {
    // ...and if it stops finding page headings at all, every row becomes
    // "no heading to compare" and the section asserts nothing.
    name: "5b stops finding page headings",
    file: GATE,
    from: 'const ph = src.match(/<PageHeader[\\s\\S]{0,400}?title=\\{(\\w+)\\("([\\w.]+)"\\)\\}/);',
    to: 'const ph = src.match(/<PageHeaderNope[\\s\\S]{0,400}?title=\\{(\\w+)\\("([\\w.]+)"\\)\\}/);',
    expect: "rows compared string-by-string in all 10 locales",
  },
  {
    // The comparison itself. Inverted rather than defanged: a defanged
    // clause leaves a healthy tree green and proves nothing.
    name: "the comparison is read backwards",
    file: GATE,
    from: "      return nav === heading",
    to: "      return nav !== heading",
    expect: "en: the nav and the heading agree",
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

console.log("sidebar-naming (section 4c-bis) mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(
    `baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`,
  );
  if (!base.green) {
    console.log(
      `\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`,
    );
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
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`,
      );
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of section 4c-bis is load-bearing.");
