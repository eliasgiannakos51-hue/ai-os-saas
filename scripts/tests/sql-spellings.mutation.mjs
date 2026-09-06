#!/usr/bin/env node
/*
 * CAN sql-spellings.test.mjs SEE A TOOL GO HALF-BLIND?
 *
 * Every mutation below is a defect this repository actually had on
 * 2026-09-06, put back one at a time. None of them makes a tool report an
 * error: each makes it report LESS, which reads exactly like a schema
 * with nothing wrong.
 *
 * The last two mutations are aimed at this gate rather than at the tools,
 * because a completeness check has two ways to be useless — exempting
 * everything, and measuring itself — and the first version of this file
 * did both: it probed its own four reference patterns (eleven false
 * findings) and its %1$s exemption matched nothing, because a regex
 * literal escapes the dollar and the test looked for the unescaped form.
 *
 * Run: node scripts/tests/sql-spellings.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/sql-spellings.test.mjs";
const PENDING = "scripts/db/pending-migrations.mjs";
const INVENTORY = "scripts/db-inventory.mjs";
const CANARIES = "scripts/tests/schema-canaries.test.mjs";
const MIGRATIONS = "scripts/tests/db-migrations.test.mjs";

const BLIND = "sees fewer objects than the corpus holds";
const VACUOUS = "every exemption still applies to something";

const MUTANTS = [
  {
    // THE DEPLOY TOOL, BLIND TO 70 OF 206 POLICIES. `npm run db:pending`
    // is what CLAUDE.md says to run before a deploy rather than after a
    // page breaks.
    name: "db:pending requires the quotes around a policy name again",
    file: PENDING,
    from: 'for (const m of text.matchAll(/create\\s+policy\\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\\s+on\\s+',
    to: 'for (const m of text.matchAll(/create\\s+policy\\s+(?:"([^"]+)"|())\\s+on\\s+',
    expect: BLIND,
  },
  {
    // AND ON THE DROP SIDE, WHERE THE BARE FORM IS THE MAJORITY — 204 of
    // 351. A drop nobody sees leaves a deliberately removed policy
    // expected for ever: a PENDING that is not pending.
    name: "...and on the drop side, where the invisible form is the common one",
    file: PENDING,
    from: 'for (const m of text.matchAll(/drop\\s+policy\\s+(?:if\\s+exists\\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\\s+on\\s+',
    to: 'for (const m of text.matchAll(/drop\\s+policy\\s+(?:if\\s+exists\\s+)?(?:"([^"]+)"|())\\s+on\\s+',
    expect: BLIND,
  },
  {
    // ONE ALTER, MANY COLUMNS, ONE SEEN. The migration is reported
    // APPLIED as soon as its first column exists — which is CLAUDE.md's
    // opening story with a different column name.
    // CAUGHT BY SECTION 2b, NOT 2. Section 2 reads patterns one at a
    // time, and read alone the inner `add column …` regex matches all
    // 108 columns and looks perfect — it is the OUTER statement regex
    // that starves it. This mutation survived the first version of this
    // suite and is why section 2b calls objectsOf() instead.
    name: "db:pending takes only the first add-column of a multi-clause ALTER",
    file: PENDING,
    from: '  for (const stmt of text.matchAll(/alter\\s+table\\s+(?:only\\s+)?(?:if\\s+exists\\s+)?(?:public\\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)([\\s\\S]*?);/gi)) {\n    const table = ident(stmt[1]);\n    for (const c of stmt[2].matchAll(/add\\s+column',
    to: '  for (const stmt of text.matchAll(/alter\\s+table\\s+(?:only\\s+)?(?:if\\s+exists\\s+)?(?:public\\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)([\\s\\S]*?)(?:,|;)/gi)) {\n    const table = ident(stmt[1]);\n    for (const c of stmt[2].matchAll(/add\\s+column',
    expect: "derive every columns in the corpus",
  },
  {
    // THE CANARY LIST, which exists to notice an object going missing,
    // silently omitting the second and third column of any multi-column
    // migration.
    // CAUGHT BY SECTION 2c. schema-canaries exports nothing, so its shape
    // is what can be checked — and the flat shape is decidably wrong.
    name: "the canary list loses every column after the first",
    file: CANARIES,
    from: '  for (const stmt of sql.matchAll(/alter\\s+table\\s+(?:only\\s+)?(?:if\\s+exists\\s+)?(?:public\\.)?"?([a-z0-9_]+)"?([\\s\\S]*?);/gi))',
    to: '  for (const stmt of sql.matchAll(/alter\\s+table\\s+(?:only\\s+)?(?:if\\s+exists\\s+)?(?:public\\.)?"?([a-z0-9_]+)"?([\\s\\S]*?)"?([a-z0-9_]+)"?\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?"?([a-z0-9_]+)"?/gi))',
    expect: "reaches from ALTER TABLE to a column name in one go",
  },
  {
    name: "db-migrations' column map loses every column after the first",
    file: MIGRATIONS,
    from: '    /alter table (?:only )?(?:if exists )?(?:public\\.)?"?([a-z_][a-z0-9_]*)"?([\\s\\S]*?);/gi;',
    to: '    /alter table (?:only )?(?:if exists )?(?:public\\.)?"?([a-z_][a-z0-9_]*)"?([\\s\\S]*?)\\s+add column(?: if not exists)?\\s+"?([a-z_][a-z0-9_]*)"?/gi;',
    expect: "reaches from ALTER TABLE to a column name in one go",
  },
  {
    // THE ORIGINAL, in the file where it was found first.
    name: "db-inventory requires the quotes around a policy name again",
    file: INVENTORY,
    from: '      /create\\s+policy\\s+(?:"([^"]+)"|([a-z0-9_]+))\\s+on\\s+(?:public\\.)?"?([a-z0-9_]+)"?/gi',
    to: '      /create\\s+policy\\s+(?:"([^"]+)"|())\\s+on\\s+(?:public\\.)?"?([a-z0-9_]+)"?/gi',
    expect: BLIND,
  },
  {
    // AND THE GATE ITSELF. An exemption that swallows every pattern is a
    // green check over an empty set.
    name: "the gate exempts every pattern as 'specific'",
    file: GATE,
    from: "const namesSomethingSpecific = (body) =>\n  [...body.matchAll(/[a-z][a-z0-9_]{2,}/gi)].some((m) => !KEYWORDS.has(m[0].toLowerCase()));",
    to: "const namesSomethingSpecific = () => true;",
    expect: "and every exemption still applies to something",
  },
  {
    // The %1$s exemption looking for a form that never occurs — the exact
    // slip this file shipped with for one run.
    name: "an exemption matches nothing, so it hides whatever it was for",
    file: GATE,
    from: "    test: (body) => /%1\\\\?\\$/.test(body),",
    to: '    test: (body) => body.includes("%1$"),',
    expect: VACUOUS,
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("sql-spellings mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
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
console.log("A tool that quietly sees half its SQL is red, and so is a gate that exempts everything.");
