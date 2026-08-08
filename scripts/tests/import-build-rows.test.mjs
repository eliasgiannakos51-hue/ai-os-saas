// V3 Task 16 — applying a mapping to a file.
//
// This is the step where somebody's real numbers become rows. Everything
// checked here is a way that can go wrong SILENTLY — the import
// succeeds, the count looks right, and the data is wrong.
//
// Run: node scripts/tests/import-build-rows.test.mjs
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

const build = await loadTs("src/lib/import/build-rows.ts");
const targets = await loadTs("src/lib/import/targets.ts");
const mapper = await loadTs("src/lib/import/map-columns.ts");

const trades = targets.getImportTarget("trading");
const finance = targets.getImportTarget("finance");

const map = (pairs) => pairs.map(([column, field]) => ({ column, field }));

console.log("== 1. a straightforward trade log ==");
const tradeResult = build.buildRows({
  target: trades,
  headers: ["Ticker", "Side", "Profit", "Date", "Comment"],
  rows: [
    ["AAPL", "Buy", "120.50", "06/01/2025", "gap fill"],
    ["TSLA", "Sell", "-40", "13/01/2025", ""],
  ],
  mappings: map([
    ["Ticker", "symbol"],
    ["Side", "direction"],
    ["Profit", "pnl"],
    ["Date", "occurred_at"],
    ["Comment", "notes"],
  ]),
  dateOrder: "dmy",
});
check("both rows survive", tradeResult.rows.length, 2);
check("Buy became long", tradeResult.rows[0].direction, "long");
check("Sell became short", tradeResult.rows[1].direction, "short");
check("the P&L keeps its sign", [tradeResult.rows[0].pnl, tradeResult.rows[1].pnl], [120.5, -40]);
check("the date is the one the order says", tradeResult.rows[0].occurred_at.slice(0, 10), "2025-01-06");
// `result` is DERIVED from the P&L when the file has no result column —
// from the user's own number, not from anything inferred.
check("the result is derived from the P&L sign", [tradeResult.rows[0].result, tradeResult.rows[1].result], ["win", "loss"]);
check("an empty optional cell is null, not an empty string", tradeResult.rows[1].notes, null);
check("nothing was rejected", tradeResult.rejected, []);

console.log("\n== 2. a bank export: one signed column, no in/out flag ==");
// This is the shape most bank CSVs actually have, and getting it wrong
// files every payment as income.
const bank = build.buildRows({
  target: finance,
  headers: ["Date", "Memo", "Amount", "Payee"],
  rows: [
    ["2025-01-06", "Invoice 1001", "5000.00", "Acme Ltd"],
    ["2025-01-07", "AWS bill", "-1200.50", "Amazon"],
    ["2025-01-08", "Refund", "(300.00)", "Acme Ltd"],
  ],
  mappings: map([
    ["Date", "occurred_at"],
    ["Memo", "description"],
    ["Amount", "amount"],
    ["Payee", "counterparty"],
  ]),
  dateOrder: "ymd",
});
check("all three rows survive", bank.rows.length, 3);
check("a positive amount is income", bank.rows[0].type, "income");
check("a negative amount is an expense", bank.rows[1].type, "expense");
check("an accounting negative is an expense too", bank.rows[2].type, "expense");
// The amount is stored POSITIVE with the direction in `type`. A signed
// amount AND a type could disagree, and then no report is trustworthy.
check("amounts are stored positive", bank.rows.map((r) => r.amount), [5000, 1200.5, 300]);
check("the counterparty is kept", bank.rows[0].counterparty, "Acme Ltd");

// ...and an explicit type column WINS over the derivation.
const explicit = build.buildRows({
  target: finance,
  headers: ["Desc", "Amount", "Direction"],
  rows: [["Invoice", "500", "credit"]],
  mappings: map([["Desc", "description"], ["Amount", "amount"], ["Direction", "type"]]),
  dateOrder: "dmy",
});
check("an explicit type column is used, not derived", explicit.rows[0].type, "income");

console.log("\n== 3. a row that cannot be a row is rejected, not guessed ==");
const rejects = build.buildRows({
  target: finance,
  headers: ["Desc", "Amount"],
  rows: [
    ["Invoice", "500"],
    ["", "600"],          // no description — the required field
    ["No amount", "n/a"], // amount will not coerce
    ["", ""],             // a spacer line
  ],
  mappings: map([["Desc", "description"], ["Amount", "amount"]]),
  dateOrder: "dmy",
});
check("only the good row is kept", rejects.rows.length, 1);
check("two rows are reported as rejected", rejects.rejected.length, 2);
// The row number matches the spreadsheet, counting the header as row 1 —
// so "row 3" means the row the user can actually go and look at.
check("the row number matches the user's spreadsheet", rejects.rejected[0].rowNumber, 3);
checkTrue("...and says what was missing", rejects.rejected[0].reason.includes("Description"));
// A spacer line is not an error worth reporting; a broken row is.
check("a blank spacer line is silently skipped, not reported", rejects.rejected.length, 2);

console.log("\n== 4. an unreadable date becomes NULL, never today ==");
// THE BUG THIS PINS. Defaulting an unparseable date to now() would give
// every such row the import timestamp — and the weekday detector would
// then find a 100% concentration on whatever day the upload ran, and
// report it as a fact about the user's trading.
const badDates = build.buildRows({
  target: trades,
  headers: ["Sym", "Date"],
  rows: [["AAPL", "not a date"], ["TSLA", ""], ["MSFT", "2025-01-06"]],
  mappings: map([["Sym", "symbol"], ["Date", "occurred_at"]]),
  dateOrder: "dmy",
});
check("three rows survive — a bad date does not reject the row", badDates.rows.length, 3);
check("an unreadable date is null", badDates.rows[0].occurred_at, null);
check("an empty date is null", badDates.rows[1].occurred_at, null);
check("a good date is kept", badDates.rows[2].occurred_at.slice(0, 10), "2025-01-06");
// Reported, so the user knows the column half-failed BEFORE importing.
check("the failure count is reported", badDates.coercionFailures.occurred_at, 1);
check("...and an empty cell is not counted as a failure", badDates.coercionFailures.occurred_at, 1);

console.log("\n== 5. the mapping travels by column NAME, not index ==");
// A client that reordered its columns between the preview and the
// confirm would otherwise import shifted data into every field.
const reordered = build.buildRows({
  target: trades,
  headers: ["Date", "Ticker"], // the reverse of the mapping's order
  rows: [["06/01/2025", "AAPL"]],
  mappings: map([["Ticker", "symbol"], ["Date", "occurred_at"]]),
  dateOrder: "dmy",
});
check("the symbol still comes from the Ticker column", reordered.rows[0].symbol, "AAPL");
check("...and the date from the Date column", reordered.rows[0].occurred_at.slice(0, 10), "2025-01-06");
// A mapping naming a column the file does not have is ignored rather
// than reading index -1.
const missingColumn = build.buildRows({
  target: trades,
  headers: ["Ticker"],
  rows: [["AAPL"]],
  mappings: map([["Ticker", "symbol"], ["Ghost", "pnl"]]),
  dateOrder: "dmy",
});
check("a mapping for a column that is not there is ignored", missingColumn.rows[0].pnl, undefined);
check("...and the row still imports", missingColumn.rows.length, 1);

console.log("\n== 6. the mapping validator is the gate, on BOTH paths ==");
// The client's edited mapping is not more trustworthy for having been
// through a browser. Everything below is what a crafted request would
// try.
const headers = ["Sym", "Amt", "When"];
const ok = mapper.validateMapping({
  target: trades,
  summary: "s",
  headers,
  columns: [{ column: "Sym", field: "symbol" }, { column: "Amt", field: "pnl" }],
});
check("a valid mapping passes", ok.ok, true);

// A field that does not exist on the target would become an insert with
// an unknown column.
const bogusField = mapper.validateMapping({
  target: trades,
  summary: "s",
  headers,
  columns: [{ column: "Sym", field: "symbol" }, { column: "Amt", field: "user_id" }],
});
check("a field the target does not have is dropped", bogusField.ok && bogusField.proposal.mappings[1].field, null);

// A column not in the file is either a hallucination or a stale client.
const bogusColumn = mapper.validateMapping({
  target: trades,
  summary: "s",
  headers,
  columns: [{ column: "Sym", field: "symbol" }, { column: "Nope", field: "pnl" }],
});
check("a column that is not in the file is dropped", bogusColumn.ok && bogusColumn.proposal.mappings.length, 1);

// Two columns onto one field: the second would silently overwrite the
// first, and which one won would depend on ordering.
const duplicate = mapper.validateMapping({
  target: trades,
  summary: "s",
  headers,
  columns: [{ column: "Sym", field: "symbol" }, { column: "Amt", field: "symbol" }],
});
check("a duplicated field is dropped on the second column", duplicate.ok && duplicate.proposal.mappings[1].field, null);

// A required field with no source cannot produce rows.
const noRequired = mapper.validateMapping({
  target: trades,
  summary: "s",
  headers,
  columns: [{ column: "Amt", field: "pnl" }],
});
check("a missing required field refuses the whole mapping", noRequired.ok, false);
check("...with a reason the UI can act on", noRequired.ok === false && noRequired.reason, "no_match");

// `finance_entries.type` is the one required field that may be absent,
// because it is derived from the sign of the amount — which is exactly
// the bank-export shape tested in section 2.
const derivedType = mapper.validateMapping({
  target: finance,
  summary: "s",
  headers: ["D", "A"],
  columns: [{ column: "D", field: "description" }, { column: "A", field: "amount" }],
});
check("a derivable required field does not refuse the mapping", derivedType.ok, true);

check("garbage instead of an array is refused", mapper.validateMapping({ target: trades, summary: "", headers, columns: "nope" }).ok, false);

console.log("\n== 7. the preview shows source next to result ==");
const pairs = build.previewPairs({
  headers: ["Ticker", "Profit"],
  rows: [["AAPL", "1.234,56"]],
  built: tradeResult.rows,
});
check("one pair per previewed row", pairs.length, 1);
check("the source is shown as it was written", pairs[0].source.Profit, "1.234,56");
// The user checks the CONVERSION, which is the thing they cannot verify
// from a description. "1.234,56 → 1234.56" is checkable at a glance;
// "we handle European numbers" is not.
checkTrue("...next to what will be stored", typeof pairs[0].result === "object");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
