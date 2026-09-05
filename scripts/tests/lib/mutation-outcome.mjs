// WHAT A MUTATION SUITE'S RUN ACTUALLY MEANT — green, skipped, or red.
//
// WHY THIS IS ITS OWN FILE AND NOT FOUR LINES INSIDE run-mutations.mjs.
// The runner reported this, verbatim, on 2026-09-05:
//
//     OK   user-isolation                                0s
//     ...
//     89 suites · 89 green · 0 red
//     ALL MUTATION SUITES GREEN
//
// user-isolation.mutation.mjs mutates the DATABASE SCHEMA. With no
// DATABASE_URL it prints one line — "SKIPPED: no DATABASE_URL /
// PGDATABASE — this file needs a real Postgres." — and exits 0. Nine
// mutants, none of them applied, none of them caught, and the summary
// counted the file as one of the eighty-nine green. That is the same
// shape the whole directory exists to catch: an instrument reporting a
// pass for something it never ran.
//
// The runner already parses stdout — MISSED and STALE are both read out
// of it — so reading one more marker costs nothing. (scripts/db/
// run-dbtests.mjs deliberately does NOT do this and says so in its own
// header: its skip is an unreachable Postgres, and failing a build over
// infrastructure it does not control would be worse. The difference is
// that run-dbtests prints "SKIPPED" as its ONLY line and nothing above
// it claims a count; run-mutations prints a green tally.)
//
// Kept separate from the runner so it can be exercised on captured
// stdout without spawning ninety suites: scripts/tests/
// mutation-runner-honesty.test.mjs does exactly that.
//
// Held by: scripts/tests/mutation-runner-honesty.test.mjs (this file is a
// library, not a script — there is nothing here to run on its own, so no
// Run: header, which self-claims requires to name its own file).

// A suite that caught something says CAUGHT. Every one of the ninety
// prints it, once per mutant it killed — checked by the honesty test
// against the real files, not asserted here.
const CAUGHT = /^\s*CAUGHT\b/m;

// The skip lines the suites actually print, read off the files rather
// than guessed: "SKIPPED: ...", "SKIP: ..." and "<name>: SKIPPED — ...".
//
// The first draft of this line was /SKIPPED?\b/ and it read "SKIP:" as
// NOT a skip — `?` binds to the last character, so `SKIPPED?` needs
// "SKIPPE" before it will match anything. mrr-paid-only.dbtest.mjs
// prints exactly "SKIP:". A regex that silently under-matches inside a
// gate against silent under-reporting is the same bug one level up, so
// it is spelled out here rather than left as a fixed typo.
const SKIP = /^\s*(?:\S+:\s*)?SKIP(?:PED)?\b\s*[:—-]/m;

export function missedFrom(stdout) {
  return [...stdout.matchAll(/^\s*MISSED\s+(.*)$/gm)].map((m) => m[1].trim());
}

export function staleFrom(stdout) {
  const stale = [
    ...stdout.matchAll(/^\s*STALE\s+(.*)$/gm),
    ...stdout.matchAll(/^\s*ERROR\s+(.*?): target not found.*$/gm),
  ].map((m) => m[1].trim());
  const fromSummary = [...stdout.matchAll(/^\s*-\s*(.*)\n\s*the mutation target no longer exists.*$/gm)].map((m) =>
    m[1].trim()
  );
  for (const s of fromSummary) if (!stale.includes(s)) stale.push(s);
  return stale;
}

// THE SKIP IS DECIDED BY WHAT RAN, NOT BY THE EXIT CODE. A suite that
// exits 0 having killed nothing and having said it was skipping is
// skipped. A suite that exits 0 with CAUGHT lines is green even if some
// later line happens to contain the word — hence CAUGHT winning.
export function classify({ stdout = "", status = 0, leaked = [] } = {}) {
  const missed = missedFrom(stdout);
  const stale = staleFrom(stdout);
  if (status !== 0 || leaked.length > 0) return { outcome: "red", missed, stale };
  if (!CAUGHT.test(stdout) && SKIP.test(stdout)) return { outcome: "skipped", missed, stale };
  return { outcome: "green", missed, stale };
}
