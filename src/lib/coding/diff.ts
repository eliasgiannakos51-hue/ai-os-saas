/**
 * A LINE DIFF FOR THE WORK PANEL, NOT FOR A PATCH FILE.
 *
 * The owner's critical message of 2026-10-22 asked for an edit turn to
 * show "αλλαγές σε κουτιά με πράσινο και κόκκινο" — changes in boxes,
 * green and red — the same shape Claude Code itself shows. This is the
 * shortest-edit-script diff (the same idea `git diff` uses) over LINES,
 * not characters: cheap enough to run on every edit, and a code review
 * is read a line at a time anyway.
 *
 * ABOVE THE CEILING, NO O(n*m) TABLE. A paste near MAX_INPUT_CHARS
 * (24,000) can run to a few thousand lines, and the classic DP table is
 * quadratic in line count — a diff nobody asked to wait ninety seconds
 * for. Past the ceiling every old line is shown removed and every new
 * line added: still correct (a change really did happen, and both sides
 * are still fully visible), just not the shortest edit script.
 *
 * Pure. No DOM, no SDK.
 */

export type DiffLineKind = "same" | "added" | "removed";
export type DiffLine = { kind: DiffLineKind; text: string };

export const DIFF_LCS_LINE_CEILING = 400;

export function diffLines(oldCode: string, newCode: string): DiffLine[] {
  // split("\n") on "" is [""], one phantom empty line — not the zero
  // lines a truly empty side has.
  const a = oldCode === "" ? [] : oldCode.split("\n");
  const b = newCode === "" ? [] : newCode.split("\n");

  if (a.length > DIFF_LCS_LINE_CEILING || b.length > DIFF_LCS_LINE_CEILING) {
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ];
  }

  const n = a.length;
  const m = b.length;
  // dp[i][j] = length of the longest common subsequence of a[i..] and
  // b[j..]. Built from the bottom-right corner so the walk below reads
  // it forward.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      out.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}
