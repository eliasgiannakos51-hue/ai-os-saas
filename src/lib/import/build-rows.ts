// Turning mapped columns into rows ready to insert.
//
// Client-safe, and used on both sides on purpose: the preview the user
// confirms is built by this exact function in the browser, and the
// server rebuilds with it from its own re-parse of the bytes. What the
// user approved and what gets written are therefore the same
// computation, not two implementations that agree until they don't.
//
// Nothing here touches the database. It takes strings and returns
// objects, which is what makes the whole conversion — the part where a
// business's numbers can silently become wrong — testable against
// fixtures.

import { ENUM_SYNONYMS, coerceDate, coerceEnum, coerceNumber, type DateOrder } from "@/lib/import/coerce";
import type { ImportTarget } from "@/lib/import/targets";
import type { ColumnMapping } from "@/lib/import/map-columns";

export type BuiltRow = Record<string, string | number | null>;

export type RowRejection = {
  /** 1-based, counting the header as row 1, so it matches what the user
   *  sees in their spreadsheet. */
  rowNumber: number;
  reason: string;
};

export type BuildResult = {
  rows: BuiltRow[];
  rejected: RowRejection[];
  /** Per-field counts of values that could not be coerced but did not
   *  reject the row — a date column that is half empty is worth knowing
   *  about before importing, not after. */
  coercionFailures: Record<string, number>;
};

/** Rejections we will describe individually. Beyond this the user gets a
 *  count: a list of 4,000 identical failures is not a report. */
export const MAX_REPORTED_REJECTIONS = 20;

export function buildRows(params: {
  target: ImportTarget;
  headers: string[];
  rows: string[][];
  mappings: ColumnMapping[];
  dateOrder: DateOrder;
}): BuildResult {
  const { target, headers, rows, mappings, dateOrder } = params;

  // Column NAME to index, resolved once. The mapping travels by name so
  // it survives a re-parse; the lookup happens here.
  const indexOf = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!indexOf.has(header)) indexOf.set(header, index);
  });

  const active = mappings
    .filter((m): m is ColumnMapping & { field: string } => Boolean(m.field))
    .map((m) => ({ field: m.field, index: indexOf.get(m.column) ?? -1 }))
    .filter((m) => m.index >= 0);

  const fieldByKey = new Map(target.fields.map((f) => [f.key, f]));
  const built: BuiltRow[] = [];
  const rejected: RowRejection[] = [];
  const coercionFailures: Record<string, number> = {};

  const noteFailure = (key: string) => {
    coercionFailures[key] = (coercionFailures[key] ?? 0) + 1;
  };

  for (let r = 0; r < rows.length; r++) {
    const source = rows[r];
    const row: BuiltRow = {};
    // A signed amount, kept aside: `finance_entries.type` is derived
    // from it when the file has no in/out column, and `trades.result`
    // from the P&L when there is no result column.
    let signedAmount: number | null = null;
    let sawAmountColumn = false;

    for (const { field, index } of active) {
      const config = fieldByKey.get(field);
      if (!config) continue;
      const raw = source[index] ?? "";

      if (config.type === "number") {
        if (field === "amount" || field === "pnl") sawAmountColumn = true;
        const parsed = coerceNumber(raw);
        if (!parsed.ok) {
          if (raw.trim()) noteFailure(field);
          row[field] = null;
          continue;
        }
        if (field === "amount") {
          signedAmount = parsed.value;
          // `amount` is stored POSITIVE; the direction lives in `type`.
          // Storing a signed amount as well as a type would let the two
          // disagree, and then no report could be trusted.
          row[field] = Math.abs(parsed.value);
        } else {
          if (field === "pnl") signedAmount = parsed.value;
          row[field] = parsed.value;
        }
        continue;
      }

      if (config.type === "date") {
        const parsed = coerceDate(raw, dateOrder);
        if (!parsed.ok) {
          if (raw.trim()) noteFailure(field);
          // Null, never "now". A row whose date could not be read does
          // not know when it happened, and writing today's date into it
          // would manufacture a fact that every time-based insight would
          // then be built on.
          row[field] = null;
          continue;
        }
        row[field] = parsed.value;
        continue;
      }

      if (config.type === "enum") {
        const value = coerceEnum(raw, config.options ?? [], ENUM_SYNONYMS[field] ?? {});
        if (value === null && raw.trim()) noteFailure(field);
        row[field] = value;
        continue;
      }

      const text = raw.trim();
      row[field] = text ? text.slice(0, 2000) : null;
    }

    // Derivations, applied only where the file did not supply the value.
    if (fieldByKey.has("type") && !row.type && signedAmount !== null) {
      // A bank export has one signed column and no in/out flag. The sign
      // IS the direction, and it is the user's own data — not a guess.
      row.type = signedAmount < 0 ? "expense" : "income";
    }
    if (fieldByKey.has("result") && !row.result && typeof row.pnl === "number") {
      row.result = row.pnl > 0 ? "win" : row.pnl < 0 ? "loss" : "breakeven";
    }

    // A row where every mapped column was empty is a spacer line, not a
    // record. Checked BEFORE the required-field test, and that ordering
    // is the whole point: hand-maintained sheets are full of blank rows
    // at the bottom, and testing "is it valid" first turns every one of
    // them into a "missing Description" error. Twenty unactionable
    // errors is how a user concludes the importer is broken.
    const everyMappedCellEmpty = active.every(({ index }) => (source[index] ?? "").trim() === "");
    if (everyMappedCellEmpty) continue;

    // Required fields decide whether the row survives. A row missing the
    // thing that identifies it is not a row.
    const missing = target.fields
      .filter((f) => f.required)
      .filter((f) => {
        const value = row[f.key];
        return value === null || value === undefined || value === "";
      })
      .map((f) => f.label);

    if (missing.length > 0) {
      if (rejected.length < MAX_REPORTED_REJECTIONS) {
        rejected.push({ rowNumber: r + 2, reason: `missing ${missing.join(", ")}` });
      } else {
        rejected.push({ rowNumber: r + 2, reason: "" });
      }
      continue;
    }

    // `sawAmountColumn` exists so a target that has a numeric field the
    // file simply did not map is not mistaken for a parse failure.
    void sawAmountColumn;

    built.push(row);
  }

  return { rows: built, rejected, coercionFailures };
}

/** The values a preview shows: the first few built rows, with their
 *  source, so the user compares what they uploaded against what will be
 *  stored rather than trusting a description of it. */
export function previewPairs(params: {
  headers: string[];
  rows: string[][];
  built: BuiltRow[];
  count?: number;
}): { source: Record<string, string>; result: BuiltRow }[] {
  const count = params.count ?? 5;
  const out: { source: Record<string, string>; result: BuiltRow }[] = [];

  for (let i = 0; i < Math.min(count, params.built.length, params.rows.length); i++) {
    const source: Record<string, string> = {};
    params.headers.forEach((header, index) => {
      source[header] = params.rows[i][index] ?? "";
    });
    out.push({ source, result: params.built[i] });
  }
  return out;
}
