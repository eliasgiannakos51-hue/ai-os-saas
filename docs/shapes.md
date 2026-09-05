# The shapes

A catalogue of the ways a statement in this repository has been wrong while
looking right. Every entry is tied to a **real incident here** — a defect
that shipped, or an instrument that reported health it had not measured —
and names what catches it now.

## They have names, not numbers, and that is the point of this file

The working list numbered them 1–23 and **the numbering drifted**. Two
comments in the code numbered themselves independently:
`scripts/tests/language-extremes.test.mjs` called the technically-true
comment "the NINTH shape" where the working list had it at sixteen, and
`scripts/tests/gate-state-vs-behaviour.test.mjs` called state-vs-behaviour
"the seventeenth", which did match — but nothing anywhere made either
checkable. A third, in `scripts/tests/gate-vacuity.test.mjs`, numbers four
shapes *within its own file* and never meant the global list at all.

A number that two files disagree about is worse than no number: a reader
who follows one to the wrong entry stops trusting the other. So the
entries below are **deliberately unnumbered**, they are referred to by
name, and the reference has one spelling:

    SHAPE: stale anchor

`scripts/tests/shape-names.test.mjs` fails the build on a `SHAPE:` that
names nothing here, and on any comment that writes "the Nth shape" outside
the short list of local enumerations it carries with reasons.

Shapes 1–7 of the old working list are **not** reproduced. No incident in
this repository can be sourced to them, and writing them out from memory
is the exact unchecked claim this file exists to stop.

---

## Stale anchor

A mutation's `from` string stops existing, so the suite silently tests
nothing and reports the same green it reported when it worked.

*Incidents:* six. The most recent two were caused by V4.6's own changes,
and two more in `scripts/tests/icu-quoted-placeholders.mutation.mjs`
pointed at a quoting form the catalogue had moved away from.

*Caught by:* every suite reports `STALE` and exits non-zero;
`scripts/check-mutation-tree.mjs` enumerates all 1,518 anchors;
`scripts/tests/gate-stale-anchors.test.mjs` checks the shape of the check.

## Vacuous assertion

`check("no X", found.length === 0)` over a scan that found no files at
all. The check passes hardest when it is most broken.

*Incidents:* twice in V4.6, in gates written that same day. Then twice
more in `scripts/tests/user-isolation.dbtest.mjs`, both found by its own
mutation suite: the population of tables was filtered by
`relrowsecurity`, so a table with row-level security switched off
**vanished from the population** and everything went green; and the set of
deliberately sealed tables was read live from `pg_policies`, so dropping a
policy moved its table into the category where "this account sees nothing"
is the expected answer, and the leak became the pass.

*Caught by:* `scripts/tests/gate-vacuity.test.mjs` — every emptiness
assertion over a scanned collection needs a floor.

## A check that cannot go red

`check("applies twice cleanly", true, true)`. The truth being asserted is
that the line was reached.

*Caught by:* `scripts/tests/gate-vacuity.test.mjs`, tautology section.

## Runtime string in an import path

A module specifier assembled at runtime, which no compiler resolves and no
editor follows.

*Caught by:* `scripts/tests/gate-import-paths.test.mjs` — 75 `@/`
specifiers and 2,101 repository paths across 386 gates.

## `-1` in a position comparison

`indexOf` answers "not here" with a number that is also a valid index, so
`>= 0` and `> -1` and a bare truthiness test each mean something different
and only one of them is right.

*Incidents:* five live instances found in V4.6, including a paywall that
would have opened for every free account the day somebody added a plan
slug.

*Caught by:* `scripts/tests/not-found-index.test.mjs` and its eight
mutations; `src/lib/ui/roving-index.ts` makes the not-found case a branch
rather than arithmetic.

## Many mutations in one dimension

A suite with thirty mutants that all vary the same thing. It reports 30/30
while a whole axis goes untested.

*Caught by:* `scripts/tests/mutation-suite-shape.test.mjs`, 527 checks.

## A test that supplies its own arguments

The fixture and the assertion agree because the same hand wrote both, and
neither one touches the product.

*Caught by:* `scripts/tests/mutation-suite-shape.test.mjs`.

## An optimisation that removes without proving what remains

Trimming a message catalogue by 93% and asserting only that it got
smaller. Nothing says the 7% still covers what the screens ask for.

*Caught by:* `scripts/tests/message-slices.test.mjs` — every namespace a
group can reach must be declared.

## A gate whose fixture is safer than production

The check is correct, the assertion can go red, and the database it runs
against is not the one that matters.

*Incident:* `db_exposure_report()` has counted `grant_without_policy`
since 20260917 and reported **zero**. It runs, in
`scripts/tests/grants-and-policies.dbtest.mjs`, against an ephemeral Postgres
built by `scripts/db/bootstrap-supabase.sql` — and that stub set no
default privileges at all, while Supabase grants ALL on every table in
`public` to `anon`, `authenticated` and `service_role`. The stub was a
database far more locked down than production, so the check passed for a
reason production does not have.

The proof it was the stub that was wrong, not the theory: the migrations
in this repository issue **89 targeted `revoke … from authenticated`
statements**, which are no-ops unless the grants exist. They are written
against a database where every new table arrives fully granted.
`20260906000000_revoke_anon_grants.sql` had already fixed the `anon` half
after a sweep of the live database found seventy-eight tables; nobody did
the `authenticated` half, and the instrument that should have said so was
looking at the wrong database.

Correcting the stub turned the check red at **89 (table, verb) pairs** —
`user_credits`, `credit_transactions`, `ai_cost_log`, `affiliate_payouts`
and `production_errors` among them.

*Caught by:* nothing generic, and that is the honest state. What exists is
the stub now modelling Supabase's documented defaults, so this class of
check is measured against something closer to production, and
`scripts/tests/user-isolation.dbtest.mjs`, which impersonates
`authenticated` rather than running as the owning superuser — the thing
that exposed it. A fixture cannot be proven equal to production from
inside the repository; it can only be made to fail loudly, which is the
direction this one now fails in.

## A probe that changes what it measures

The instrument is correct, and running it destroys the thing it was
pointed at.

*Incident:* `scripts/tests/user-isolation.dbtest.mjs` wrote its blanket
UPDATE and DELETE probes with `returning user_id`, to attribute which
account's rows a write had reached. Postgres applies the SELECT policy to
any row an UPDATE or DELETE has to **read**, and naming a column in
RETURNING is reading it — so the RETURNING put back exactly the blindness
the probe existed to get past. Measured on a throwaway table carrying an
unscoped delete policy: `returning 1` deleted both accounts' rows,
`returning user_id` deleted one and left the other account's alone. Two
real leaks were reported as clean, and
`scripts/tests/user-isolation.mutation.mjs` is what said so. The
attribution is now done after the role is dropped, by a superuser, whom no
policy filters.

## A technically-true comment that reads as complete

`src/lib/agents/injection-patterns.ts` said its patterns "cover the
obvious cases in more than one language". True — two of ten. A Spanish
override went through untouched.

*Caught by:* `scripts/tests/language-extremes.test.mjs` — a coverage claim
must name how many.

## A gate measuring final STATE instead of BEHAVIOUR

`scripts/tests/chat-scroll.prodtest.mjs` asserted where the scrollbar
ended up, not that the scroll had happened. A page that never scrolls and
a page already at the bottom look identical to it.

*Caught by:* `scripts/tests/gate-state-vs-behaviour.test.mjs`.

## A wiring check that never sees a VALUE

The owner-only check asked whether a page *mentions* `isAdminEmail` and
*mentions* `notFound`. `void isAdminEmail;` keeps both words, opens the
cost dashboard to every customer, and the check stays green. It was killed
by its own mutation suite the day it was written.

*Caught by:* `scripts/tests/i18n-coverage.test.mjs` reads the guard's
shape; 5/5 mutations.

## A gate that pins a bug the product fixed

`scripts/tests/offline-state.test.mjs` **required** that `/offline` still
said "You're offline" in English and still carried the excuse for why the
page could not be translated. Both were false. Fixing the page meant
turning a gate red.

*Caught by:* replaced with checks on what has to be true for a Greek
reader with no network; `scripts/tests/offline-locale.mutation.mjs`, 6/6.

## A statement that was once true and nobody re-asked

*Incidents:* the README said two cron jobs were unscheduled; both had been
in `vercel.json` for weeks. `scripts/tests/i18n-coverage.test.mjs`'s
header said "86 of these still ship" when 160 did. And
`scripts/tests/mutation-suite-shape.test.mjs` held its "names the catching
check" ratchet at 10 while 44 suites held — the floor was recorded once,
thirty-four more suites were rewritten, and nobody re-asked. A ratchet
four times below its own measurement lets four suites in five regress in
silence.

*Caught by:* `scripts/tests/self-claims.test.mjs` — every path a comment
names must resolve, held at zero. Numeric claims are **not** gated; they
are derived where they are printed instead of written down twice.

## The defence existed, was correct, and was wired at one place

`src/lib/trading/conduct.ts` described three layers of protection in the
present tense. Only the third was running: nothing in the trading feature
calls a model, so there is no output to scan. A safe state, not a checked
one — and the difference matters the day somebody adds the model call.

*Caught by:* `scripts/tests/trading-journal.test.mjs` — a model call in
that feature without a conduct scan fails the build.

## Code correct by coincidence

`ArrowDown` on a freshly-opened menu was right because `-1 + 1 = 0`.
`ArrowUp` on the same line was wrong.

*Caught by:* `src/lib/ui/roving-index.ts` makes the not-found case a
branch; tested at 0 · 1 · -1 · length · NaN · Infinity · undefined.

## An instruction requested rather than enforced

The website prompt *asks* the model for an English image query. A Greek
`λογότυπο` placeholder is then not recognised as a logo, and whatever the
photo library returns is published as the business's own mark. An
instruction to a model is a request; the enforcement has to happen after
generation, in code.

*Caught by:* `scripts/tests/ascii-boundaries.test.mjs` — a non-Latin query
is stripped, not searched. See `src/lib/website-image-placeholders.ts`.

## `\b` is ASCII

**This one has no gate, and saying so is the entry.** JavaScript's word
boundary is defined against `[A-Za-z0-9_]`, and the `u` flag does not
change it — it is the *boundary* that is ASCII, not the pattern.
`\bπροτείνω\b` matches nothing, silently, in one language. It has broken
four features here.

128 occurrences are scanned and classified; 83 legitimately match a tag or
attribute name and would be *wrong* without the boundary, 26 are genuinely
ASCII domains, and the 19 touching human text were read one by one. Two
live instances were fixed. `scripts/tests/ascii-boundaries.test.mjs`
catches a boundary next to a non-ASCII literal, but it cannot tell a
correct `<img\b` from a Greek word without reading intent. Held by
convention and one heuristic — which is a weaker sentence than every other
entry in this file, and it is the true one.
