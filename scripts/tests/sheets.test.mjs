// SHEETS, ΚΟΜΜΑΤΙ 1 — the owner's directive 28 («SHEETS: ΠΙΝΑΚΕΣ ΜΕ
// ΠΡΑΓΜΑΤΙΚΟΥΣ ΤΥΠΟΥΣ», 2026-10-31). Five things, in his own words:
//
//   «στο κέντρο ο πίνακας»        the grid, 10.000 rows × 26 columns
//   «καρτέλες φύλλων από κάτω»    the tab strip, with a working «+»
//   «μπάρα τύπων από πάνω»        the bar above it, reading the selection
//   «πεδίο αλλαγών κάτω»          the shell's own one field
//   «ένα λευκό κουμπί Download»   in the work bar, drawn and marked inert
//
// His stop-gate sits right after this piece, so nothing beyond the screen
// is wired — and the two ways a screen like this lies are both checked
// here rather than assumed:
//
// 1. A GRID THAT IS NOT REALLY TEN THOUSAND ROWS. His quality bar says
//    «10.000 γραμμές χωρίς κόλλημα». A component that draws 50 rows and
//    calls itself a spreadsheet passes every regular expression about
//    spreadsheets. So §5 does not read the component for arithmetic that
//    looks right — it RUNS `visibleRows` from src/lib/sheets/grid.ts at
//    every scroll position in the sheet and asserts the window is both
//    bounded AND covering. That file exists, separately from the
//    component, exactly so this check can execute instead of grep.
// 2. A LIBRARY SMUGGLED IN EARLY. His Κομμάτι 2 says the formula engine
//    must be open, licensed for commercial use, and that its licence is
//    written into «ΘΕΛΩ» BEFORE it goes in. The two obvious packages
//    fail that test (hyperformula is GPL-3.0-only, handsontable ships
//    its own commercial licence), so §1 holds package.json to no new
//    dependency at all, and holds docs/SHEETS-ENGINE.md to naming both
//    traps with their exact licence strings.
//
// Read with comments stripped where the claim is about code: none of this
// renders without a browser, and scripts/tests/sheets.prodtest.mjs is
// where the screen is pressed, on a computer and on a phone.
//
// Run: node scripts/tests/sheets.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");

const SHELL = "src/components/sheets/sheets-shell.tsx";
const PAGE = "src/app/dashboard/sheets/page.tsx";
const GRID = "src/lib/sheets/grid.ts";
const DOC = "docs/SHEETS-ENGINE.md";

const src = stripComments(readFileSync(SHELL, "utf8"));
const page = stripComments(readFileSync(PAGE, "utf8"));
const flags = stripComments(readFileSync("src/lib/flags/flags.ts", "utf8"));
const doc = readFileSync(DOC, "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const LOCALES = ["el", "en", "de", "es", "fr", "it", "pt", "ar", "ja", "zh"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const sheetsMessages = (locale) => messages[locale].dashboard.sheets;

// IS THIS A SENTENCE, OR A STUB? — and the answer cannot be a character
// count, which is a Latin-alphabet assumption. The ratio was measured on
// 2026-10-31 over the honest-gap sentences of agents-shell.test.mjs:
// every Latin locale lands between 86% and 138% of the English, Arabic
// between 76% and 91%, Japanese between 47% and 65%, and Chinese between
// 33% and 43% — one Chinese character carries what four or five English
// ones do. So the English is held to an absolute floor and every other
// language to a share of it.
const ENGLISH_FLOOR = 40;
const SHARE_OF_ENGLISH = 0.3;
function isSentence(locale, value, englishLength) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (locale === "en") return value.trim().length >= ENGLISH_FLOOR;
  return value.trim().length >= Math.floor(englishLength * SHARE_OF_ENGLISH);
}

// ---------------------------------------------------------------------
console.log("== 1. no library came in, and the licences are written down ==");
// THE POPULATION IS package.json's OWN DEPENDENCY LIST, not a list of
// names somebody remembered. A spreadsheet library under any name is a
// new runtime dependency, so the check ranges over all of them.
const deps = Object.keys(pkg.dependencies ?? {});
const SHEET_LIBRARY = /sheet|spreadsheet|formula|handsontable|hyperformula|datagrid|data-grid|ag-grid|xlsx|excel|univer|luckysheet/i;
const brought = deps.filter((d) => SHEET_LIBRARY.test(d));
check(`no spreadsheet, grid or formula library is a dependency (${deps.length} read)`,
  deps.length >= 10 && brought.length === 0, brought.join(", "));
check("the grid is ours, and small enough to be ours", existsSync(GRID) && readFileSync(GRID, "utf8").split("\n").length < 120);
check("neither the shell nor the page imports one", !SHEET_LIBRARY.test(src.replace(/sheets?-shell|\/sheets\b|dashboard\.sheets|SheetsShell|sheets-|SHEET_|sheet\./gi, "")) || !/^import .*(handsontable|hyperformula|formulajs|ag-grid|exceljs|xlsx)/m.test(src));
// The two traps, each with the exact string the npm registry returns —
// "GPL" alone would pass on a doc that says "not GPL" about the wrong
// package.
check("the doc names HyperFormula's licence exactly as the registry gives it", /`hyperformula`[\s\S]{0,80}GPL-3\.0-only/.test(doc));
check("...and Handsontable's", /`handsontable`[\s\S]{0,120}SEE LICENSE IN LICENSE\.txt/.test(doc));
check("...and says in one word that neither may be used in a closed product", (doc.match(/❌ Όχι/g) ?? []).length >= 2);
// THE ONES THAT PASS, so the doc is a decision and not a list of refusals.
for (const ok of ["@formulajs/formulajs", "fast-formula-parser", "exceljs"]) {
  check(`the recommendation names ${ok}, with MIT beside it`, new RegExp(`\`${ok.replace(/[/@.]/g, "\\$&")}\`[\\s\\S]{0,80}MIT`).test(doc));
}
// A PACKAGE THAT DECLARES NO LICENCE IS NOT "PROBABLY MIT", and that is
// the finding the owner's own rule («γράφεις την άδεια πριν τη βάλεις»)
// turns into a refusal.
//
// RANGED OVER THE TABLE'S OWN ROWS, ONE ROW AT A TIME. The first version
// of this check searched 160 characters after the package's name, which
// on adjacent rows reaches into the NEXT row's marking — so rewriting
// luckysheet's row to «MIT [ΕΠΙΒΕΒΑΙΩΜΕΝΟ]» left it green on
// jspreadsheet-ce's marking (found by this file's own mutation suite,
// 2026-10-31). Each row is now judged alone.
const rows = doc.split("\n").filter((l) => /^\| `/.test(l)).map((l) => l.split("|").map((c) => c.trim()));
check(`the licence table was read (${rows.length} packages)`, rows.length >= 12, String(rows.length));
const unmarked = rows.filter((r) => !/ΕΠΙΒΕΒΑΙΩΜΕΝΟ/.test(r[3] ?? ""));
check("every row says whether its licence was read from the registry or not", unmarked.length === 0,
  unmarked.map((r) => r[1]).join(", "));
// No row may claim a verified licence without naming one, and no row that
// declares nothing may be marked verified.
const silent = rows.filter((r) => /καμία δήλωση/.test(r[3] ?? ""));
const guessed = silent.filter((r) => !/ΜΗ ΕΠΙΒΕΒΑΙΩΜΕΝΟ/.test(r[3]));
check(`a package that declares no licence is marked unverified, never guessed (${silent.length} such)`,
  silent.length >= 2 && guessed.length === 0, guessed.map((r) => r[1]).join(", "));
const cleared = rows.filter((r) => /✅/.test(r[4] ?? ""));
const wronglyCleared = cleared.filter((r) => /GPL|SEE LICENSE|καμία δήλωση/.test(r[3] ?? ""));
check(`and no row cleared for commercial use carries a licence that forbids it (${cleared.length} cleared)`,
  cleared.length >= 5 && wronglyCleared.length === 0, wronglyCleared.map((r) => r[1]).join(", "));
check("the licences carry the date they were read, and the command that re-reads them",
  /2026-10-31/.test(doc) && /registry\.npmjs\.org/.test(doc));
check("the doc ends in a ΘΕΛΩ with the licence written in it, as the directive demands",
  /## ΘΕΛΩ ΑΠΟ ΤΟΝ ΗΛΙΑ/.test(doc) && /γράφεις την άδεια στο ΘΕΛΩ πριν τη βάλεις/.test(doc));
check("the migrations line is there even though this piece touches none", /\*\*ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία\*\*/.test(doc));

// ---------------------------------------------------------------------
console.log("\n== 2. the switch, and a 404 rather than a promise ==");
check('"sheets-tool" is declared in FLAGS', /"sheets-tool":\s*"/.test(flags));
check("the page reads that switch and nothing else", /isFeatureOn\("sheets-tool", user\)/.test(page) &&
  (page.match(/isFeatureOn\(/g) ?? []).length === 1);
// notFound() AND NOT ComingSoonShell, and the difference is a promise
// nobody could keep: that screen's «Ειδοποίησέ με» is answered by
// scripts/notify-tool-ready.mjs, which reads lib/nav/all-tools.ts, where
// Sheets has no entry.
check("anyone the switch is not open to gets notFound(), not a Notify-me nobody can answer",
  /notFound\(\)/.test(page) && !/ComingSoonShell/.test(page));
check("...and the reason is written in the page, next to the call",
  /notify-tool-ready\.mjs/.test(readFileSync(PAGE, "utf8")));
check("the real shell is behind that same check", /<SheetsShell \/>/.test(page));
check("the page draws it inside the full-height wrapper", /<div className="h-\[calc\(100dvh-8rem\)\] md:h-\[calc\(100vh-4rem\)\]">/.test(page));

// ---------------------------------------------------------------------
console.log("\n== 3. no 26th tile was added quietly, and the question is asked ==");
const { ALL_TOOLS } = await loadTs("src/lib/nav/all-tools.ts");
check(`Sheets is not in the owner's grid (${ALL_TOOLS.length} tiles read)`,
  ALL_TOOLS.length >= 25 && !ALL_TOOLS.some((t) => t.name === "sheets" || t.href === "/dashboard/sheets"),
  ALL_TOOLS.map((t) => t.name).join(", "));
const needs = readFileSync("docs/NEEDS-FROM-ELIAS.md", "utf8");
check("...and the choice between a 26th square and a door from Document is put to him",
  /\/dashboard\/sheets/.test(needs) && /26/.test(needs) && /Document/.test(needs));
check("the doc puts the same question, with both roads and what each costs",
  /26ο τετράγωνο/.test(doc) && /Πόρτα μέσα από το Document/.test(doc));
// A ROUTE WITH NO WAY IN IS NORMALLY A DEFECT, and entry-points.test.mjs
// is the gate that says so — it found this one. The exemption is
// deliberate (the door is the owner's decision), so it is held BOTH
// WAYS here, which is the shape CLAUDE.md requires of every
// absent-on-purpose entry: the exemption must exist exactly while there
// is no tile, and must be gone the moment there is one. Neither half can
// go stale without this check going red.
const entryPoints = readFileSync("scripts/tests/entry-points.test.mjs", "utf8");
const exempted = /"\/dashboard\/sheets":\s*"[^"]{40,}"/.test(entryPoints);
const hasTile = ALL_TOOLS.some((t) => t.href === "/dashboard/sheets");
check("the missing way in is exempted on purpose, with a reason, exactly while there is no tile",
  exempted !== hasTile && (hasTile || exempted),
  hasTile ? "Sheets has a tile now — delete the entry-points exemption" : "no tile and no exemption: the route is unreachable by accident");

// ---------------------------------------------------------------------
console.log("\n== 4. the empty landing: one question, one sentence, three examples ==");
check("the landing uses the shell's own `empty`, with the heading and the why",
  /heading: t\("empty\.heading"\)/.test(src) && /why: t\("empty\.why"\)/.test(src));
check("exactly three examples, and they are the directive's own three kinds",
  /key: "budget"[\s\S]{0,120}key: "stock"[\s\S]{0,120}key: "pricelist"/.test(src));
check("the honest limits line is drawn under the field, not behind a condition",
  /data-testid="sheets-limits"/.test(src) && /\{t\("limits"\)\}/.test(src) && !/\{limits &&/.test(src));

// ---------------------------------------------------------------------
console.log("\n== 5. the grid: 10.000 × 26, and the window is arithmetic ==");
const grid = await loadTs(GRID);
check("ten thousand rows and twenty-six columns are the declared size",
  grid.SHEET_ROWS === 10000 && grid.SHEET_COLUMNS === 26);
check("the component takes both from that module rather than carrying its own",
  /from "@\/lib\/sheets\/grid"/.test(src) && !/const SHEET_ROWS/.test(src) && /data-rows=\{SHEET_ROWS\}/.test(src));
// A, B, … Z — RANGED OVER EVERY COLUMN, not spot-checked on the first.
const letters = Array.from({ length: grid.SHEET_COLUMNS }, (_, i) => grid.columnName(i));
check(`every one of the ${grid.SHEET_COLUMNS} columns has its own letter, A to Z`,
  letters.join("") === "ABCDEFGHIJKLMNOPQRSTUVWXYZ", letters.join(""));
check("the reference a person reads is the Excel one, at both corners of the sheet",
  grid.cellName(0, 0) === "A1" && grid.cellName(9999, 25) === "Z10000" && grid.columnName(26) === "AA");
check("a drag reads the same whichever corner it started from",
  JSON.stringify(grid.selectionRange({ row: 9, col: 4 }, { row: 2, col: 1 })) ===
    JSON.stringify(grid.selectionRange({ row: 2, col: 1 }, { row: 9, col: 4 })) &&
    grid.selectionSize({ row: 9, col: 4 }, { row: 2, col: 1 }) === 8 * 4);
// THE WHOLE SHEET, NOT ONE OFFSET. The claim is "ten thousand rows cost
// the browser thirty", and the population it has to hold over is every
// scroll position of the sheet — so every one of them is run.
const VIEWPORT = 640;
const TALLEST = 1600;
let widest = 0;
let uncovered = [];
let outOfRange = [];
for (let top = 0; top <= grid.SHEET_ROWS * grid.ROW_HEIGHT; top += grid.ROW_HEIGHT) {
  for (const viewport of [VIEWPORT, TALLEST]) {
    const { first, last } = grid.visibleRows(top, viewport);
    widest = Math.max(widest, last - first);
    if (first < 0 || last > grid.SHEET_ROWS || last < first) outOfRange.push(top);
    // Covering: every row the viewport can show at this offset is drawn.
    const firstOnScreen = Math.floor(top / grid.ROW_HEIGHT);
    const lastOnScreen = Math.min(grid.SHEET_ROWS - 1, Math.floor((top + viewport - 1) / grid.ROW_HEIGHT));
    if (firstOnScreen < grid.SHEET_ROWS && (firstOnScreen < first || lastOnScreen > last - 1)) uncovered.push(top);
  }
}
const ROWS_IN_DOM_CEILING = Math.ceil(TALLEST / grid.ROW_HEIGHT) + grid.OVERSCAN * 2 + 1;
check(`the window never leaves the sheet (${grid.SHEET_ROWS * 2 + 2} offsets run)`, outOfRange.length === 0, `first out of range at scrollTop ${outOfRange[0]}`);
check("...and never leaves a row of the view undrawn", uncovered.length === 0, `first gap at scrollTop ${uncovered[0]}`);
check(`...and never draws more than ${ROWS_IN_DOM_CEILING} rows at once (widest was ${widest})`,
  widest <= ROWS_IN_DOM_CEILING && widest >= 20, String(widest));
// The two spacers are what make the scrollbar honest about all ten
// thousand while thirty rows are in the DOM. Without the second one the
// bar reaches the end after one screen.
check("the rows above and below the window are drawn as height, not as elements",
  /style=\{\{ height: firstRow \* ROW_HEIGHT \}\}/.test(src) &&
    /style=\{\{ height: Math\.max\(0, \(SHEET_ROWS - lastRow\) \* ROW_HEIGHT\) \}\}/.test(src));
// THE VIEWPORT IS MEASURED, NOT ASSUMED. The window is
// `ceil(viewport / ROW_HEIGHT)` rows tall, so a height read once and
// wrong is rows missing at the bottom of a tall screen — and a phone
// turned sideways changes it by 400px.
check("the view's own height is measured, and re-measured when it changes",
  /setViewport\(node\.clientHeight \|\| 640\)/.test(src) && /new ResizeObserver\(read\)/.test(src) &&
    /observer\.observe\(node\)/.test(src) && /observer\.disconnect\(\)/.test(src));
check("a drag is a ref, so a pointermove over the grid is not a re-render",
  /const draggingRef = useRef\(false\)/.test(src) && /if \(draggingRef\.current\) setFocus\(cell\)/.test(src));
check("every cell says which cell it is, for a press to be aimed at",
  /data-cell=\{cellName\(row, col\)\}/.test(src) && /role="gridcell"/.test(src) && /aria-selected=\{inRange\}/.test(src));

// A RANGE ON A PHONE IS A DIFFERENT GESTURE, and it took a real phone
// profile to see it: a touch pointer is implicitly captured by the
// element the finger went down on, so `onPointerEnter` never fires for
// the cells a finger is dragged across and the range stays one cell.
// scripts/tests/sheets.prodtest.mjs is what caught it, with the same
// drag passing on 1440x900 and failing on 390x844.
const roundTrip = [];
for (const row of [0, 1, 4999, 9999]) {
  for (let col = 0; col < grid.SHEET_COLUMNS; col++) {
    const back = grid.cellFromName(grid.cellName(row, col));
    if (!back || back.row !== row || back.col !== col) roundTrip.push(grid.cellName(row, col));
  }
}
check(`every reference parses back to the cell it names (${4 * grid.SHEET_COLUMNS} tried)`,
  roundTrip.length === 0, roundTrip.slice(0, 5).join(", "));
check("...and anything that is not a cell of this sheet is refused, never guessed at",
  grid.cellFromName("") === null && grid.cellFromName("AA1") === null &&
    grid.cellFromName("A10001") === null && grid.cellFromName("3B") === null && grid.cellFromName("A0") === null);
check("the corner handle exists, and is the only thing that takes the gesture off scrolling",
  /data-testid="sheets-handle"/.test(src) && (src.match(/touchAction: "none"/g) ?? []).length === 1 &&
    /setPointerCapture\(e\.pointerId\)/.test(src));
// A HANDLE RENDERED INSIDE THE CORNER CELL UNMOUNTS THE MOMENT THE RANGE
// GROWS PAST IT, and an unmounted element loses the pointer capture — so
// the drag would stop after one cell, on a phone, exactly where it is
// hardest to notice.
check("...and it is one element, positioned by arithmetic outside the cells",
  /insetInlineStart: ROW_HEADER_WIDTH \+ \(range\.right \+ 1\) \* COL_WIDTH/.test(src) &&
    /top: ROW_HEIGHT \+ \(range\.bottom \+ 1\) \* ROW_HEIGHT/.test(src));
check("...and it reads the cell under the finger out of the page, so Arabic needs no special case",
  /document\.elementFromPoint\(clientX, clientY\)\?\.closest\("\[data-cell\]"\)/.test(src) &&
    /cellFromName\(under\?\.getAttribute\("data-cell"\) \?\? ""\)/.test(src));

// ---------------------------------------------------------------------
console.log("\n== 6. μπάρα τύπων from above: a read-out, never a second field ==");
check("the bar exists and shows the selected cell's own reference",
  /data-testid="sheets-formula-bar"/.test(src) && /data-testid="sheets-selection"/.test(src) &&
    /cellName\(range\.top, range\.left\)\}:\$\{cellName\(range\.bottom, range\.right\)\}/.test(src));
check("...the cell's contents beside it", /data-testid="sheets-formula-value"/.test(src) && /t\("formula\.empty"\)/.test(src));
check("...and the count of cells when more than one is selected",
  /selectedCount > 1 &&[\s\S]{0,200}data-testid="sheets-selected-count"/.test(src) && /t\("formula\.selected", \{ count: selectedCount \}\)/.test(src));
// The shared shell allows exactly one thing on a screen that takes keys
// (scripts/tests/tool-shell.test.mjs). Typing a formula is his Κομμάτι 5.
check("nothing on this screen takes a key but the shell's field",
  !/<textarea\b|<input\b|contentEditable/.test(src));

// ---------------------------------------------------------------------
console.log("\n== 7. καρτέλες φύλλων from below, and the «+» really adds one ==");
check("the tabs are drawn, and say which one is open", /data-testid="sheets-tabs"/.test(src) && /aria-pressed=\{n === activeSheet\}/.test(src));
check("the «+» adds a sheet and opens it", /data-testid="sheets-add"/.test(src) && /onClick=\{addSheet\}/.test(src));
// THE BUG THIS CHECK IS FOR, AND IT IS THE ONE THAT ACTUALLY HAPPENED.
// The first version called `setActiveSheet(next)` from INSIDE the
// `setSheets` updater. React may replay an updater — StrictMode
// double-invokes it, a re-processed queue runs it again — so that setter
// fired a second time later and wrote «Φύλλο 3» back over the tab the
// person had just opened. The screen and `aria-pressed` disagreed, which
// is how it was found (a screenshot, not a gate). An updater has to be
// pure: no setter inside it.
check("the «+» updater is pure — nothing is set from inside it",
  /setSheets\(\(current\) => \[\.\.\.current, next\]\);/.test(src) && !/setSheets\(\(current\) => \{/.test(src));
// AND THE NUMBER COMES FROM A REF, not from the array this render saw:
// an event handler reads its own render's state, so two presses in one
// tick would both ask for the same number. A handler is not replayed,
// which is exactly why the counter is safe where the updater is not.
check("...and the new sheet's number comes from a counter a replay cannot touch",
  /const nextSheetRef = useRef\(2\);/.test(src) &&
    /const next = nextSheetRef\.current;[\s\S]{0,80}nextSheetRef\.current = next \+ 1;/.test(src));
check("opening a sheet puts the selection back at A1", /function goTo\(sheet: number\)[\s\S]{0,200}setAnchor\(\{ row: 0, col: 0 \}\)/.test(src));
check("every tab and the «+» clear 44px, which is a finger", (src.match(/min-h-\[44px\]/g) ?? []).length >= 2 && /h-11 w-11/.test(src));

// ---------------------------------------------------------------------
console.log("\n== 8. ένα λευκό κουμπί «Download», drawn and marked inert ==");
check("it is the white button the directive asked for", /data-testid="sheets-download"/.test(src) && /bg-button/.test(src));
check("...disabled, because xlsx and csv are his Κομμάτι 8", /data-testid="sheets-download"/.test(src) && /disabled\b[\s\S]{0,300}data-testid="sheets-download"/.test(src));
check("...carrying the marker dot this product uses for a control with nothing behind it yet",
  /rounded-full bg-button-ink\/50/.test(src));
check("...and saying so on hover, in the reader's language", /title=\{t\("downloadSoon"\)\}/.test(src));
// The second filled control on this page is declared, with the reason,
// where the design rule is kept — not left to be discovered.
const primary = readFileSync("scripts/tests/one-primary-action.test.mjs", "utf8");
check("the page's two filled controls are declared with the owner's own words beside them",
  /"dashboard\/sheets\/page\.tsx": 2/.test(primary) && /Ένα λευκό\n *\/\/ κουμπί «Download»/.test(primary));

// ---------------------------------------------------------------------
console.log("\n== 9. the field answers honestly, and invents nothing ==");
check("a request is answered with one sentence that names the piece it waits for",
  /text: t\("soon"\)/.test(src) && /role: "tool"/.test(src));
check("...and no cell is filled with a number from nowhere",
  !/Math\.random|SAMPLE|DEMO_ROWS|placeholderRows/.test(src));
check("the work opens on the first send, and closes from the shell's own button",
  /setOpen\(true\)/.test(src) && /onCloseWork=\{\(\) => setOpen\(false\)\}/.test(src));

// ---------------------------------------------------------------------
console.log("\n== 10. every word of it, in ten languages ==");
const FLAT = ["placeholder", "limits", "soon", "download", "downloadSoon"];
const enSheets = sheetsMessages("en");
for (const l of LOCALES) {
  const m = sheetsMessages(l);
  const missing = [];
  for (const k of FLAT) if (typeof m?.[k] !== "string" || !m[k].trim()) missing.push(k);
  for (const [group, keys] of [["work", ["title"]], ["formula", ["label", "empty", "selected"]], ["sheet", ["tab", "add"]]]) {
    for (const k of keys) if (typeof m?.[group]?.[k] !== "string" || !m[group][k].trim()) missing.push(`${group}.${k}`);
  }
  for (const k of ["heading", "why"]) if (typeof m?.empty?.[k] !== "string" || !m.empty[k].trim()) missing.push(`empty.${k}`);
  for (const k of ["budget", "stock", "pricelist"]) {
    if (typeof m?.empty?.examples?.[k] !== "string" || !m.empty.examples[k].trim()) missing.push(`empty.examples.${k}`);
  }
  check(`${l}: every string of the screen`, missing.length === 0, missing.join(", "));
  check(`${l}: the tool's one-word name`, typeof messages[l].dashboard.tools.names.sheets === "string" &&
    messages[l].dashboard.tools.names.sheets.trim().split(/\s+/).length === 1);
  // The two sentences a reader decides on: what the tool is for, and what
  // it will not do yet. Held to a real sentence, by the measured ratio.
  check(`${l}: «what this is for» is a sentence, not a stub`, isSentence(l, m.empty.why, enSheets.empty.why.length), m.empty.why);
  check(`${l}: and so is the limits line`, isSentence(l, m.limits, enSheets.limits.length), m.limits);
  // ICU: '{n}' is the literal text {n} in every language (CLAUDE.md, the
  // second thing that lied to the owner), so the placeholder of every
  // string that has one is checked for being live.
  check(`${l}: the placeholders are live, not quoted away`,
    /\{n\}/.test(m.sheet.tab) && !/'\{/.test(m.sheet.tab) && /\{count/.test(m.formula.selected) && !/'\{/.test(m.formula.selected));
  check(`${l}: and the count really is a plural, not one form for every number`, /plural,/.test(m.formula.selected));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
