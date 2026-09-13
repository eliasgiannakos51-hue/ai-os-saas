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
 *
 * AND IT WAS NOT FINISHED UNTIL 2026-09-13. The paragraph above described
 * the consolidation in the past tense while three holdouts were still
 * writing the number themselves: overview/page.tsx and
 * energy-checkin-widget.tsx each declared a local DAY_MS, and
 * lib/reflection.ts imported DAY_MS from here and then declared its own
 * `WEEK_MS = 7 * DAY_MS` one line down. All three now import. WEEK_MS had
 * no importer at all until reflection.ts became one, and HOUR_MS had none
 * and was deleted — api/cron/agent-runs and api/websites/[id]/submit-form
 * both still write `60 * 60 * 1000` inline, so an HOUR_MS here was a
 * fourth spelling of a number nobody was coming to collect.
 *
 * To check the holdouts have not come back:
 *   grep -rn "60 \* 60 \* 1000\|24 \* 60 \* 60 \* 1000" src
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
