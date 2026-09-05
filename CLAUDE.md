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

## Gates

`npm run build` runs the whole gate: function limits, mutation markers,
the mutation tree, i18n, then every `scripts/tests/*.test.mjs`, then
`next build`. `npm run test:mutation` runs every `*.mutation.mjs` — each
one re-introduces a real defect and requires its gate to go red on the
clause that names it.
