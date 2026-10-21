/**
 * A LINE DIFF, HAND-ROLLED — same reasoning as lib/coding/highlight.ts's
 * own tokenizer: the alternative is a vendored library whose output this
 * file would have to trust, in a product whose whole second half is
 * "here is a change to your code, read it before it lands." Code-block.tsx
 * already explains why syntax colour is drawn from TOKENS rather than
 * innerHTML; this is the same argument for the lines themselves — a diff
 * this file computed can be a diff this file is wrong about, not a diff
 * some other maintainer's one is wrong about.
 *
 * Classic LCS over lines (Myers' is the same result, faster on huge
 * inputs; code pasted into a chat box is not huge inputs — MAX_DIFF_LINES
 * below is the guard for the day it is).
 *
 * Pure. No DOM, no React, no network — scripts/tests/coding-diff.test.mjs
 * runs this file directly.
 */

export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

/** Lines beyond this are not diffed — see diffLines' own fallback. A
 *  pasted file this long is already past what a reviewer reads line by
 *  line, and the DP table below is O(n*m): two 5,000-line files would be
 *  25 million cells. */
export const MAX_DIFF_LINES = 2_000;

function splitLines(text: string): string[] {
  // "" splits to [""], one empty line — right for an empty file, and
  // consistent with how a trailing newline in a real file reads: the
  // split on "a\nb\n" is ["a", "b", ""], which is the same shape every
  // other line-based tool in this codebase (e.g. the website builder's
  // line-count checks) already expects.
  return text.split("\n");
}

/**
 * The longest common subsequence, by LINE, between two line arrays.
 * Returns the standard DP table so the caller can walk it back into an
 * edit script — kept separate from diffLines so the table itself is
 * independently testable against a known-small case.
 */
export function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/**
 * THE EDIT SCRIPT: same / add / remove, one entry per line of either
 * side. Walking the table from (0,0) forward reproduces the diff in
 * document order; walking it backward (the usual LCS presentation)
 * would need a reverse at the end, which is one more place to get a
 * line's position wrong, so this walks forward from a table built
 * backward instead.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  // THE FALLBACK IS NOT "NO DIFF", IT IS "NO LINE-LEVEL DIFF": still two
  // real sides, just not broken into same/add/remove — a caller that
  // only ever reads `.kind` sees every line of `before` removed and
  // every line of `after` added, which renders correctly (if bluntly)
  // rather than throwing or silently truncating.
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return [...a.map((text): DiffLine => ({ kind: "remove", text })), ...b.map((text): DiffLine => ({ kind: "add", text }))];
  }

  const table = lcsTable(a, b);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: "remove", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < a.length) out.push({ kind: "remove", text: a[i++] });
  while (j < b.length) out.push({ kind: "add", text: b[j++] });
  return out;
}

/** True when a diff is worth SHOWING as a diff — a file that changed not
 *  at all should render as plain code, not as a wall of unchanged
 *  "same" lines with a diff gutter nobody needed. */
export function diffHasChanges(lines: readonly DiffLine[]): boolean {
  return lines.some((l) => l.kind !== "same");
}
