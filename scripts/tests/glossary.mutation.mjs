#!/usr/bin/env node
/*
 * CAN glossary.test.mjs SEE A SECOND NAME COME BACK?
 *
 * The rule it holds is a table in a markdown file, which is an unusual
 * place for enforcement to live and an easy place for it to quietly stop
 * working: delete a marker and every loop below runs zero times and passes.
 * So two of these mutations are aimed at the gate, not the product.
 *
 *   0. the old name of a renamed concept comes back (three ways)
 *   1. English uses the forbidden noun for the counted unit again
 *   2. ...Japanese does (the CJK path the first matcher could not see)
 *   3. ...Arabic does
 *   4. a banned word returns
 *   5. an exclamation mark returns
 *   6. ...a full-width one, in Chinese
 *   7. a label speaks as "my" again
 *   8. the minimising "just" returns
 *   9. GATE: the FORBIDDEN table's marker is gone
 *  10. GATE: the matcher goes back to requiring spaces
 *  11. GATE: the user-voice allowlist keeps an entry that is no longer true
 *
 * Run: node scripts/tests/glossary.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/glossary.test.mjs";
const DOC = "docs/glossary.md";
const EN = "messages/en.json";
const ES = "messages/es.json";
const JA = "messages/ja.json";
const AR = "messages/ar.json";
const ZH = "messages/zh.json";
const TARGETS = [GATE, DOC, EN, ES, JA, AR, ZH];

const MUTANTS = [
  {
    name: "English counts its unit in the forbidden noun again",
    file: EN,
    from: '"basedOn": "from {count, plural, one {# of your entries} other {# of your entries}}"',
    to: '"basedOn": "from {count, plural, one {# of your records} other {# of your records}}"',
    expect: "en: no counted noun uses a forbidden synonym",
  },
  {
    // The case the first matcher was blind to: no spaces, so a
    // space-requiring regex reported Japanese as clean.
    name: "Japanese goes back to a third word for the same thing",
    file: JA,
    from: "全モジュールで合計50件の記録を残そう。",
    to: "全モジュールで合計50件のレコードを残そう。",
    expect: "ja: no counted noun uses a forbidden synonym",
  },
  {
    name: "Arabic goes back to a second word for the same thing",
    file: AR,
    from: "يمتلئ بعد {count} إدخالات",
    to: "يمتلئ بعد {count} مدخلات",
    expect: "ar: no counted noun uses a forbidden synonym",
  },
  {
    name: "a payment is described as a reward again",
    file: EN,
    from: "both include team collaboration",
    to: "both unlock team collaboration",
    expect: '"unlock" appears nowhere',
  },
  {
    name: "the product gets excited",
    file: EN,
    from: '"setupSuccessTitle": "Your team is ready"',
    to: '"setupSuccessTitle": "Your team is ready!"',
    expect: "en: no exclamation marks in system copy",
  },
  {
    // Half-width and full-width are different codepoints; a check that
    // only knows "!" passes a Chinese page full of "！".
    name: "...in Chinese, where the mark is full-width",
    file: ZH,
    from: '"setupSuccessTitle": "你的团队已准备就绪"',
    to: '"setupSuccessTitle": "你的团队已准备就绪！"',
    expect: "zh: no exclamation marks in system copy",
  },
  {
    name: "a label speaks as the product's own possessive again",
    file: EN,
    from: '"askTitle": "Ask your documents"',
    to: '"askTitle": "Ask my documents"',
    expect: "the glossary declares as the user's own voice",
  },
  {
    name: "the minimising \"just\" returns",
    file: EN,
    from: "The AI already has this entry's data. Ask anything about it.",
    to: "The AI already has this entry's data. Just ask about it.",
    expect: 'no minimising "just X" in English',
  },
  {
    // THE PRE-RENAME NAME, put back. A counted-form rule can never see
    // this: "Delete the mission" carries no number.
    name: "the old name comes back in English",
    file: EN,
    from: '"deleteConfirmMission": "Delete the plan',
    to: '"deleteConfirmMission": "Delete the mission',
    expect: "en: the old name is gone",
  },
  {
    // Word boundaries. Spanish "comisión" contains "misión", so a
    // substring check would fail the build on six correct affiliate
    // strings — and a check that cries wolf gets switched off.
    name: "a Spanish word merely CONTAINING the old name is flagged",
    file: ES,
    from: '"suspended": "Esta cuenta de afiliado está suspendida',
    to: '"suspended": "Esta cuenta de comisión está suspendida',
    expect: null,
    expectGreen: true,
  },
  {
    name: "Japanese gets the old name back",
    file: JA,
    from: '"typeMission": "プラン"',
    to: '"typeMission": "ミッション"',
    expect: "ja: the old name is gone",
  },
  {
    // The uncovered languages are Greek, Chinese and Arabic. Dropping the
    // explanation makes the gate silently check seven of ten.
    name: "GATE: a language leaves the table with no explanation",
    file: DOC,
    from: "- **Greek** — `Αποστολή` is the ordinary word for *sending*",
    to: "- **Hellenic** — `Αποστολή` is the ordinary word for *sending*",
    expect: "absent from the table and unexplained",
  },
  {
    // THE RULES LIVE IN A MARKDOWN FILE. Lose the marker and every loop
    // below runs zero times and reports a clean product.
    name: "GATE: the FORBIDDEN table's marker is gone",
    file: DOC,
    from: "<!-- FORBIDDEN:START -->",
    to: "<!-- FORBIDDEN-DISABLED -->",
    expect: "the FORBIDDEN table is present and populated",
  },
  {
    name: "GATE: the matcher goes back to requiring spaces",
    file: GATE,
    from: '  lang === "zh" || lang === "ja"\n    ? new RegExp',
    to: "  false\n    ? new RegExp",
    expect: "the matcher finds a planted violation in every language",
  },
  {
    name: "GATE: the allowlist keeps an entry that is no longer true",
    file: DOC,
    from: "| aiExamples.research.e1 | an example prompt the reader would type |",
    to: "| aiExamples.research.eGone | an example prompt the reader would type |",
    expect: "no entries for strings that no longer speak first person",
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

console.log("glossary mutations\n");
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
    // A NEGATIVE CONTROL. Some mutations must leave the gate GREEN: they
    // plant something that LOOKS like a violation and is not, and a gate
    // that goes red on them is a gate that will be switched off.
    if (m.expectGreen) {
      if (result.green) {
        caught++;
        console.log(`  CAUGHT  ${m.name} (stayed green, as it must)`);
      } else {
        missed.push({ ...m, why: `false positive: went red on "${result.failed.slice(0, 2).join('", "')}"` });
        console.log(`  FALSE+  ${m.name}`);
      }
      continue;
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
console.log("Every clause of glossary.test.mjs is load-bearing.");
