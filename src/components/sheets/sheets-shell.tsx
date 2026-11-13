"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Plus } from "lucide-react";
import { ToolShell, type ShellTurn } from "@/components/shell/tool-shell";
import { useEditorShell } from "@/components/shell/editor-shell-context";
import {
  COL_WIDTH,
  ROW_HEADER_WIDTH,
  ROW_HEIGHT,
  SHEET_COLUMNS,
  SHEET_ROWS,
  cellName,
  cellFromName,
  columnName,
  selectionRange,
  selectionSize,
  visibleRows,
  type Cell,
} from "@/lib/sheets/grid";

/**
 * SHEETS (the owner's «28. SHEETS: ΠΙΝΑΚΕΣ ΜΕ ΠΡΑΓΜΑΤΙΚΟΥΣ ΤΥΠΟΥΣ»,
 * 2026-10-31), ΚΟΜΜΑΤΙ 1 ONLY — his own stop-gate sits right after it:
 * «ΜΟΝΟ ΕΔΩ: στιγμιότυπο και σταματάς μέχρι να γράψω «εγκρίνω»».
 *
 * His four bullets, and where each one is:
 *   «στο κέντρο ο πίνακας»      the grid, 10.000 rows × 26 columns
 *   «καρτέλες φύλλων από κάτω»  the tab strip under it, with a real «+»
 *   «μπάρα τύπων από πάνω»      the bar above it, reading the selection
 *   «πεδίο αλλαγών κάτω»        the shell's own field, as every tool has
 *   «ένα λευκό κουμπί Download» in the work area's bar, drawn and inert
 *
 * NO NEW DEPENDENCY, AND THAT IS A DECISION, NOT AN OMISSION. His
 * Κομμάτι 2 says the formula engine must be open AND licensed for
 * commercial use, and that its licence is written into «ΘΕΛΩ» BEFORE it
 * goes in. A grid library would smuggle that same question in one piece
 * early — and the two best-known ones are exactly the trap: hyperformula
 * is GPL-3.0-only and handsontable ships its own proprietary licence
 * (both read from the npm registry on 2026-10-31, docs/SHEETS-ENGINE.md).
 * So the grid here is ours, and it leaves Κομμάτι 2's decision exactly
 * where he put it.
 *
 * THE 10.000 ROWS ARE REAL, NOT A PROMISE. His quality bar says ten
 * thousand rows without sticking. The sheet below IS ten thousand rows;
 * only the ~30 in view are ever in the DOM, by arithmetic on the scroll
 * offset, so the browser pays for thirty. scripts/tests/sheets.prodtest.mjs
 * scrolls to the last row in the built app and counts what was rendered.
 *
 * WHAT THIS PIECE DOES NOT DO, and says so on screen rather than
 * pretending: no typing into cells (his Κομμάτι 5), no formulas (2, 3,
 * 4, 6), no charts (7), no xlsx (8). The field answers every request
 * with one honest sentence, and Download is drawn and marked inert —
 * an export that produced an empty file would be worse than a control
 * that admits it is not wired, which is why 3D's «Κάνε το τελικό»
 * carries the same marker dot (components/three-d/three-d-shell.tsx).
 */

export function SheetsShell() {
  const t = useTranslations("dashboard.sheets");
  const tNames = useTranslations("dashboard.tools.names");
  // docs/QUEUE.md ED2 (2026-11-09): the old shell has no bar slot of its
  // own, so the inert Download button below stays inside `actions` there
  // (unchanged); the editor layout draws its OWN white button from
  // `work.primary` (components/shell/editor-shell.tsx) and would
  // otherwise draw this one a second time, white among the outlined
  // `actions` — the same split website-shell.tsx's `sitePrimary` uses.
  const editor = useEditorShell();

  const [turns, setTurns] = useState<ShellTurn[]>([]);
  const [open, setOpen] = useState(false);
  const [sheets, setSheets] = useState<number[]>([1]);
  const [activeSheet, setActiveSheet] = useState(1);
  const [anchor, setAnchor] = useState<Cell>({ row: 0, col: 0 });
  const [focus, setFocus] = useState<Cell>({ row: 0, col: 0 });

  // THE WINDOW, FROM THE SCROLL OFFSET. No library and no measurement of
  // each row: every row is ROW_HEIGHT tall by construction, so which ones
  // are visible is arithmetic (`visibleRows`, which the gate runs). The
  // spacer above and the one below keep the scrollbar honest about all
  // ten thousand.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(640);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // MEASURED, AND RE-MEASURED. The window is `ceil(viewport / ROW_HEIGHT)`
  // rows tall, so a viewport read once and wrong is rows missing at the
  // bottom of a tall screen — and a phone turned sideways changes it by
  // 400px. A ResizeObserver is the only thing that keeps up with both;
  // the 640 is the fallback for the one frame before the first read, and
  // for a browser without the observer.
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const read = () => setViewport(node.clientHeight || 640);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  const { first: firstRow, last: lastRow } = visibleRows(scrollTop, viewport);
  const rows = useMemo(
    () => Array.from({ length: Math.max(0, lastRow - firstRow) }, (_, i) => firstRow + i),
    [firstRow, lastRow]
  );
  const columns = useMemo(() => Array.from({ length: SHEET_COLUMNS }, (_, i) => i), []);

  const range = selectionRange(anchor, focus);
  const selectedCount = selectionSize(anchor, focus);

  // DRAGGING IS A REF, NOT STATE. A re-render per pointermove over a grid
  // this size is the one thing that would make «χωρίς κόλλημα» false, and
  // the only thing the move handler needs to know is whether a button is
  // still down.
  const draggingRef = useRef(false);
  function onCellDown(cell: Cell) {
    draggingRef.current = true;
    setAnchor(cell);
    setFocus(cell);
  }
  function onCellEnter(cell: Cell) {
    if (draggingRef.current) setFocus(cell);
  }
  function endDrag() {
    draggingRef.current = false;
  }

  // THE HANDLE, AND WHY A PHONE NEEDS ONE. A touch pointer is implicitly
  // captured by the element the finger went down on, so `onPointerEnter`
  // above never fires for the cells a finger is dragged across: the same
  // drag that selects B3:D6 with a mouse selected B3 alone on a phone,
  // which is what scripts/tests/sheets.prodtest.mjs caught on the 390px
  // profile on 2026-10-31. And `touch-action: none` on the grid is not
  // the fix — it would take away scrolling, which is what a finger drag
  // on a sheet is FOR.
  //
  // So the corner handle Excel and Sheets both have: it is the one thing
  // with `touch-action: none`, it captures the pointer, and it reads the
  // cell under the finger out of the DOM. It is ONE element positioned by
  // arithmetic rather than one rendered inside the corner cell, because a
  // handle living inside a cell unmounts the moment the range grows past
  // it — and an unmounted element loses the pointer capture, so the drag
  // would stop after the first cell.
  function extendTo(clientX: number, clientY: number) {
    if (typeof document === "undefined") return;
    const under = document.elementFromPoint(clientX, clientY)?.closest("[data-cell]");
    const cell = cellFromName(under?.getAttribute("data-cell") ?? "");
    if (cell) setFocus(cell);
  }

  function goTo(sheet: number) {
    setActiveSheet(sheet);
    setAnchor({ row: 0, col: 0 });
    setFocus({ row: 0, col: 0 });
  }

  // THE NEXT SHEET'S NUMBER LIVES IN A REF, AND THE UPDATER IS PURE.
  //
  // The first version of this put `setActiveSheet(next)` INSIDE the
  // `setSheets` updater, to get the number and the open tab from one
  // source. It worked on the first press and on the second — and then,
  // after pressing «Φύλλο 1», the screen went back to «Φύλλο 3» while
  // `aria-pressed` still said the first tab was open. React may replay a
  // state updater (StrictMode double-invokes it, and a re-processed
  // queue runs it again), so a setter called inside one fires again
  // later and writes an old value over a new one. The updater has to be
  // pure; this is that rule, caught in a screenshot rather than in a
  // gate, 2026-10-31.
  //
  // A ref rather than `sheets[sheets.length - 1] + 1`, because an event
  // handler sees the state of its own render: two presses inside one
  // tick would both read the same array and both ask for the same
  // number. An event handler is not replayed, so the counter is safe
  // where the updater is not.
  const nextSheetRef = useRef(2);
  function addSheet() {
    const next = nextSheetRef.current;
    nextSheetRef.current = next + 1;
    setSheets((current) => [...current, next]);
    goTo(next);
  }

  function send(text: string) {
    const said = text.trim();
    if (!said) return;
    setOpen(true);
    setTurns((current) => [
      ...current,
      { id: `u${current.length}`, role: "user", text: said },
      // HONEST, NOT ENCOURAGING. Building the table from a description is
      // his Κομμάτι 3; answering "done" here, or quietly filling cells
      // with invented numbers, is exactly what this screen must not do.
      { id: `t${current.length}`, role: "tool", text: t("soon") },
    ]);
  }

  const work = open
    ? {
        title: t("work.title"),
        actions: !editor && (
          // THE ONE WHITE BUTTON HE ASKED FOR («Ένα λευκό κουμπί
          // «Download»»), drawn and inert. The dot in its corner is this
          // product's own mark for "a real control with no pipeline
          // behind it yet"; xlsx and csv with the formulas intact is his
          // Κομμάτι 8. This is why the page's entry in
          // scripts/tests/one-primary-action.test.mjs is 2 and not 1 —
          // the reason is written there, beside the number. The editor
          // layout draws the same button from `primary` below instead,
          // without the corner dot (its PrimaryButton draws one shape
          // only, components/shell/editor-shell.tsx) — the «soon» tooltip
          // still says why it does nothing.
          <button
            type="button"
            disabled
            aria-label={t("download")}
            title={t("downloadSoon")}
            data-testid="sheets-download"
            className="relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-card bg-button px-2.5 text-sm font-semibold text-button-ink opacity-60 sm:px-3"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("download")}</span>
            <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-button-ink/50" aria-hidden="true" />
          </button>
        ),
        primary: editor
          ? {
              label: t("download"),
              onClick: () => {},
              disabled: true,
              icon: <Download className="h-4 w-4" aria-hidden="true" />,
            }
          : undefined,
        body: (
          <div className="flex h-full min-h-0 flex-col gap-2">
            {/* ΜΠΑΡΑ ΤΥΠΩΝ ΑΠΟ ΠΑΝΩ. It reads the selection: the
                reference on the left, the cell's contents on the right.
                A read-out, not a field — typing a formula is Κομμάτι 5,
                and the shared shell allows exactly one thing on a screen
                that takes keys (scripts/tests/tool-shell.test.mjs). */}
            <div
              data-testid="sheets-formula-bar"
              className="flex shrink-0 items-center gap-2 rounded-item border border-border bg-panel px-2 py-1.5"
            >
              <span
                data-testid="sheets-selection"
                className="min-w-[4.5rem] shrink-0 rounded-item bg-panel-hover px-2 py-1 text-center text-xs tabular-nums text-foreground"
              >
                {selectedCount > 1
                  ? `${cellName(range.top, range.left)}:${cellName(range.bottom, range.right)}`
                  : cellName(anchor.row, anchor.col)}
              </span>
              <span className="shrink-0 text-xs text-muted">{t("formula.label")}</span>
              <span data-testid="sheets-formula-value" className="min-w-0 flex-1 truncate text-xs text-muted">
                {t("formula.empty")}
              </span>
              {selectedCount > 1 && (
                <span data-testid="sheets-selected-count" className="shrink-0 text-[11px] tabular-nums text-muted">
                  {t("formula.selected", { count: selectedCount })}
                </span>
              )}
            </div>

            {/* Ο ΠΙΝΑΚΑΣ ΣΤΟ ΚΕΝΤΡΟ. */}
            <div
              ref={scrollerRef}
              onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              // THE GRID SITS ON THE APP'S OWN WORK SURFACE, NOT ON
              // `bg-paper`. Paper is pure white (globals.css: "a user's
              // own content, because that is what it will look like when
              // it is published"), and on it this screen's own marks are
              // invisible: the reference pill was `text-foreground` on
              // white, the selected range was white at 15% over white,
              // and the anchor's ring was a white ring on white. Every
              // one of those was in the first screenshot of 2026-10-31
              // and none of them in any gate — which is why the
              // screenshots are part of the piece, not a souvenir of it.
              data-testid="sheets-grid"
              data-rows={SHEET_ROWS}
              data-columns={SHEET_COLUMNS}
              className="min-h-0 flex-1 select-none overflow-auto rounded-item border border-border bg-workspace"
            >
              <div className="relative" style={{ width: ROW_HEADER_WIDTH + SHEET_COLUMNS * COL_WIDTH }}>
                <div className="sticky top-0 z-20 flex bg-panel">
                  <span
                    className="sticky start-0 z-30 shrink-0 border-b border-e border-divider bg-panel"
                    style={{ width: ROW_HEADER_WIDTH, height: ROW_HEIGHT }}
                  />
                  {columns.map((col) => (
                    <span
                      key={col}
                      data-testid="sheets-column-head"
                      className="shrink-0 border-b border-e border-divider text-center text-[11px] font-medium leading-[28px] text-muted"
                      style={{ width: COL_WIDTH, height: ROW_HEIGHT }}
                    >
                      {columnName(col)}
                    </span>
                  ))}
                </div>
                {/* The rows above the window, as height rather than as
                    elements — this is the whole trick, and it is why ten
                    thousand rows cost the browser thirty. */}
                <div style={{ height: firstRow * ROW_HEIGHT }} />
                {rows.map((row) => (
                  <div key={row} className="flex" style={{ height: ROW_HEIGHT }}>
                    <span
                      data-testid="sheets-row-head"
                      className="sticky start-0 z-10 shrink-0 border-b border-e border-divider bg-panel text-center text-[11px] leading-[28px] tabular-nums text-muted"
                      style={{ width: ROW_HEADER_WIDTH }}
                    >
                      {row + 1}
                    </span>
                    {columns.map((col) => {
                      const inRange =
                        row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
                      const isAnchor = row === anchor.row && col === anchor.col;
                      return (
                        <span
                          key={col}
                          role="gridcell"
                          aria-selected={inRange}
                          data-testid="sheets-cell"
                          data-cell={cellName(row, col)}
                          onPointerDown={() => onCellDown({ row, col })}
                          onPointerEnter={() => onCellEnter({ row, col })}
                          className={`shrink-0 border-b border-e border-divider text-xs leading-[28px] ${
                            isAnchor ? "bg-foreground/15 ring-1 ring-inset ring-foreground" : inRange ? "bg-foreground/15" : ""
                          }`}
                          style={{ width: COL_WIDTH }}
                        />
                      );
                    })}
                  </div>
                ))}
                <div style={{ height: Math.max(0, (SHEET_ROWS - lastRow) * ROW_HEIGHT) }} />
                {/* ARIA-HIDDEN, AND THAT IS THE HONEST LABEL. This is a
                    pointer affordance and nothing else: it is 14px, so it
                    would fail the product's own 44px tap-target rule if it
                    claimed to be a button, and a 44px invisible hit area
                    around it would swallow taps on the four cells it
                    covers. Selecting a range from the keyboard, and with a
                    screen reader, belongs to the owner's Κομμάτι 4, where
                    selection gets its own round — a single cell is already
                    selectable by tapping it. */}
                <span
                  aria-hidden="true"
                  title={t("extend")}
                  data-cell-handle={cellName(range.bottom, range.right)}
                  data-testid="sheets-handle"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    draggingRef.current = true;
                  }}
                  onPointerMove={(e) => {
                    if (draggingRef.current) extendTo(e.clientX, e.clientY);
                  }}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="absolute z-10 h-3.5 w-3.5 cursor-crosshair rounded-item border border-workspace bg-foreground"
                  style={{
                    insetInlineStart: ROW_HEADER_WIDTH + (range.right + 1) * COL_WIDTH - 7,
                    top: ROW_HEIGHT + (range.bottom + 1) * ROW_HEIGHT - 7,
                    touchAction: "none",
                  }}
                />
              </div>
            </div>

            {/* ΚΑΡΤΕΛΕΣ ΦΥΛΛΩΝ ΑΠΟ ΚΑΤΩ. */}
            <div data-testid="sheets-tabs" className="flex shrink-0 items-center gap-1 overflow-x-auto">
              {sheets.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === activeSheet}
                  onClick={() => goTo(n)}
                  data-testid="sheets-tab"
                  className={`min-h-[44px] shrink-0 rounded-item px-3 text-xs ${
                    n === activeSheet ? "bg-panel text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
                  }`}
                >
                  {t("sheet.tab", { n })}
                </button>
              ))}
              <button
                type="button"
                onClick={addSheet}
                aria-label={t("sheet.add")}
                title={t("sheet.add")}
                data-testid="sheets-add"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ),
      }
    : null;

  return (
    <ToolShell
      name={tNames("sheets")}
      turns={turns}
      placeholder={t("placeholder")}
      sending={false}
      onSend={send}
      empty={{
        heading: t("empty.heading"),
        why: t("empty.why"),
        examples: [
          { key: "budget", label: t("empty.examples.budget") },
          { key: "stock", label: t("empty.examples.stock") },
          { key: "pricelist", label: t("empty.examples.pricelist") },
        ],
      }}
      footer={
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted" data-testid="sheets-limits">
          {t("limits")}
        </p>
      }
      work={work}
      onCloseWork={() => setOpen(false)}
    />
  );
}
