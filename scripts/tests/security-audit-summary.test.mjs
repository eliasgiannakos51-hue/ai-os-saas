// The security audit's summary table, re-derived from the rows it summarises.
//
// WHY THIS EXISTS. docs/SECURITY-AUDIT.md opens with four counts —
// found, fixed, open, per severity — and until now they were typed in by
// hand and dated by hand. That is the shape CLAUDE.md calls "a number
// PRINTED and never judged": the sentence stays grammatical and the
// numbers stay parseable long after a row below them has changed state,
// and no reader can tell. The same document has already carried two
// different vintages of the same four rows (2026-10-07 and 2026-10-09),
// and the only reason the drift was caught was that somebody re-counted.
//
// THE RULE THE DOCUMENT STATES, ENFORCED AGAINST THE DOCUMENT. Its own
// prose says how the numbers are made: every `| ΑΣ-` row that carries a
// severity is a finding, a state beginning «διορθώθηκε» is fixed, and
// «μισό» counts as open. That is the derivation below, and it was
// checked against the table as it stood on 2026-10-09 before being
// trusted — it reproduced 4/4/0, 17/14/3, 15/1/14 and 11/2/9 exactly.
//
// THIS IS NOT A SPELL-CHECK ON A SENTENCE. Delete a «διορθώθηκε» from
// any row below, or add a finding, and this goes red on the row that
// names the severity — which is what makes the summary worth reading.
//
// Run: node scripts/tests/security-audit-summary.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const SEVERITIES = ["κρίσιμο", "σοβαρό", "μέτριο", "μικρό"];
const FIXED_PREFIX = "διορθώθηκε";
const doc = readFileSync("docs/SECURITY-AUDIT.md", "utf8");

/** Every `| ΑΣ-… |` row, split into cells. */
function auditRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("| ΑΣ-"))
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
    .filter((cells) => cells.length >= 4);
}

/** found/fixed per severity, by the rule the document's own prose states. */
function derive(rows) {
  const tally = new Map(SEVERITIES.map((s) => [s, { found: 0, fixed: 0 }]));
  for (const cells of rows) {
    const [, , state, severity] = cells;
    const row = tally.get(severity);
    // A row whose severity cell is «—» is a point that was checked and
    // found sound, not a finding. Skipping it here is why «εντάξει»
    // rows never inflate the "found" column.
    if (!row) continue;
    row.found++;
    if (state.startsWith(FIXED_PREFIX)) row.fixed++;
  }
  return tally;
}

// THE SCRAPER IS PINNED BEFORE IT IS BELIEVED. scan-unjudged-numbers'
// lesson: a matchAll that stops matching produces an empty tally and a
// table of zeroes that compares equal to nothing. These three fixtures
// are the rungs — a finding, a fixed finding, and a checked-and-sound
// point — and a scraper that returns nothing fails all three.
{
  const FIXTURE = [
    "| ΑΣ-9.1 | κάτι | ανοιχτό | σοβαρό | — |",
    "| ΑΣ-9.2 | κάτι άλλο | διορθώθηκε (2026-01-01) | σοβαρό | test |",
    "| ΑΣ-9.3 | ένα τρίτο | μισό | μέτριο | — |",
    "| ΑΣ-9.4 | ελεγμένο | εντάξει | — | — |",
  ].join("\n");
  const t = derive(auditRows(FIXTURE));
  check("the scraper counts a finding", t.get("σοβαρό").found === 2, JSON.stringify(t.get("σοβαρό")));
  check("…and only the one that says διορθώθηκε as fixed", t.get("σοβαρό").fixed === 1);
  check("…counts «μισό» as open", t.get("μέτριο").found === 1 && t.get("μέτριο").fixed === 0);
  check("…and an «εντάξει» point with no severity is not a finding", t.get("μικρό").found === 0);
}

const rows = auditRows(doc);
check(`the audit's rows were found (${rows.length})`, rows.length >= 40, "a scraper that found nothing would make every count below zero and the table would have to be zeroes too");

const derived = derive(rows);

// The summary table as the document prints it.
const printed = new Map();
for (const m of doc.matchAll(/^\|\s*(κρίσιμο|σοβαρό|μέτριο|μικρό)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm)) {
  printed.set(m[1], { found: Number(m[2]), fixed: Number(m[3]), open: Number(m[4]) });
}
check(`the summary table was found (${printed.size} of ${SEVERITIES.length} rows)`, printed.size === SEVERITIES.length, [...printed.keys()].join(", "));

for (const severity of SEVERITIES) {
  const want = derived.get(severity);
  const got = printed.get(severity) ?? { found: -1, fixed: -1, open: -1 };
  check(
    `«${severity}»: the summary says ${got.found}/${got.fixed}/${got.open}, the rows say ${want.found}/${want.fixed}/${want.found - want.fixed}`,
    got.found === want.found && got.fixed === want.fixed && got.open === want.found - want.fixed,
    "re-derive it: every `| ΑΣ-` row with a severity is a finding, «διορθώθηκε» at the start of the state is fixed, «μισό» is open"
  );
}

// The heading carries the date the summary was last re-derived, so a
// reader who does not run the gates still knows how old it is.
const heading = doc.match(/^## Σύνοψη \((\d{4}-\d{2}-\d{2})\)$/m);
check("the summary heading carries its date", heading !== null, "expected a line of the form `## Σύνοψη (YYYY-MM-DD)`");

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
