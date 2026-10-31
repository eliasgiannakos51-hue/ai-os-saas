#!/usr/bin/env node
/*
 * WOULD A SPREADSHEET THAT IS NOT ONE BE NOTICED?
 *
 * Sheets Κομμάτι 1 makes two claims that look identical whether they are
 * true or false, and both are the kind a reader cannot check by looking:
 *
 * 1. «10.000 γραμμές χωρίς κόλλημα» (his own quality bar). A grid that
 *    draws fifty rows looks exactly like one that draws ten thousand
 *    thirty at a time — the difference is only visible at the bottom of
 *    the scrollbar, which nobody drags in a screenshot. So the window
 *    arithmetic is mutated four ways here, and every one of them has to
 *    turn the gate red through a check that RAN `visibleRows` rather than
 *    read it.
 * 2. «μηχανή τύπων, ανοιχτή, με άδεια για εμπορική χρήση. Γράφεις την
 *    άδεια στο ΘΕΛΩ πριν τη βάλεις.» The failure here is a dependency
 *    added while nobody is looking — and the two obvious packages are
 *    GPL-3.0-only and proprietary. So the last two mutants put
 *    `hyperformula` into package.json and take the GPL line out of the
 *    doc, which are the two halves of that rule going wrong.
 *
 * THE ONE WORTH READING FIRST is "the «+» opens the tab that was there
 * before this press". It is a four-line reordering that leaves every type
 * correct, the tab appearing and the screen looking right; what breaks is
 * only the SECOND press, which adds Φύλλο 3 and opens Φύλλο 2. That is
 * the shape of bug that survives a demo and arrives as "it sometimes
 * jumps".
 *
 * AND ONE ABOUT THE 26th SQUARE. The registry mutant adds a Sheets tile
 * to the owner's own twenty-five-square grid — the exact thing this piece
 * deliberately did NOT do, because it is his decision and it is in
 * docs/NEEDS-FROM-ELIAS.md as a question. A gate that would not notice a
 * tile appearing is a gate that cannot keep that promise.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/sheets.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/sheets.test.mjs";
const SHELL = "src/components/sheets/sheets-shell.tsx";
const PAGE = "src/app/dashboard/sheets/page.tsx";
const GRID = "src/lib/sheets/grid.ts";
const REGISTRY = "src/lib/nav/all-tools.ts";
const PKG = "package.json";
const DOC = "docs/SHEETS-ENGINE.md";
const PRIMARY = "scripts/tests/one-primary-action.test.mjs";
const ENTRY_POINTS = "scripts/tests/entry-points.test.mjs";
const EL = "messages/el.json";
const ZH = "messages/zh.json";

const MUTANTS = [
  // ---- the ten thousand rows, which are the quality bar ---------------
  {
    name: "the sheet is two hundred rows wearing a spreadsheet's clothes",
    file: GRID,
    from: "export const SHEET_ROWS = 10000;",
    to: "export const SHEET_ROWS = 200;",
    expect: "ten thousand rows and twenty-six columns are the declared size",
  },
  {
    name: "the window stops overscanning, so a fast scroll leaves a row blank",
    file: GRID,
    from: "  const last = Math.min(SHEET_ROWS, first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);",
    to: "  const last = Math.min(SHEET_ROWS, first + Math.ceil(viewport / ROW_HEIGHT));",
    expect: "never leaves a row of the view undrawn",
  },
  {
    name: "the window is no longer clamped to the sheet, so the last screen asks for row 10006",
    file: GRID,
    from: "  const last = Math.min(SHEET_ROWS, first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);",
    to: "  const last = first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2;",
    expect: "the window never leaves the sheet",
  },
  {
    name: "virtualisation is abandoned: every row of the sheet is in the DOM",
    file: GRID,
    from: "  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);",
    to: "  const first = 0;",
    expect: "never draws more than",
  },
  {
    name: "the rows below the window stop being height, so the scrollbar lies about the size",
    file: SHELL,
    from: "                <div style={{ height: Math.max(0, (SHEET_ROWS - lastRow) * ROW_HEIGHT) }} />",
    to: "                <div />",
    expect: "drawn as height, not as elements",
  },
  {
    name: "the grid tells the page it is a hundred rows while drawing ten thousand",
    file: SHELL,
    from: "              data-rows={SHEET_ROWS}",
    to: "              data-rows={100}",
    expect: "takes both from that module rather than carrying its own",
  },
  // ---- the references a person reads in the formula bar ---------------
  {
    name: "rows are numbered from zero, as no spreadsheet has ever been",
    file: GRID,
    from: "  return `${columnName(col)}${row + 1}`;",
    to: "  return `${columnName(col)}${row}`;",
    expect: "the reference a person reads is the Excel one",
  },
  {
    name: "the twenty-seventh column is named '[' instead of AA",
    file: GRID,
    from: "    label = String.fromCharCode(65 + (n % 26)) + label;",
    to: "    label = String.fromCharCode(65 + n) + label;",
    expect: "the reference a person reads is the Excel one",
  },
  {
    name: "a drag upwards selects nothing, because the corners are not sorted",
    file: GRID,
    from: "    bottom: Math.max(a.row, b.row),",
    to: "    bottom: a.row,",
    expect: "a drag reads the same whichever corner it started from",
  },
  {
    name: "the formula bar counts one cell fewer in each direction",
    file: GRID,
    from: "  return (r.bottom - r.top + 1) * (r.right - r.left + 1);",
    to: "  return (r.bottom - r.top) * (r.right - r.left);",
    expect: "a drag reads the same whichever corner it started from",
  },
  // ---- the range on a phone, which needs the handle ------------------
  {
    name: "a reference parses back one row and one column out, so the handle extends to the wrong cell",
    file: GRID,
    from: "  return { row: row - 1, col: col - 1 };",
    to: "  return { row, col };",
    expect: "every reference parses back to the cell it names",
  },
  {
    name: "a reference outside the sheet is accepted, so a stray attribute selects row 10001",
    file: GRID,
    from: "  if (col < 1 || col > SHEET_COLUMNS || row < 1 || row > SHEET_ROWS) return null;",
    to: "  if (col < 1 || row < 1) return null;",
    expect: "anything that is not a cell of this sheet is refused",
  },
  {
    name: "the handle stops taking the gesture off scrolling, so a phone scrolls instead of selecting",
    file: SHELL,
    from: '                    touchAction: "none",',
    to: '                    touchAction: "auto",',
    expect: "the only thing that takes the gesture off scrolling",
  },
  {
    name: "the handle stops capturing the pointer, so the drag dies at the first cell border",
    file: SHELL,
    from: "                    e.currentTarget.setPointerCapture(e.pointerId);",
    to: "                    void e.pointerId;",
    expect: "the only thing that takes the gesture off scrolling",
  },
  {
    name: "the handle reads the first cell of the page instead of the one under the finger",
    file: SHELL,
    from: '    const under = document.elementFromPoint(clientX, clientY)?.closest("[data-cell]");',
    to: '    const under = document.querySelector("[data-cell]");',
    expect: "reads the cell under the finger out of the page",
  },
  // ---- the sheet tabs -------------------------------------------------
  {
    // THE EXPENSIVE ONE, AND THE ONE THAT REALLY HAPPENED: a setter
    // called from inside a state updater fires again when React replays
    // the updater, writing the old open tab back over the new one — on
    // a LATER press, which is why it survived two rounds of testing.
    name: "the open tab is set from inside the state updater, so a replay puts the old one back",
    file: SHELL,
    from: "    setSheets((current) => [...current, next]);\n    goTo(next);",
    to: "    setSheets((current) => {\n      setActiveSheet(next);\n      return [...current, next];\n    });",
    expect: "the «+» updater is pure",
  },
  {
    name: "the new sheet's number is read from this render's array, so two presses in one tick collide",
    file: SHELL,
    from: "  const nextSheetRef = useRef(2);",
    to: "  const nextSheetRef = { current: (sheets[sheets.length - 1] ?? 0) + 1 };",
    expect: "comes from a counter a replay cannot touch",
  },
  {
    name: "opening another sheet keeps the first sheet's selection, so the bar names a cell of the wrong sheet",
    file: SHELL,
    from: "  function goTo(sheet: number) {\n    setActiveSheet(sheet);\n    setAnchor({ row: 0, col: 0 });",
    to: "  function goTo(sheet: number) {\n    setActiveSheet(sheet);\n    setFocus({ row: 0, col: 0 });",
    expect: "opening a sheet puts the selection back at A1",
  },
  // ---- the viewport, read once and wrong --------------------------
  {
    name: "the view's height is assumed to be 640px, so a tall screen loses its bottom rows",
    file: SHELL,
    from: "    const read = () => setViewport(node.clientHeight || 640);",
    to: "    const read = () => setViewport(640);",
    expect: "the view's own height is measured",
  },
  {
    name: "nothing watches the view's height, so a turned phone keeps the portrait window",
    file: SHELL,
    from: "    const observer = new ResizeObserver(read);",
    to: "    const observer = { observe: () => {}, disconnect: () => {} };",
    expect: "the view's own height is measured",
  },
  // ---- a pointermove that re-renders ten thousand rows ---------------
  {
    name: "dragging becomes state, so every pointermove re-renders the grid",
    file: SHELL,
    from: "  const draggingRef = useRef(false);",
    to: "  const draggingRef = { current: false };",
    expect: "a drag is a ref, so a pointermove over the grid is not a re-render",
  },
  // ---- the one white button, and its honesty --------------------------
  {
    name: "Download looks wired: the button is live with nothing behind it",
    file: SHELL,
    from: "            type=\"button\"\n            disabled\n            aria-label={t(\"download\")}",
    to: "            type=\"button\"\n            aria-label={t(\"download\")}",
    expect: "because xlsx and csv are his",
  },
  {
    name: "the marker dot goes, so an inert control reads as a working one",
    file: SHELL,
    from: '<span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-button-ink/50" aria-hidden="true" />',
    to: '<span aria-hidden="true" />',
    expect: "carrying the marker dot",
  },
  {
    name: "the second filled control stops being declared where the design rule is kept",
    file: PRIMARY,
    from: '  "dashboard/sheets/page.tsx": 2,',
    to: '  "dashboard/sheets/page.tsx": 3,',
    expect: "the page's two filled controls are declared",
  },
  // ---- the field, which must not encourage ----------------------------
  {
    name: "a request is answered with the work's title, so it reads as done",
    file: SHELL,
    from: '      { id: `t${current.length}`, role: "tool", text: t("soon") },',
    to: '      { id: `t${current.length}`, role: "tool", text: t("work.title") },',
    expect: "one sentence that names the piece it waits for",
  },
  // ---- the 404 that replaces a promise nobody could keep -------------
  {
    name: "a customer gets a «Notify me» for a tool with no tile to notify about",
    file: PAGE,
    from: '  if (!(await isFeatureOn("sheets-tool", user))) notFound();',
    to: '  if (!(await isFeatureOn("sheets-tool", user))) return <ComingSoonShell toolKey="sheets" name="Sheets" />;',
    expect: "gets notFound(), not a Notify-me nobody can answer",
  },
  {
    name: "the page reads another tool's switch, so Sheets opens whenever Films does",
    file: PAGE,
    from: 'isFeatureOn("sheets-tool", user)',
    to: 'isFeatureOn("films-tool", user)',
    expect: "the page reads that switch and nothing else",
  },
  // ---- the 26th square, which is his decision and not mine -----------
  {
    name: "a 26th tile is added to the owner's own grid, quietly",
    file: REGISTRY,
    from: '  { name: "projects", group: "organise", href: "/dashboard/projects", ready: true },',
    to: '  { name: "sheets", group: "make", href: "/dashboard/sheets", ready: false, waitingFor: "the screen is built behind the sheets-tool switch but the engine is not chosen yet" },\n  { name: "projects", group: "organise", href: "/dashboard/projects", ready: true },',
    expect: "Sheets is not in the owner's grid",
  },
  {
    name: "the deliberate exemption loses its reason, so an unreachable route reads as an accident",
    file: ENTRY_POINTS,
    from: '  "/dashboard/sheets": "staff-only behind the \'sheets-tool\' switch and notFound() for everyone else; its door (a 26th tile, or a link from Document) is the owner\'s own open question",',
    to: '  "/dashboard/sheets": "",',
    expect: "exempted on purpose, with a reason, exactly while there is no tile",
  },
  // ---- the licence rule, both halves ----------------------------------
  {
    name: "a GPL-3.0-only formula engine is added as a dependency",
    file: PKG,
    from: '"dependencies": {',
    to: '"dependencies": {\n    "hyperformula": "^3.5.0",',
    expect: "no spreadsheet, grid or formula library is a dependency",
  },
  {
    name: "the doc stops naming HyperFormula's licence, so the trap is undocumented",
    file: DOC,
    from: "| `hyperformula` | 3.5.0 | **GPL-3.0-only** [ΕΠΙΒΕΒΑΙΩΜΕΝΟ] |",
    to: "| `hyperformula` | 3.5.0 | ανοιχτή άδεια [ΕΠΙΒΕΒΑΙΩΜΕΝΟ] |",
    expect: "names HyperFormula's licence exactly as the registry gives it",
  },
  {
    name: "a package that declares no licence is written down as MIT anyway",
    file: DOC,
    from: "| `luckysheet` | 2.1.13 | **καμία δήλωση στο manifest** [ΜΗ ΕΠΙΒΕΒΑΙΩΜΕΝΟ] |",
    to: "| `luckysheet` | 2.1.13 | **MIT** [ΕΠΙΒΕΒΑΙΩΜΕΝΟ] |",
    expect: "a package that declares no licence is marked unverified, never guessed",
  },
  // ---- the words, in the languages they are read in -------------------
  {
    name: "the sheet number is quoted away, so every tab reads «Φύλλο {n}»",
    file: EL,
    from: '"tab": "Φύλλο {n}"',
    to: '"tab": "Φύλλο \'{n}\'"',
    expect: "the placeholders are live, not quoted away",
  },
  {
    name: "the Chinese count loses its plural, so one cell and nine read the same shape",
    file: ZH,
    from: '"selected": "{count, plural, other {# 个单元格}}"',
    to: '"selected": "{count} 个单元格"',
    expect: "the count really is a plural",
  },
  {
    name: "the Greek «what this is for» sentence becomes a label",
    file: EL,
    from: '"why": "Τα Φύλλα φτιάχνουν πίνακα με πραγματικούς τύπους μέσα, ώστε κάθε σύνολο να ξαναβγαίνει μόνο του όταν αλλάζεις έναν αριθμό — ποτέ γραμμένο στο χέρι αποτέλεσμα."',
    to: '"why": "Πίνακες."',
    expect: "is a sentence, not a stub",
  },
];

runMutations({
  name: "sheets",
  gate: GATE,
  targets: [SHELL, PAGE, GRID, REGISTRY, PKG, DOC, PRIMARY, ENTRY_POINTS, EL, ZH],
  mutants: MUTANTS,
});
