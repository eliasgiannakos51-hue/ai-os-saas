# Working rules for this repository

## Migrations are applied by hand — say so, every time

There is no migration runner, no CI step and no ledger table. Every file in
`supabase/migrations/` is pasted into the Supabase SQL editor by the owner,
by hand. A file that nobody pastes simply never runs, and nothing anywhere
says so: on 2026-09-04 two migrations from a fortnight earlier turned out
never to have run, and the way that was discovered was a feature breaking
in production — every website generation failing at its final save because
`user_websites.generation_notes` did not exist.

So, as a standing rule:

**Any report that adds, edits or depends on a migration ends with its own
line, separate from the prose, in bold:**

```
**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: 20260926000000_example.sql, 20260927000000_other.sql**
```

Not inside a paragraph, not in a table, not implied by "I added a
migration". If a round adds none, say `ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία`
so the absence is also explicit.

### The tool that answers "what else have I not run?"

    npm run db:pending            # with DATABASE_URL, runs it through psql
    npm run db:pending -- --sql   # prints one read-only query to paste in the editor

`scripts/db/pending-migrations.mjs` derives every object the migrations
create — tables, columns, functions by arity, policies, indexes, triggers,
types, views — and reports each file as applied, PARTIAL or PENDING. It is
the thing to run before a deploy, not after a page breaks.

## Two things that have lied to the owner, and must not again

- **`/api/health`'s schema sweep.** It reported six functions as missing
  while all six existed and were being used, twice, on two different
  wrong theories. It now asks the database API for its own function list
  (the OpenAPI root) and reports `functions: "unchecked"` when it cannot
  ask. A probe that names something missing when it is not is worse than
  no probe: the four columns that WERE missing arrived inside that noise.
- **ICU placeholders in `messages/*.json`.** `'{query}'` is the literal
  text `{query}` in every language — the single quote escapes the braces.
  Write `''{query}''` or `“{query}”`. `scripts/check-i18n.js` fails the
  build on the escaped shape now, English included.

## Every statement about this repository is checkable, or it does not exist

The comments here carry the reasoning: they name the file that does the
other half, the gate that would have caught it, the route that reads the
column. That is what makes them worth reading, and it is why a wrong one
costs more here than elsewhere — a reader who follows a path to nothing
stops trusting the ones that lead somewhere.

Four of this project's own instruments have lied in exactly this shape.
`app/offline/page.tsx` said the locale it needed lived behind a request
that had already failed (it did not: the page is fetched once, over the
network, at service-worker install) and a gate REQUIRED that excuse.
`i18n-coverage` said "86 of these still ship" when 160 did.
`trading/conduct.ts` listed three layers of defence in the present tense
when only one was running. The README said two cron jobs were unscheduled
while both sat in `vercel.json`.

    npm run build            # runs scripts/tests/self-claims.test.mjs
    node scripts/scan-self-claims.mjs

Every path named in a comment or in the markdown must resolve — held at
ZERO, with the exceptions in `scripts/tests/lib/absent-on-purpose.mjs`,
each carrying a reason and checked BOTH ways so it cannot go stale. Every
`Run:` header must name the file it is in; six did not. Symbol claims are
measured and printed but NOT gated: precision was about 4%, and a check
with that ratio gets its baseline set to the size of the problem.

### And the same disease one level in: a number PRINTED and never judged

    node scripts/scan-unjudged-numbers.mjs

`schema-canaries.test.mjs` derived what the newest migrations add, printed
it — *"newest 12 migrations add: 10 column(s), 3 table(s), 7 function(s)"*
— and asserted nothing about it, one line above its first check. Three
migrations landed in that window with no canary and three screens went
dark while `/api/health` said `missing: []`.

The scan for the general case found `db-migrations.test.mjs` had **three**:
`usedTables`, `usedRpcs` and `staticColumns` all feed checks that report a
DIFFERENCE, so an empty scraper produces an empty offender list and a green
line. Replacing all three with empty collections left the output
byte-identical to the real run — *ALL PASS: 307 passed, 0 failed* — in the
one gate standing between the code and a schema applied by hand.

**It reports; it does not gate.** All nineteen of its findings were run
down on 2026-09-11 and **one** was real: 1 REAL, 11 false positives, 6
informational context lines, 1 pass/fail footer. The common innocent case
is a value that reaches an assertion under a derived name (`foundTables` →
`unclassified` → checked), which the scan cannot see. One in nineteen is
the same call as the symbol claims above, for the same reason.

**Settle a candidate by mutating it, never by reading it.** Replace the
value with an empty `Set`/`Map`/array and run that gate. If it still prints
ALL PASS, the section is measuring nothing. That is how all three
`db-migrations` scrapers were confirmed, and how `pricing-truth` was
cleared in the same pass.

## The plan is updated in the SAME commit as the work, never in a later round

`docs/v5-list.md` was wrong in four places on 2026-09-11, and every one of
them was wrong in the same direction: **work that had been done, described
as still to do.**

| item | the doc said | the tree said | stale for |
|---|---|---|---|
| 10, the `\b` rule | "~1 day", "done means: a narrower rule" | `untrusted-boundaries.test.mjs`, 32 checks, IS that rule | 3 days |
| 9, mutation coverage | "98 of 221 (44%)", instrument outstanding | `mutation-coverage.test.mjs` prints it on every build | 3 days |
| 1, the isolation test | "~half a day", the prodtest reads as unwritten | `user-isolation-live.prodtest.mjs`, 426 lines, 25 checks | 4 days |
| 8b / 8c / 11 | "~1 day of code", "no instrument looks at it" | `role-grants`, the storage schema, `db:invoice` all shipped | 3 days |

The mechanism was the same every time. The file's last commit is 9dd8c25,
2026-09-07. The work landed on 2026-09-08. Nobody came back.

**This costs more than a tidy document.** An item that reads as unstarted
does not get scheduled, so the owner was told three separate times that a
day of coding stood between him and a measurement that was already
waiting on fifteen minutes of his own. Item 1 was the expensive one: "two
accounts and half a day of work" and "two accounts and one run" are
different decisions, and he was making the first one.

So:

**A round that changes what an item's entry says is true must change the
entry, in the same commit as the code.** Not in the closing report, not in
the next round's sweep, not "I will note it when the feature lands". The
commit that makes a sentence false is the commit that fixes it.

### A number in a document carries its date, or it is produced where it prints

The four stale entries were prose. The numbers inside them were the part
that misled, and they misled in a way no reader could detect: *98 of 221
(44%)* is not a wrong sentence, it is a **true measurement of 2026-09-05**
being read on 2026-09-11, when the answer was 143 of 273 (52.4%).

So every number written into a document, a comment or a README is one of
two things, and nothing in between:

1. **Dated at the point of use** — "measured 2026-09-05", in the sentence,
   not in a heading somewhere above it. This is right for a closing
   report, a post-mortem, an incident note: a record of one day, left as
   it was taken. `docs/v4-closing-report.md` is now explicit about this.
2. **Produced by the thing that prints it** — the document says WHERE the
   number comes from and the reader runs it. `docs/v5-list.md` §9 names
   `mutation-coverage.test.mjs`; the closing report prints the exact
   command that re-derives its ratio; `schema-canaries.test.mjs` reads its
   five figures out of `db-inventory.mjs --json` rather than carrying
   them.

An undated number with no source is the third thing, and it is the one
that cost three rounds of scheduling: it reads as current because nothing
says it is not.

**When you cannot do either** — the measurement is expensive, or nothing
prints it — write the date anyway. "Measured once, 2026-09-05, by hand" is
a weaker claim honestly made, and a reader can act on a weak claim they
can see. They cannot act on a strong one that is quietly four days old.

### This one cannot be gated, and that is why it is written here

`scan-self-claims.mjs` holds every path named in a comment or in the
markdown at zero unresolved, and it would not have caught any of the four.
Each one named files that exist and numbers that parse. They were true
sentences that became false, and no parser can see the difference between
"98 of 221" and "143 of 273" without being told which is this week's.

The nearest mechanical help is the habit the numbers already have: every
figure in the list that CAN be re-derived says the command that derives it,
so the next reader can re-run it rather than trust it. Extend that when you
add a number — and when you finish something, open the entry.

## The build that matters is the one in CI, not the one on this machine

On 2026-09-11 merge commit `aec56a2` went red on Vercel with a single
failing line, minutes after a green local build of the same bytes:

    scripts/tests/check-site-spelling.test.mjs
      FAIL  ...and names the key

The gate spawned a runner **without giving it an environment**, then
asserted the runner prints `MISSING ANTHROPIC_API_KEY`. That line only
appears when the key is absent — absent here, present on Vercel, because
the application needs it there.

The direction is the part worth remembering, because the natural guess is
backwards: it passed locally because the variable was **missing**, and
failed in CI because it was **set**.

**Before a push, run the build the way the builder will:**

    npm run build:ci     # the real build, under a deployed environment
    npm run test:env     # every gate twice, and which one disagrees (~25 min)

`npm run build` runs `scripts/tests/env-independence.test.mjs`, which is
the cheap structural half: no gate may hand an env-reading program the
machine's environment. It resolves a path held in a `const`, because the
gate that broke the build spawns `[RUNNER, ...args]`.

## Gates

`npm run build` runs the whole gate: function limits, mutation markers,
the mutation tree, i18n, then every `scripts/tests/*.test.mjs`, then
`next build`. `npm run test:mutation` runs every `*.mutation.mjs` — each
one re-introduces a real defect and requires its gate to go red on the
clause that names it.
