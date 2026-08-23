/**
 * How long a day is, once.
 *
 * Six modules had their own `const DAY_MS = 24 * 60 * 60 * 1000` —
 * health-score, user-context, achievements, reflection, next-action and
 * a function-scoped one in timeline. All six agreed, which is why nobody
 * noticed; six copies of a number that must never disagree is a bug
 * waiting for the first person who changes one.
 *
 * It surfaced as a tooling failure rather than a product one:
 * scripts/tests/load-ts.mjs bundles a module with its local imports by
 * CONCATENATION, so two files that both declare DAY_MS produce
 * "Identifier 'DAY_MS' has already been declared" — and lib/user-context.ts,
 * which imports lib/health-score.ts, could not be loaded by any test at
 * all. A whole module was untestable because of a duplicated constant.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
