#!/usr/bin/env node
/*
 * CAN plural-forms.test.mjs TELL A REAL PLURAL FROM A NUMBER GLUED TO A NOUN?
 *
 * The defect it guards is the cheapest kind to reintroduce: somebody adds a
 * string with `{count} rows` in it, translates it ten ways, and every one of
 * them reads "1 rows" the first time a user has exactly one. No test fails,
 * no error is logged, and the product looks careless in ten languages at
 * once. Half of the hundred and three strings this gate was written over got
 * there exactly that way; the other half were written as `{count} file(s)`,
 * which is the same defect with an apology attached.
 *
 * So every mutation below damages the REAL message files or the gate, and
 * the gate is run against them:
 *
 *   THE MESSAGES    a plural removed, an Arabic block cut down to English's
 *                   two forms, an ICU string one brace short, the `(s)`
 *                   workaround coming back.
 *   THE GATE        the clauses that would let each of those through — and
 *                   the two floors, because a scan that finds nothing
 *                   reports perfect health.
 *
 * AND RED IS NOT ENOUGH. A gate with sixteen checks goes red easily; what
 * matters is that it goes red ON THE CLAUSE THAT OWNS THE DEFECT, so each
 * mutant names the check it has to break and a run that reddens elsewhere is
 * recorded as a miss.
 *
 * Run: node scripts/tests/plural-forms.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/plural-forms.test.mjs";
const EN = "messages/en.json";
const EL = "messages/el.json";
const AR = "messages/ar.json";

const TARGETS = [GATE, EN, EL, AR];

const EN_PAGES = '"pages": "{count, plural, one {# page} other {# pages}}"';
const EL_PAGES = '"pages": "{count, plural, one {# σελίδα} other {# σελίδες}}"';
const AR_PAGES =
  '"pages": "{count, plural, zero {لا صفحات} one {صفحة واحدة} two {صفحتان} few {# صفحات} many {# صفحة} other {# صفحة}}"';

const MUTANTS = [
  // ---- the messages ---------------------------------------------------
  {
    // "1 pages". The plain version of the defect, in the language whose
    // reader would notice it least and report it least.
    name: "English loses the plural and reads 1 pages again",
    file: EN,
    from: EN_PAGES,
    to: '"pages": "{count} pages"',
    expect: "bare number",
  },
  {
    name: "Greek loses the plural and reads 1 σελίδες again",
    file: EL,
    from: EL_PAGES,
    to: '"pages": "{count} σελίδες"',
    expect: "bare number",
  },
  {
    // THE ONE THE OWNER NAMED. Arabic has six forms; two is what a
    // translator copying the English structure produces, and it makes every
    // count from 11 to 99 read as the plural of one.
    name: "Arabic is cut down to English's two forms",
    file: AR,
    from: AR_PAGES,
    to: '"pages": "{count, plural, one {صفحة واحدة} other {# صفحة}}"',
    expect: "categories its language reaches",
  },
  {
    name: "Arabic keeps six branches but loses the dual",
    file: AR,
    from: AR_PAGES,
    to: '"pages": "{count, plural, zero {لا صفحات} one {صفحة واحدة} few {# صفحات} many {# صفحة} other {# صفحة}}"',
    expect: "categories its language reaches",
  },
  {
    // A BRACE SHORT. It still contains the word `plural` and still looks
    // like ICU; only a render can tell.
    name: "an ICU string is one brace short",
    file: EN,
    from: EN_PAGES,
    to: '"pages": "{count, plural, one {# page} other {# pages}"',
    expect: "renders cleanly",
  },
  {
    // A MISSPELT CATEGORY IS A MISSING ONE. This mutant was written expecting
    // the renderer to catch it, and the coverage clause caught it first —
    // which is the right answer: `onee` means `one` is not declared.
    name: "a category name is misspelt, so its language loses that form",
    file: EN,
    from: EN_PAGES,
    to: '"pages": "{count, plural, onee {# page} other {# pages}}"',
    expect: "categories its language reaches",
  },
  {
    name: "the (s) workaround comes back",
    file: EN,
    from: EN_PAGES,
    to: '"pages": "{count} page(s)"',
    expect: "parenthesised suffix",
  },
  {
    name: "the Greek (-α) workaround comes back",
    file: EL,
    from: EL_PAGES,
    to: '"pages": "{count} σελίδα(-α)"',
    expect: "parenthesised suffix",
  },

  // ---- the gate's own clauses ----------------------------------------
  {
    // THE COVERAGE CLAUSE HAS ONE OWNER. Nothing else in the gate notices a
    // two-form Arabic block — a paired mutant written on the assumption that
    // the block-count floor would move stayed green, because cutting a block
    // down does not change how many blocks there are. What proves that
    // clause load-bearing is its two source mutants above; saying so is
    // better than a pairing invented to look thorough.
    //
    // The exemption clause, though, does have a direction that moves
    // something on a healthy tree: excusing NOTHING turns nineteen honest
    // bare strings into reported gaps.
    name: "the exemption list stops excusing the strings it names",
    file: GATE,
    from: "      if (exempt?.locales.includes(locale)) {",
    to: "      if (false) {\n        void exempt;",
    expect: "bare number",
  },
  {
    name: "the fake-plural pattern matches nothing AND (s) comes back",
    edits: [
      {
        file: GATE,
        from: "const FAKE_PLURAL =\n  /",
        to: "const FAKE_PLURAL =\n  /(?!)/; const UNUSED =\n  /",
      },
      { file: EN, from: EN_PAGES, to: '"pages": "{count} page(s)"' },
    ],
    expect: "would recognise one",
  },
  {
    name: "every locale is excused as single-category, so no gap is ever reported",
    edits: [
      {
        file: GATE,
        from: "      if (REACH[locale].size === 1) continue;",
        to: "      if (REACH[locale].size >= 1) continue;",
      },
      { file: EL, from: EL_PAGES, to: '"pages": "{count} σελίδες"' },
    ],
    // Skipping every locale means no exemption is ever consulted, and the
    // staleness clause is the net that notices — which is what it is for.
    expect: "still describes a bare string",
  },
  {
    // THE FLOORS. Each of the three scans is one character range away from
    // finding nothing, and "none of them is broken" is trivially true of an
    // empty list.
    name: "the block scan finds nothing, so nothing can be incomplete",
    file: GATE,
    from: "  return [...text.matchAll(/\\{(\\w+)\\s*,\\s*plural\\s*,/g)].map((m) => ({",
    to: "  return [...text.matchAll(/(?!)/g)].map((m) => ({",
    expect: "plural blocks were found",
  },
  {
    name: "the renderer renders nothing",
    file: GATE,
    from: "      if (blocks.length === 0) continue;",
    to: "      continue;\n      // eslint-disable-next-line no-unreachable",
    expect: "renderings were performed",
  },
  {
    // Intl answering "one category" for everything — a stripped ICU build —
    // turns the whole file green by giving it nothing to check.
    name: "Intl is stripped down to one category everywhere",
    file: GATE,
    from: "    const c = rules.select(n);",
    to: '    const c = "other";\n    void rules;',
    expect: "Intl really knows the hard languages",
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
      failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]),
    };
  }
}

console.log("plural-forms mutations\n");

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
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({
        ...m,
        why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}`,
      });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (
      [...byFile.entries()].every(
        ([file, text]) => text === originals.get(file),
      )
    ) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({
        ...m,
        why: "the gate stayed green — nothing here is load-bearing",
      });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`,
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
console.log("Every clause of the gate is load-bearing.");
