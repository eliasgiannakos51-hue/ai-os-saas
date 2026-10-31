// The second security report's summary table, re-derived from the rows
// it summarises — docs/QUEUE.md (SA2) and docs/SECURITY-REPORT.md itself
// name this file as the next step once it existed.
//
// WHY THIS EXISTS. docs/SECURITY-REPORT.md opens with a five-row
// severity count — found, fixed, open, κρίσιμο through πληροφοριακό —
// and it was typed in by hand once, got it wrong once (23 where the
// rows said 18+4, 33 where the rows said 32), and was corrected by hand
// a second time. CLAUDE.md names that exact shape: "a number PRINTED
// and never judged" stays grammatical long after a row below it has
// changed. This is the same mechanism scripts/tests/security-audit-summary.test.mjs
// already runs for the first file (docs/SECURITY-AUDIT.md), built
// separately because that file's own comment says duplicating a scraper
// across two gates is how they drift apart, not how they stay honest.
//
// THE RULE THE DOCUMENT STATES, ENFORCED AGAINST THE DOCUMENT. Every
// `| ΑΣ2-` row is a finding; a Κατάσταση cell starting «διορθώθηκε» is
// fixed, everything else (including «μερικώς» — the gap shrank, it did
// not close) is open. A Βαρύτητα cell can carry qualifying prose after
// the severity word (ΑΣ2-1.2: "σοβαρό (αναβαθμίστηκε από «μέτριο» ...)";
// ΑΣ2-9.1: "μέτριο ως σπασμένος έλεγχος (...)· μικρό ως εκμεταλλεύσιμο
// σήμερα (...)") — only the FIRST word of that cell counts, matching how
// the file itself was hand-tallied on 2026-10-31.
//
// Run: node scripts/tests/security-report-summary.test.mjs
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

const SEVERITIES = ["κρίσιμο", "σοβαρό", "μέτριο", "μικρό", "πληροφοριακό"];
const FIXED_PREFIX = "διορθώθηκε";
const doc = readFileSync("docs/SECURITY-REPORT.md", "utf8");

/** Every `| ΑΣ2-… |` row, split into cells. */
function reportRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("| ΑΣ2-"))
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
    .filter((cells) => cells.length >= 4);
}

/** The severity word a Βαρύτητα cell leads with, stripping any qualifying prose. */
function severityWord(cell) {
  return cell.split(/[\s(]/)[0];
}

/** found/fixed per severity, by the rule the document's own prose states. */
function derive(rows) {
  const tally = new Map(SEVERITIES.map((s) => [s, { found: 0, fixed: 0 }]));
  for (const cells of rows) {
    const [, , state, severityRaw] = cells;
    const row = tally.get(severityWord(severityRaw));
    if (!row) continue;
    row.found++;
    if (state.startsWith(FIXED_PREFIX)) row.fixed++;
  }
  return tally;
}

// THE SCRAPER IS PINNED BEFORE IT IS BELIEVED — security-audit-summary's
// own lesson. A finding, a fixed finding, a «μερικώς» (still open), and
// a severity cell carrying qualifying prose after the word that counts.
{
  const FIXTURE = [
    "| ΑΣ2-9.1 | κάτι | ανοιχτό | σοβαρό | νέο |",
    "| ΑΣ2-9.2 | κάτι άλλο | διορθώθηκε (2026-01-01) | σοβαρό | νέο |",
    "| ΑΣ2-9.3 | ένα τρίτο | μερικώς | μέτριο | νέο |",
    "| ΑΣ2-9.4 | ένα τέταρτο | ανοιχτό | μικρό ως κάτι (λεπτομέρεια σε παρένθεση) | νέο |",
  ].join("\n");
  const t = derive(reportRows(FIXTURE));
  check("the scraper counts a finding", t.get("σοβαρό").found === 2, JSON.stringify(t.get("σοβαρό")));
  check("…and only the one that says διορθώθηκε as fixed", t.get("σοβαρό").fixed === 1);
  check("…counts «μερικώς» as open, not fixed", t.get("μέτριο").found === 1 && t.get("μέτριο").fixed === 0);
  check("…and reads only the first word of a qualified severity cell", t.get("μικρό").found === 1);
}

const rows = reportRows(doc);
check(`the report's rows were found (${rows.length})`, rows.length >= 25, "a scraper that found nothing would make every count below zero and the table would have to be zeroes too");

const derived = derive(rows);

// The summary table as the document prints it.
const printed = new Map();
for (const m of doc.matchAll(/^\|\s*(κρίσιμο|σοβαρό|μέτριο|μικρό|πληροφοριακό)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm)) {
  printed.set(m[1], { found: Number(m[2]), fixed: Number(m[3]), open: Number(m[4]) });
}
check(`the summary table was found (${printed.size} of ${SEVERITIES.length} rows)`, printed.size === SEVERITIES.length, [...printed.keys()].join(", "));

for (const severity of SEVERITIES) {
  const want = derived.get(severity);
  const got = printed.get(severity) ?? { found: -1, fixed: -1, open: -1 };
  check(
    `«${severity}»: the summary says ${got.found}/${got.fixed}/${got.open}, the rows say ${want.found}/${want.fixed}/${want.found - want.fixed}`,
    got.found === want.found && got.fixed === want.fixed && got.open === want.found - want.fixed,
    "re-derive it: every `| ΑΣ2-` row is a finding, «διορθώθηκε» at the start of the state is fixed, «μερικώς» is open, and a Βαρύτητα cell counts by its first word"
  );
}

// The sum across all five rows must match the total rows found — the
// check that would have caught 23 (μικρό alone) vs. 18+4 (μικρό and
// πληροφοριακό kept separate) without anyone re-adding by hand.
const sumPrinted = [...printed.values()].reduce((n, r) => n + r.found, 0);
check(`the five rows sum to the total rows found (${sumPrinted} vs ${rows.length})`, sumPrinted === rows.length);

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
