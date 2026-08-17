/**
 * Which job a page that just opened should be shown — the rule, with no
 * database and no network in it, so it can be tested for what it is.
 *
 * THE FAILURE THIS EXISTS TO PREVENT IS A DOUBLE CHARGE. A user starts an
 * agent build, changes page while it runs, and comes back. The work
 * finished — it is a background job, that is the whole point — but the
 * page's "is anything running?" query only ever asked for queued and
 * running rows, so the finished draft was invisible. Nothing on the screen
 * said the work existed. The only thing left to do was ask for it again,
 * and that second ask was a second real charge on a real card.
 *
 * So a finished result is offered too, but only until the user has
 * actually seen it, and only for a day. Those two conditions are not
 * decoration:
 *
 *   Without consumed_at, every reload for the next 24 hours re-offers the
 *   same preview the user already read and dismissed.
 *
 *   Without the window, opening the Agents page a week later greets you
 *   with a draft you forgot asking for, and "Create" on it does something
 *   you no longer want.
 */

/**
 * How long a finished-but-unseen result stays on offer.
 *
 * A day, because that is the span over which "I was in the middle of
 * something" is still true — a lunch break, an evening, a night's sleep.
 * Beyond it the result stops being a resumption and starts being a
 * surprise, and a surprise attached to a Create button is worse than
 * making the user ask again.
 */
export const JOB_RESULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The columns this decision reads. Deliberately a subset: the rule must
 *  not depend on anything the poll does not already return. */
export type ResumableJobRow = {
  status?: unknown;
  consumed_at?: unknown;
  finished_at?: unknown;
  created_at?: unknown;
};

/** Still owed an outcome — always shown, whatever else is true of it. */
export function isActiveRow(row: ResumableJobRow | null | undefined): boolean {
  const status = String(row?.status ?? "");
  return status === "queued" || status === "running";
}

/**
 * A finished result the user has never been shown, recent enough to still
 * be the thing they were doing.
 *
 * FAILED JOBS ARE NOT RESUMABLE, and that is not an oversight. A failed
 * job has already given the credits back (run-job's failJob and reapJob
 * both refund before they write), so there is no double charge to prevent
 * — and re-announcing yesterday's error every time the page opens is
 * noise, not a resumption.
 */
export function isResumableRow(
  row: ResumableJobRow | null | undefined,
  now: Date = new Date()
): boolean {
  if (!row) return false;
  if (String(row.status ?? "") !== "done") return false;
  // Any value at all means it has been on screen. Written by the server as
  // a timestamp, but the test is truthiness so that a stub or an older
  // driver returning `true` cannot accidentally re-offer a seen result.
  if (row.consumed_at) return false;

  // finished_at is written by every terminal path in run-job; created_at
  // is NOT NULL by schema. The fallback is for the un-migrated middle
  // ground, not for a state the app can reach on purpose.
  const stamp = row.finished_at ?? row.created_at;
  if (typeof stamp !== "string" || !stamp) return false;
  const at = Date.parse(stamp);
  // Undateable means un-ageable, and rule (γ) is that nothing older than
  // the window is offered whatever its consumed_at says. A row that cannot
  // be shown to be inside the window is therefore not offered.
  if (!Number.isFinite(at)) return false;

  const age = now.getTime() - at;
  // A stamp in the future is clock skew between two machines, not a job
  // from tomorrow. Fresh, not expired — the opposite reading would hide a
  // result the user is at that moment waiting for.
  if (age < 0) return true;
  return age <= JOB_RESULT_WINDOW_MS;
}

/**
 * The one decision, made once: of the candidate rows, which is the job
 * this page should adopt?
 *
 * ACTIVE BEATS FINISHED, always. Two jobs of one kind can overlap — start
 * one, start another, the second finishes first — and in that case the
 * page must attach to the one still spending credits, not to the one that
 * has already stopped. Ordering by created_at alone gets this wrong
 * exactly when it matters most.
 */
export function pickResumableJob<T extends ResumableJobRow & { created_at?: unknown }>(
  rows: readonly (T | null | undefined)[],
  now: Date = new Date()
): T | null {
  const present = rows.filter((row): row is T => Boolean(row));
  // Newest first, and the sort is here rather than assumed of the caller:
  // a rule that silently depends on its input already being ordered is a
  // rule that breaks the first time someone adds a second query.
  //
  // An undateable row sorts LAST rather than producing NaN. A NaN
  // comparator does not order anything — it leaves the array in whatever
  // arrangement the engine's sort happened to reach, which is a rule that
  // works in testing and picks a different job in production.
  const ms = (value: unknown): number => {
    const at = Date.parse(String(value ?? ""));
    return Number.isFinite(at) ? at : Number.NEGATIVE_INFINITY;
  };
  // Compared, not subtracted: two undateable rows are both -Infinity, and
  // `-Infinity - -Infinity` is NaN — the very thing the line above exists
  // to avoid.
  const newestFirst = [...present].sort((a, b) => {
    const left = ms(a.created_at);
    const right = ms(b.created_at);
    return left === right ? 0 : right > left ? 1 : -1;
  });
  return (
    newestFirst.find((row) => isActiveRow(row)) ??
    newestFirst.find((row) => isResumableRow(row, now)) ??
    null
  );
}
