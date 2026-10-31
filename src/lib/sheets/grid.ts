/**
 * THE SHEET'S ARITHMETIC, AWAY FROM THE SCREEN (the owner's «28. SHEETS:
 * ΠΙΝΑΚΕΣ ΜΕ ΠΡΑΓΜΑΤΙΚΟΥΣ ΤΥΠΟΥΣ», 2026-10-31, Κομμάτι 1).
 *
 * Four pure functions and the five numbers they share, in a file with no
 * React in it, for one reason: scripts/tests/sheets.test.mjs RUNS them
 * (`loadTs`) instead of reading the component's source for a regular
 * expression that looks like them. A check that greps a component for
 * `Math.floor(scrollTop / ROW_HEIGHT)` passes on a comment; a check that
 * calls `visibleRows(279_972, 640)` and counts what comes back cannot.
 *
 * `visibleRows` is the whole reason ten thousand rows do not stick (his
 * own quality bar: «10.000 γραμμές χωρίς κόλλημα»). Every row is
 * ROW_HEIGHT tall by construction, so which rows a scroller shows is
 * arithmetic on its offset — no measuring, no per-row observer, and
 * about thirty elements in the DOM whichever row you are on.
 */

/** Ten thousand, because that is the number in his quality bar. */
export const SHEET_ROWS = 10000;
/** A…Z. One letter is all a column needs until a sheet is wider. */
export const SHEET_COLUMNS = 26;
/** Every row is exactly this tall, which is what makes the window arithmetic. */
export const ROW_HEIGHT = 28;
export const COL_WIDTH = 104;
export const ROW_HEADER_WIDTH = 56;
/** Rows drawn above and below the view, so a fast scroll shows no gap. */
export const OVERSCAN = 6;

export type Cell = { row: number; col: number };

/** A, B, … Z, AA — a column's own letter. */
export function columnName(col: number): string {
  let label = "";
  let n = col;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** A1, B7, AA3 — the reference a person reads in the formula bar. */
export function cellName(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`;
}

/**
 * Back from a reference to the cell — the other half of `cellName`, and
 * the reason a range can be extended on a phone at all.
 *
 * ONPOINTERENTER DOES NOT FIRE ON A TOUCH DRAG. A touch pointer is
 * implicitly captured by the element the finger went down on, so
 * dragging across the grid sends every move to that one cell and the
 * range never grows — found on a real phone profile on 2026-10-31, after
 * the same drag worked perfectly with a mouse. The fix reads the element
 * under the finger (`document.elementFromPoint`) and asks it which cell
 * it is, which is why the name has to parse back.
 *
 * Reading the cell out of the DOM rather than out of coordinates is also
 * what keeps this right in Arabic: the row headers sit on the right and
 * the columns run the other way, and no arithmetic here has to know that.
 */
export function cellFromName(name: string): Cell | null {
  const match = /^([A-Z]+)([0-9]+)$/.exec(name);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  const row = Number(match[2]);
  if (col < 1 || col > SHEET_COLUMNS || row < 1 || row > SHEET_ROWS) return null;
  return { row: row - 1, col: col - 1 };
}

/** The two corners of a drag, in the order a person reads them. */
export function selectionRange(a: Cell, b: Cell) {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
  };
}

/** How many cells a selection covers — what the formula bar counts. */
export function selectionSize(a: Cell, b: Cell): number {
  const r = selectionRange(a, b);
  return (r.bottom - r.top + 1) * (r.right - r.left + 1);
}

/**
 * Which rows a scroller of this height, at this offset, actually draws —
 * `first` inclusive, `last` exclusive, both clamped to the sheet.
 */
export function visibleRows(scrollTop: number, viewport: number): { first: number; last: number } {
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(SHEET_ROWS, first + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);
  return { first, last };
}
