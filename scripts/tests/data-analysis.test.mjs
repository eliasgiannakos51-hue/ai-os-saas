// READING A SPREADSHEET, AND SAYING WHAT IS IN IT (V4 #19).
//
// WHAT THIS ENVIRONMENT COULD NOT DO, said first: there is no
// ANTHROPIC_API_KEY here, so NOT ONE ANALYSIS WAS EVER RUN THROUGH A
// MODEL. Everything below is parsing and arithmetic — which is
// deliberately where all the numbers live (see profile.ts), because a
// mean produced by a language model is indistinguishable from a real one
// until somebody's decision depends on it.
//
// AND NO FILE WRITTEN BY MICROSOFT EXCEL WAS READ. The .xlsx fixtures
// below are built here, byte by byte, to the same specification Excel
// writes to — which proves the reader against the FORMAT but not against
// any particular producer's quirks. Stated rather than glossed.
//
// THE SIX THINGS THAT WOULD BE WRONG QUIETLY — every one of them produces
// a plausible table and a plausible chart rather than an error:
//
//   A COMMA INSIDE QUOTES. "Smith, John",42 is two fields. Split on the
//   comma and every column after it shifts by one, for that row only.
//
//   A DATE READ AS A NUMBER. Excel stores 2024-03-01 as 45352. Ignore
//   styles.xml and the date axis of every chart becomes forty-five
//   thousand.
//
//   AN EMPTY CELL WITH NO ELEMENT. An .xlsx row lists only the cells that
//   have content, so appending in arrival order shifts C into B.
//
//   1.234,56 versus 1,234.56. Decided per CELL rather than per column and
//   one column carries two scales, a thousand apart.
//
//   03/04/2024. The 3rd of April or the 4th of March. Guessing produces a
//   correct-looking x-axis that is wrong.
//
//   A CORRELATION FROM NOTHING. Two columns that share only their gaps,
//   or a constant column, produce r = 1 or NaN from a naive formula.
//
// Run: node scripts/tests/data-analysis.test.mjs
import { deflateRawSync } from "node:zlib";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const csv = await loadTs("src/lib/data-analysis/csv.ts");
const zip = await loadTs("src/lib/data-analysis/zip.ts");
const xlsx = await loadTs("src/lib/data-analysis/xlsx.ts");
const profile = await loadTs("src/lib/data-analysis/profile.ts");

// =====================================================================
console.log("\n== 1. CSV: the four things that shift a column ==");
// =====================================================================

{
  const r = csv.parseCsv('name,age\n"Smith, John",42\n"O""Brien, Pat",37\n');
  ok("it parses", r.ok, r.ok ? "" : r.reason);
  eq("a quoted comma does NOT split the field", r.rows[0], ["Smith, John", "42"]);
  eq("a doubled quote is one literal quote", r.rows[1], ['O"Brien, Pat', "37"]);
}

{
  const r = csv.parseCsv('name,address\nPat,"12 High St\nLondon"\nSam,elsewhere\n');
  eq("a newline inside quotes stays inside one record", r.rows.length, 2);
  eq("…with the line break preserved", r.rows[0][1], "12 High St\nLondon");
  eq("…and the row after it is unaffected", r.rows[1], ["Sam", "elsewhere"]);
}

{
  const BOM = "\uFEFF";
  const r = csv.parseCsv(`${BOM}Date,Total\n2024-01-01,5\n`);
  eq("the BOM is stripped, so the first header is usable", r.headers, ["Date", "Total"]);
  ok("…and not left on the front of the name", !r.headers[0].startsWith(BOM));

  // WHERE STRIPPING IT IS LOAD-BEARING, and not merely tidy. `.trim()`
  // already removes U+FEFF from a bare header, so an unquoted file
  // survives either way. A QUOTED first header does not: the parser only
  // opens a quoted field when the field is still empty, and a BOM sitting
  // in front of the quote means it never opens — so the quotes become
  // literal characters and the comma inside splits the header in two.
  const quoted = csv.parseCsv(`${BOM}"Date, real",Total\n2024-01-01,5\n`);
  eq("a BOM in front of a QUOTED header does not break the quoting", quoted.headers, ["Date, real", "Total"]);
}

{
  const r = csv.parseCsv("a,b\r\n1,2\r\n3,4\r\n");
  eq("CRLF does not leave \\r on the last field", r.rows, [["1", "2"], ["3", "4"]]);
  const macRow = csv.parseCsv("a,b\r1,2\r");
  eq("a lone CR ends a row too", macRow.rows, [["1", "2"]]);
}

// =====================================================================
console.log("\n== 2. CSV: the delimiter, decided outside quotes ==");
// =====================================================================

{
  // Three commas inside one quoted field, one real semicolon. A naive
  // count picks the comma and the whole file becomes one column.
  const line = '"Smith, John, Jr";42';
  eq("a quoted comma does not win the delimiter vote", csv.detectDelimiter(line), ";");
  const r = csv.parseCsv('name;age\n"Smith, John, Jr";42\n');
  eq("…and the file parses as two columns", r.rows[0], ["Smith, John, Jr", "42"]);
}
eq("tab-separated is detected", csv.detectDelimiter("a\tb\tc"), "\t");
eq("pipe-separated is detected", csv.detectDelimiter("a|b|c"), "|");
eq("a single column falls back to the comma", csv.detectDelimiter("just_one_header"), ",");

// =====================================================================
console.log("\n== 3. CSV: headers a chart can actually use ==");
// =====================================================================

eq("a blank header gets a name", csv.normaliseHeaders(["a", "", "c"]), ["a", "Column 2", "c"]);
eq("a duplicate header is disambiguated", csv.normaliseHeaders(["Total", "Total", "Total"]), ["Total", "Total (2)", "Total (3)"]);
eq("…case-insensitively, because two headers differing only in case are the same column to a human", csv.normaliseHeaders(["Total", "total"]), ["Total", "total (2)"]);

{
  const r = csv.parseCsv("a,b,c\n1,2\n1,2,3,4\n");
  eq("a short row is padded, not dropped", r.rows[0], ["1", "2", ""]);
  eq("a long row is trimmed to the header width", r.rows[1], ["1", "2", "3"]);
  eq("…and both are counted as ragged", r.raggedRows, 2);
}

{
  const empty = csv.parseCsv("   \n  \n");
  ok("a file with nothing in it is refused, not parsed into an empty table", empty.ok === false, JSON.stringify(empty));
}
{
  const r = csv.parseCsv("a,b\n1,2\n\n\n3,4\n");
  eq("blank lines in the middle are not rows", r.rows, [["1", "2"], ["3", "4"]]);
}
{
  const rows = ["h"].concat(new Array(csv.MAX_ROWS + 50).fill("x")).join("\n");
  const r = csv.parseCsv(rows);
  ok(`the row cap holds at ${csv.MAX_ROWS}`, r.rows.length <= csv.MAX_ROWS, String(r.rows.length));
  ok("…and says so rather than pretending it read the whole file", r.truncated === true);
}

// =====================================================================
console.log("\n== 4. ZIP: enough of it to read a spreadsheet ==");
// =====================================================================

/** Builds a real ZIP archive. Not a mock — the reader is handed bytes in
 *  the actual format, produced by an independent implementation of the
 *  writer half. */
function buildZip(files, { method = 8, dataDescriptor = false, encrypted = false } = {}) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, contentString] of Object.entries(files)) {
    const content = Buffer.from(contentString, "utf8");
    const body = method === 8 ? deflateRawSync(content) : content;
    const nameBuf = Buffer.from(name, "utf8");
    const flags = (dataDescriptor ? 0x8 : 0) | (encrypted ? 0x1 : 0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    // WITH A DATA DESCRIPTOR THE LOCAL SIZES ARE ZERO. A reader that
    // trusts them reads zero bytes out of every entry.
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(dataDescriptor ? 0 : body.length, 18);
    local.writeUInt32LE(dataDescriptor ? 0 : content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, body);
    const entryStart = offset;
    offset += 30 + nameBuf.length + body.length;

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(flags, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(content.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(entryStart, 42);
    central.push(cd, nameBuf);
  }

  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, directory, eocd]);
}

{
  const archive = buildZip({ "a.txt": "hello", "b/c.txt": "world" });
  const index = zip.readZipIndex(archive);
  ok("a deflated archive is indexed", index.ok, index.ok ? "" : index.reason);
  eq("both entries are found, by full path", [...index.entries.keys()].sort(), ["a.txt", "b/c.txt"]);
  eq("and the bytes come back", zip.readZipEntry(archive, index.entries.get("a.txt")).toString(), "hello");
}
{
  const archive = buildZip({ "a.txt": "stored" }, { method: 0 });
  const index = zip.readZipIndex(archive);
  eq("an uncompressed entry reads too", zip.readZipEntry(archive, index.entries.get("a.txt")).toString(), "stored");
}
{
  // THE ONE THAT BREAKS A NAIVE READER. Bit 3 set, local sizes zero.
  const archive = buildZip({ "a.txt": "streamed content" }, { dataDescriptor: true });
  const index = zip.readZipIndex(archive);
  eq(
    "a streaming writer's archive still reads (sizes from the central directory)",
    zip.readZipEntry(archive, index.entries.get("a.txt")).toString(),
    "streamed content"
  );
}
{
  const archive = buildZip({ "a.txt": "secret" }, { encrypted: true });
  const index = zip.readZipIndex(archive);
  ok("an encrypted archive is REFUSED, not decompressed into noise", index.ok === false, JSON.stringify(index));
  ok("…and says why", /password/i.test(index.reason), index.reason);
}
{
  ok("random bytes are not a zip", zip.readZipIndex(Buffer.from("this is not a zip at all")).ok === false);
}

// =====================================================================
console.log("\n== 5. XLSX: the cells, the gaps and the dates ==");
// =====================================================================

const RELS = `<?xml version="1.0"?><Relationships>
  <Relationship Id="rId7" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId8" Target="worksheets/sheet9.xml"/>
</Relationships>`;
const WORKBOOK = `<?xml version="1.0"?><workbook><sheets>
  <sheet name="Sales" sheetId="1" r:id="rId7"/>
  <sheet name="Notes" sheetId="2" r:id="rId8"/>
</sheets></workbook>`;
// Rich text in the third: one word split across two runs.
const SHARED = `<?xml version="1.0"?><sst count="4">
  <si><t>Region</t></si>
  <si><t>Revenue</t></si>
  <si><r><t>Tot</t></r><r><t>als</t></r></si>
  <si><t>North &amp; South</t></si>
</sst>`;
// numFmtId 14 is a built-in date; 164 is a custom one; 0 is General.
const STYLES = `<?xml version="1.0"?><styleSheet>
  <numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;EUR&quot; #,##0.00"/></numFmts>
  <cellXfs count="4">
    <xf numFmtId="0"/>
    <xf numFmtId="14"/>
    <xf numFmtId="164"/>
    <xf numFmtId="165"/>
  </cellXfs>
</styleSheet>`;
const SHEET = `<?xml version="1.0"?><worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>When</t></is></c></row>
  <row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2"><v>120.5</v></c><c r="D2" s="1"><v>45352</v></c></row>
  <row r="3"><c r="A3" t="inlineStr"><is><t>West</t></is></c><c r="B3"><v>7</v></c><c r="C3" s="3"><v>99.99</v></c><c r="D3" s="2"><v>45353</v></c></row>
  <row r="4"><c r="A4" t="e"><v>#N/A</v></c><c r="B4" t="b"><v>1</v></c></row>
</sheetData></worksheet>`;

{
  const book = buildZip({
    "xl/workbook.xml": WORKBOOK,
    "xl/_rels/workbook.xml.rels": RELS,
    "xl/sharedStrings.xml": SHARED,
    "xl/styles.xml": STYLES,
    "xl/worksheets/sheet4.xml": SHEET,
    "xl/worksheets/sheet9.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>other</t></is></c></row></sheetData></worksheet>`,
  });

  const r = xlsx.parseXlsx(book);
  ok("the workbook is read", r.ok, r.ok ? "" : r.reason);
  eq("THE FIRST SHEET IS THE ONE THE WORKBOOK NAMES, not sheet1.xml", r.sheetName, "Sales");
  eq("both sheets are listed", r.sheetNames, ["Sales", "Notes"]);
  eq("rich text is joined, not truncated to its first run", r.headers[2], "Totals");
  eq("an inline string is read", r.headers[3], "When");
  eq("an escaped ampersand is decoded once", r.rows[0][0], "North & South");

  // THE GAP. Row 2 has A, C, D — no B.
  eq("a missing cell leaves a HOLE rather than shifting the row", r.rows[0], ["North & South", "", "120.5", "2024-03-01"]);
  eq("…so the value that follows it stays in its own column", r.rows[0][2], "120.5");

  eq("a built-in date format turns the serial into a date", r.rows[0][3], "2024-03-01");
  eq("…and so does a CUSTOM one (dd/mm/yyyy)", r.rows[1][3], "2024-03-02");
  eq("a currency format is NOT a date", r.rows[1][2], "99.99");
  eq("an error cell is kept verbatim", r.rows[2][0], "#N/A");
  eq("a boolean reads as TRUE", r.rows[2][1], "TRUE");

  const notes = xlsx.parseXlsx(book, "Notes");
  eq("a named sheet can be selected", notes.sheetName, "Notes");
}

eq("column A is index 0", xlsx.columnIndex("A1"), 0);
eq("column Z is index 25", xlsx.columnIndex("Z9"), 25);
eq("column AA is index 26, not 0", xlsx.columnIndex("AA1"), 26);
eq("column AB is index 27", xlsx.columnIndex("AB100"), 27);
eq("column BA is index 52", xlsx.columnIndex("BA1"), 52);

// The 1900 leap-year bug Excel kept from Lotus 1-2-3.
eq("serial 1 is 1900-01-01", xlsx.excelSerialToIso(1), "1900-01-01");
eq("serial 59 is 1900-02-28 (before the phantom day)", xlsx.excelSerialToIso(59), "1900-02-28");
eq("serial 61 is 1900-03-01 (after it)", xlsx.excelSerialToIso(61), "1900-03-01");
eq("serial 45352 is 2024-03-01", xlsx.excelSerialToIso(45352), "2024-03-01");
ok("a fractional serial carries a time", xlsx.excelSerialToIso(45352.5).includes(" 12:00:00"), xlsx.excelSerialToIso(45352.5));

// DECODED ONCE, NOT TWICE.
eq("&amp;lt; decodes to the TEXT &lt;, not to a tag", xlsx.decodeXml("&amp;lt;"), "&lt;");
eq("a numeric reference decodes", xlsx.decodeXml("caf&#233;"), "café");
eq("an entity nobody declared is left alone (there is no DTD here to exploit)", xlsx.decodeXml("&xxe;"), "&xxe;");

{
  const styles = xlsx.parseDateStyles(STYLES);
  ok("style 1 (built-in 14) is a date", styles.has(1));
  ok("style 2 (custom dd/mm/yyyy) is a date", styles.has(2));
  ok("style 3 (a currency format) is NOT", !styles.has(3));
  ok("style 0 (General) is NOT", !styles.has(0));
}

// =====================================================================
console.log("\n== 6. what each column IS ==");
// =====================================================================

const col = (values) => profile.profileColumn("c", 0, values);

eq("a column of integers is integer", col(["1", "2", "3"]).type, "integer");
eq("a column with a decimal is number", col(["1", "2.5"]).type, "number");
eq("a column of ISO dates is date", col(["2024-01-01", "2024-06-30"]).type, "date");
eq("a column of yes/no is boolean", col(["yes", "no", "yes"]).type, "boolean");
eq("a column of prose is text", col(["hello there", "goodbye"]).type, "text");
eq("a column of nothing is empty", col(["", "  ", "N/A"]).type, "empty");

{
  // BOOLEAN BEATS NUMBER. A flag column reported as numeric gets a mean,
  // which is a percentage nobody asked for wearing an average's clothes.
  const flags = col(["1", "0", "1", "1"]);
  eq("a 1/0 flag column is boolean, not integer", flags.type, "boolean");
  ok("…so it has no mean", flags.numeric === undefined);
}

{
  const european = col(["1.234,56", "2.000,00", "999,10"]);
  eq("a European-formatted column is numeric", european.type, "number");
  eq("…and is read at the right scale", european.numeric.max, 2000);
  eq("…and says which format it decided on", european.numberFormat, "european");

  const plain = col(["1,234.56", "2,000.00"]);
  eq("an Anglo-Saxon column is read at the right scale too", plain.numeric.max, 2000);
  eq("…and is labelled plain", plain.numberFormat, "plain");
}

eq("a currency symbol does not make a price column text", col(["€10", "€20.50"]).type, "number");
eq("a percentage keeps its face value", profile.parseNumber("45%"), 45);
eq("a thousands separator written as a non-breaking space is read", profile.parseNumber("1 234"), 1234);

{
  // THE AMBIGUOUS DATE. Refused rather than guessed.
  ok("03/04/2024 is not read as a date at all", profile.parseDate("03/04/2024") === null);
  eq("…but 25/12/2024 is, because 25 cannot be a month", profile.parseDate("25/12/2024"), "2024-12-25");
  eq("…and 12/25/2024 the other way round", profile.parseDate("12/25/2024"), "2024-12-25");
  ok("an impossible date is refused", profile.parseDate("2024-02-31") === null);
  ok("…and so is a 29th of February in a non-leap year", profile.parseDate("2023-02-29") === null);
}

{
  const c = col(["10", "", "20", "N/A", "30"]);
  eq("blanks and N/A are counted as missing", c.missing, 2);
  eq("…and not as a category", c.topValues.some((t) => t.value === "N/A"), false);
  eq("the stats are over the values that exist", c.numeric.mean, 20);
}

// =====================================================================
console.log("\n== 7. statistics that refuse to be invented ==");
// =====================================================================

{
  const s = profile.numberStats([1, 2, 3, 4]);
  eq("median of an even count is the midpoint of the middle two", s.median, 2.5);
  eq("median of an odd count is the middle one", profile.numberStats([1, 5, 100]).median, 5);
  eq("the mean is the mean", s.mean, 2.5);
  eq("the sum is the sum", s.sum, 10);
}
{
  // A COLUMN WITH NO SPREAD. Whole numbers make the arithmetic exact, so
  // |v - mean| is exactly 0 and even an unguarded test finds no outliers
  // — which is why the first version of this check could not tell the
  // guard from its absence.
  const whole = profile.numberStats([5, 5, 5, 5]);
  eq("a column of identical whole numbers has NO outliers", whole.outlierCount, 0);
  eq("…and a standard deviation of zero", whole.stdDev, 0);

  // THE ONE THAT ACTUALLY BITES. The mean of three 0.1s is
  // 0.10000000000000002, so every value sits ~1e-17 away from it and a
  // test of `> 3 * 0` marks the WHOLE COLUMN as outliers. A user is then
  // told every row of a constant column is anomalous.
  const fractional = profile.numberStats([0.1, 0.1, 0.1]);
  eq("a column of identical DECIMALS has no outliers either", fractional.outlierCount, 0);
  eq("…and none are offered as examples", fractional.outlierExamples.length, 0);
}
{
  const values = [...new Array(50).fill(10), 1000];
  const s = profile.numberStats(values);
  ok("a genuine outlier is found", s.outlierCount >= 1, JSON.stringify(s.outlierExamples));
  ok("…and reported as an example rather than removed", s.outlierExamples.includes(1000));
}

{
  const xs = Array.from({ length: 30 }, (_, i) => i);
  const ys = xs.map((x) => 2 * x + 1);
  ok("a perfect straight line is r = 1", Math.abs(profile.correlation(xs, ys) - 1) < 1e-9);
  ok("…and a perfect inverse is r = -1", Math.abs(profile.correlation(xs, ys.map((y) => -y)) + 1) < 1e-9);
}
{
  const short = [1, 2, 3, 4, 5];
  ok(
    `no correlation is reported below ${profile.MIN_PAIRS_FOR_CORRELATION} pairs`,
    profile.correlation(short, short) === null
  );
}
{
  const xs = Array.from({ length: 30 }, (_, i) => i);
  const constant = new Array(30).fill(7);
  ok("a constant column correlates with nothing, and returns null rather than NaN", profile.correlation(xs, constant) === null);
}
{
  // PAIRWISE. Two columns whose only overlap is 25 rows.
  const xs = Array.from({ length: 40 }, (_, i) => (i < 25 ? i : null));
  const ys = Array.from({ length: 40 }, (_, i) => (i < 25 ? i * 3 : null));
  const r = profile.correlation(xs, ys);
  ok("gaps are skipped in pairs, not treated as zero", r !== null && Math.abs(r - 1) < 1e-9, String(r));
}

// =====================================================================
console.log("\n== 8. the table as a whole ==");
// =====================================================================

{
  const headers = ["region", "revenue", "cost", "note"];
  const rows = Array.from({ length: 30 }, (_, i) => ["north", String(i * 10), String(i * 5), "x"]);
  rows.push(["north", "0", "0", "x"]); // a duplicate of row 0
  const t = profile.profileTable(headers, rows);

  eq("the row count is the row count", t.rowCount, 31);
  eq("an exact duplicate row is counted", t.duplicateRows, 1);
  ok("a real relationship between two numeric columns is found", t.correlations.some((c) => c.a === "revenue" && c.b === "cost"));
  ok("…and the text column is not in it", !t.correlations.some((c) => c.a === "note" || c.b === "note"));
  eq("every column is profiled", t.columns.length, 4);
  eq("the categorical column knows its top value", t.columns[0].topValues[0].value, "north");
}

// =====================================================================
console.log("\n== 9. a chart is a CLAIM, so the data decides what may be drawn ==");
// =====================================================================

const charts = await loadTs("src/lib/data-analysis/charts.ts");
const analyse = await loadTs("src/lib/data-analysis/analyse.ts");
const query = await loadTs("src/lib/data-analysis/query.ts");

const HEADERS = ["region", "revenue", "cost", "day", "note"];
const ROWS = Array.from({ length: 30 }, (_, i) => [
  ["north", "south", "east"][i % 3],
  String(100 + i * 10),
  String(50 + i * 4),
  `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
  "x",
]);
const PROFILE = profile.profileTable(HEADERS, ROWS);

{
  const good = charts.validateChartSpec(
    { kind: "bar", title: "Revenue by region", x: "region", y: "revenue", aggregation: "sum" },
    PROFILE
  );
  ok("a valid chart is accepted", good.ok, good.ok ? "" : good.reason);

  // THE COMMONEST MODEL FAILURE: a plausible name that is not the name.
  const wrongColumn = charts.validateChartSpec(
    { kind: "bar", title: "Revenue", x: "Region", y: "Revenue", aggregation: "sum" },
    PROFILE
  );
  ok("a column that does not exist is REFUSED, not drawn empty", wrongColumn.ok === false, JSON.stringify(wrongColumn));

  const textMean = charts.validateChartSpec(
    { kind: "bar", title: "x", x: "region", y: "note", aggregation: "mean" },
    PROFILE
  );
  ok("a mean of a text column is refused", textMean.ok === false, JSON.stringify(textMean));

  const unorderedLine = charts.validateChartSpec(
    { kind: "line", title: "x", x: "region", y: "revenue", aggregation: "sum" },
    PROFILE
  );
  ok("a line through unordered categories is refused", unorderedLine.ok === false, JSON.stringify(unorderedLine));

  const datedLine = charts.validateChartSpec(
    { kind: "line", title: "x", x: "day", y: "revenue", aggregation: "sum" },
    PROFILE
  );
  ok("…but a line over a date column is fine", datedLine.ok === true, JSON.stringify(datedLine));

  const noTitle = charts.validateChartSpec({ kind: "bar", title: "  ", x: "region", aggregation: "count" }, PROFILE);
  ok("a chart with no title is refused", noTitle.ok === false);

  const countNeedsNoY = charts.validateChartSpec({ kind: "pie", title: "Rows by region", x: "region", aggregation: "count" }, PROFILE);
  ok("a count needs no measure column", countNeedsNoY.ok === true, JSON.stringify(countNeedsNoY));
}

{
  const spec = { kind: "bar", title: "Revenue by region", x: "region", y: "revenue", aggregation: "sum" };
  const built = charts.buildChart(spec, PROFILE, HEADERS, ROWS);
  const total = built.points.reduce((s, p) => s + p.value, 0);
  const expected = ROWS.reduce((s, r) => s + Number(r[1]), 0);
  eq("the bars add up to the file", total, expected);
  ok("…and every group is a real value from the column", built.points.every((p) => ["north", "south", "east"].includes(p.label)));
}
{
  // A BLANK MEASURE IS NOT A ZERO. Two rows out of three have a value.
  const rows = [["a", ""], ["a", "10"], ["a", "20"]];
  const p = profile.profileTable(["g", "v"], rows);
  const built = charts.buildChart({ kind: "bar", title: "t", x: "g", y: "v", aggregation: "mean" }, p, ["g", "v"], rows);
  eq("a missing measure is skipped, not counted as zero", built.points[0].value, 15);
}
{
  // The tail is GATHERED for a sum, and CUT for a mean — because a mean
  // of means is not a mean.
  const many = Array.from({ length: 40 }, (_, i) => [`g${i}`, "10"]);
  const p = profile.profileTable(["g", "v"], many);
  const summed = charts.buildChart({ kind: "bar", title: "t", x: "g", y: "v", aggregation: "sum" }, p, ["g", "v"], many);
  ok("a long tail is gathered into Other for a sum", summed.points.some((pt) => pt.label === "Other"));
  eq("…and the total still equals the file", summed.points.reduce((s, pt) => s + pt.value, 0), 400);
  const meaned = charts.buildChart({ kind: "bar", title: "t", x: "g", y: "v", aggregation: "mean" }, p, ["g", "v"], many);
  ok("a mean gets NO 'Other' bucket (a mean of means is not a mean)", !meaned.points.some((pt) => pt.label === "Other"));
  ok("…and says it was truncated", meaned.truncated === true);
}
{
  const suggested = charts.suggestCharts(PROFILE);
  ok("charts are suggested from the column types alone, with no model", suggested.length > 0, String(suggested.length));
  ok("…and every one of them validates", suggested.every((s) => charts.validateChartSpec(s, PROFILE).ok), JSON.stringify(suggested));
}

// =====================================================================
console.log("\n== 10. the model may interpret, never assert ==");
// =====================================================================

{
  const brief = analyse.buildProfileBrief({ fileName: "sales.csv", profile: PROFILE, headers: HEADERS, rows: ROWS });
  ok("the brief carries the row count", /ROWS: 30/.test(brief), brief.slice(0, 80));
  ok("…the computed statistics", /mean/.test(brief));
  ok(
    `…and only ${analyse.SAMPLE_ROWS} sample rows, so the price is set by columns not by the upload`,
    brief.split("\n").filter((l) => l.startsWith("north |") || l.startsWith("south |") || l.startsWith("east |")).length <= analyse.SAMPLE_ROWS
  );
  ok("the instruction forbids stating a number that is not in the brief", /NEVER state a number that is not in the brief/i.test(analyse.ANALYSIS_SYSTEM));
  ok("…forbids naming a column that does not exist", /NEVER name a column that is not/i.test(analyse.ANALYSIS_SYSTEM));
  ok("…forbids claiming causation", /NEVER say what caused/i.test(analyse.ANALYSIS_SYSTEM));
  ok("…and forbids advice", /NEVER give business, financial, legal or medical advice/i.test(analyse.ANALYSIS_SYSTEM));
}
{
  const reply = JSON.stringify({
    summary: "Sales data across three regions.",
    findings: [
      { headline: "North leads", detail: "It has the largest total.", columns: ["region", "revenue"] },
      { headline: "Northeast is growing", detail: "Invented.", columns: ["territory"] },
    ],
    charts: [
      { kind: "bar", title: "Revenue by region", x: "region", y: "revenue", aggregation: "sum" },
      { kind: "bar", title: "Revenue by territory", x: "territory", y: "revenue", aggregation: "sum" },
    ],
    suggestedQuestions: ["Which region grew fastest?"],
  });
  const parsed = analyse.parseAnalysis(reply, PROFILE);
  eq("a finding about a column the file does not have is DROPPED", parsed.findings.findings.length, 1);
  eq("…and the real one survives", parsed.findings.findings[0].headline, "North leads");
  eq("a chart naming a column that does not exist is refused", parsed.findings.charts.length, 1);
  ok("…and the refusals are reported rather than swallowed", parsed.rejected.length === 2, JSON.stringify(parsed.rejected));
}
{
  const fenced = "Here you go:\n```json\n" + JSON.stringify({ summary: "ok", findings: [], charts: [], suggestedQuestions: [] }) + "\n```";
  ok("a fenced reply is read", analyse.parseAnalysis(fenced, PROFILE).findings.summary === "ok");
  const trailing = JSON.stringify({ summary: "ok" }) + "\n\nHope that helps { and a brace }";
  ok("a reply with prose after the JSON is read", analyse.extractJson(trailing)?.summary === "ok");
  const braceInString = JSON.stringify({ summary: "a } brace", findings: [] });
  ok("a brace inside a string does not end the object early", analyse.extractJson(braceInString)?.summary === "a } brace");
  ok("a reply that is not JSON at all is refused", analyse.parseAnalysis("sorry, I cannot", PROFILE).rejected.length > 0);
}

// =====================================================================
console.log("\n== 11. asking the data: the arithmetic is ours ==");
// =====================================================================

{
  const good = query.validateQuery({ groupBy: "region", measure: "revenue", aggregation: "sum", filters: [], limit: 5 }, PROFILE);
  ok("a valid query is accepted", good.ok, good.ok ? "" : good.reason);
  const badColumn = query.validateQuery({ groupBy: "territory", aggregation: "count", filters: [] }, PROFILE);
  ok("a query naming a column that does not exist is refused", badColumn.ok === false, JSON.stringify(badColumn));
  const textSum = query.validateQuery({ groupBy: "region", measure: "note", aggregation: "sum", filters: [] }, PROFILE);
  ok("summing a text column is refused", textSum.ok === false);
  const badFilter = query.validateQuery({ aggregation: "count", filters: [{ column: "nope", op: "=", value: "x" }] }, PROFILE);
  ok("a filter on a column that does not exist is refused", badFilter.ok === false);
}
{
  const q = query.validateQuery({ groupBy: "region", measure: "revenue", aggregation: "sum", filters: [], limit: 10 }, PROFILE);
  const result = query.runQuery(q.query, PROFILE, HEADERS, ROWS);
  eq("every row matched when there is no filter", result.matchedRows, 30);
  const total = result.rows.reduce((s, r) => s + r.value, 0);
  eq("the groups add up to the file", total, ROWS.reduce((s, r) => s + Number(r[1]), 0));
  ok("the biggest group comes first", result.rows[0].value >= result.rows[result.rows.length - 1].value);
}
{
  const q = query.validateQuery(
    { groupBy: "region", aggregation: "count", filters: [{ column: "region", op: "=", value: "NORTH" }] },
    PROFILE
  );
  const result = query.runQuery(q.query, PROFILE, HEADERS, ROWS);
  ok("an = filter is case-insensitive (NORTH finds north)", result.matchedRows === 10, String(result.matchedRows));
}
{
  const q = query.validateQuery(
    { aggregation: "count", filters: [{ column: "revenue", op: ">=", value: "200" }] },
    PROFILE
  );
  const result = query.runQuery(q.query, PROFILE, HEADERS, ROWS);
  const expected = ROWS.filter((r) => Number(r[1]) >= 200).length;
  eq("a numeric comparison compares numbers, not strings", result.matchedRows, expected);
}
{
  // ORDERED COMPARISONS NEED AN ORDER. "> London" is not a question.
  //
  // The fixture matters: with `note` full of "x", a code-point comparison
  // against "m" would match EVERY row, so a version of this that returned
  // 0 either way could not tell the rule from its absence.
  const rows = [["alpha"], ["zulu"], ["mike"]];
  const p = profile.profileTable(["name"], rows);
  const q = query.validateQuery({ aggregation: "count", filters: [{ column: "name", op: ">", value: "m" }] }, p);
  const result = query.runQuery(q.query, p, ["name"], rows);
  eq(
    "a > on a text column matches NOTHING rather than comparing code points (which would match zulu and mike)",
    result.matchedRows,
    0
  );
  // …and the same filter on a real number column still works, so the rule
  // is about the column's type and not about disabling the operator.
  const numeric = query.validateQuery({ aggregation: "count", filters: [{ column: "revenue", op: ">", value: "250" }] }, PROFILE);
  const numericResult = query.runQuery(numeric.query, PROFILE, HEADERS, ROWS);
  ok("…while > on a numeric column still filters", numericResult.matchedRows > 0 && numericResult.matchedRows < 30, String(numericResult.matchedRows));
}

{
  // THE GUARD THAT MAKES THE ANSWER TRUSTWORTHY.
  const result = {
    query: { aggregation: "sum", filters: [], limit: 10 },
    rows: [{ group: "north", value: 1234.5, rows: 10 }],
    matchedRows: 10,
    totalRows: 30,
  };
  eq("a number that IS in the evidence is allowed", query.numbersNotInEvidence("north came to 1234.5", result), []);
  eq("…written with a thousands separator too", query.numbersNotInEvidence("north came to 1,234.5", result), []);
  eq("…and rounded for readability", query.numbersNotInEvidence("about 1235", result), []);
  eq("a small ordinal in prose is not a claim", query.numbersNotInEvidence("the top 3 regions", result), []);
  const invented = query.numbersNotInEvidence("north came to 9876 last quarter", result);
  ok("A NUMBER THE MODEL MADE UP IS CAUGHT", invented.includes("9876"), JSON.stringify(invented));
  ok(
    "the question prompt tells it not to write numbers at all",
    /must contain NO figures/i.test(query.QUESTION_SYSTEM)
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
