/**
 * TAKE BACK THE LAST CHANGE (MASTER 16, package 10; ΣΥΣΤΗΜΑ DESIGN §7
 * «αναίρεση»), behind the switch "site-pages".
 *
 * website_versions already holds the WHOLE site after every generation and
 * every change (api/websites/edit, "THE WHOLE SITE, not the page that
 * changed"), append-only. Undo adds one more row: a copy of the state
 * before the last change, marked UNDO_MARK. Nothing is deleted.
 *
 * WHICH STATE IS "BEFORE" is read by replaying the history: every ordinary
 * row is a state pushed on a stack, and every undo row takes the top one
 * off. So pressing undo twice goes back two changes — it never redoes —
 * and a change made after an undo is undone in its turn.
 *
 * Held by scripts/tests/site-pages.test.mjs.
 */

export const UNDO_MARK = "[undo]";

export type VersionRow = { id: string; created_at: string; version_number: number; change_description: string | null };

const isUndo = (row: VersionRow) => (row.change_description ?? "").startsWith(UNDO_MARK);

/**
 * The row whose state undo restores, and the row it takes back — or null
 * when there is nothing to take back (the site as first generated).
 */
export function undoTarget(rows: readonly VersionRow[]): { restore: VersionRow; undoes: VersionRow } | null {
  const ordered = [...rows].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.version_number - b.version_number
  );
  const stack: VersionRow[] = [];
  for (const row of ordered) {
    if (isUndo(row)) {
      if (stack.length > 1) stack.pop();
    } else {
      stack.push(row);
    }
  }
  if (stack.length < 2) return null;
  return { restore: stack[stack.length - 2], undoes: stack[stack.length - 1] };
}

/** What the undo row says, so the history reads as what happened. */
export function undoDescription(undone: VersionRow): string {
  const said = (undone.change_description ?? "").trim();
  return `${UNDO_MARK} ${said || `v${undone.version_number}`}`.slice(0, 500);
}
