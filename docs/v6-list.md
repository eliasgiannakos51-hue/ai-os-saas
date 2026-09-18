# V6 — the list

Everything V5 left open, in the order the evidence says to take it. Every
item names what it costs to CHECK, which is usually far less than what it
costs to fix, and several of these turn out to need fifteen minutes of the
owner's time rather than a day of coding.

**Measured 2026-09-18, commit `13885c7b`.** Numbers that can be
re-derived name the command. This replaces the 2026-09-13 edition: two of
its ten items are closed, one shrank, and three are new.

---

## 1. Run the isolation test against a real database — ~15 minutes

**The largest gap in the security axis, and it is not a coding task.**
`scripts/tests/user-isolation.dbtest.mjs` is 426 lines and 25 checks. It
creates two users, puts a row for each in every table with an owner
column, and issues the app's own reads as one of them under `set local
role authenticated`. It has never executed in a session that produced a
report.

    DATABASE_URL=... node scripts/tests/user-isolation.dbtest.mjs

Everything else in the security column describes configuration — RLS is
on, a policy exists, a grant has a policy behind it. This is the only one
that demonstrates two real people are kept apart.

**What it means if it fails:** one account can reach another's rows, which
is the worst outcome in the product.

## 2. Decide the sidebar's real targets — one decision

`sidebar-density.prodtest.mjs` is red (17/23) against V4.6 targets written
before the accordion existed:

| target | now |
|---|---|
| ≤ 4 groups | 6 |
| ≤ 20 rows | 26 |
| ≥ 15 readable @1080p | 7 |
| ≤ 1100px | 1702px |

Three of the four are a consequence of the approved accordion. The fourth
— 1702px of nav in a 900px viewport — is a scroll on every page for every
user and is worth treating as a real number rather than a stale limit.

**Not a coding task until the targets are agreed.** Relaxing a limit to
match what was measured is how a check gets its baseline set to the size
of the problem.

## 3. Separate the estimate shown from the hold taken — ~half a day

The `~N credits` a user reads before submitting is the same number used to
size the reservation. A hold should lean high; a price shown to a customer
should be accurate. The estimator returns **73–156 credits** for a website
generation; the one production row recorded in
`website-margin-real-numbers.itest.mjs` charged **45**.

Two pieces, and the first is the cheap one:

- **Measure the gap.** Nothing compares the estimate shown against the
  amount settled. `ai_cost_log` has both sides for every real action.
- **Then decide** whether to show a different number, a range, or the
  same number with different words.

**Why it matters commercially:** the bias is in the direction that makes a
user not click.

## 4. `estimated_cost`: rewire or remove — ~1 hour either way

Written by 24 call sites, read by nothing. Twenty-one callers pass a real
`estimate.estimatedCredits`; three pass a flat 1, 1 and 2 out of
`CREDIT_COSTS`, which is the only thing keeping those three constants
alive.

- **Rewire** the three routes to pass a real estimate — `CREDIT_COSTS`
  then holds exactly one entry, `clarificationCheck`, which is a real
  charge; or
- **Remove** the column, which needs a migration applied by hand.

## 5. The 10 English-anchored gates — ~2 hours, or 30 minutes for the worst 4

    node scripts/scan-english-anchored-gates.mjs

**Ten** files (it said 11 on 2026-09-13; re-measured today) compare
browser-rendered text against an English literal that is provably
user-visible — it matches a value in `messages/en.json`, which has nine
other spellings. Those hits go **red** against a Greek, Arabic or Chinese
UI: visible, and somebody fixes them. A further 37 files assert English
against a source file or against `en.json` itself, which is legitimate and
is not a finding.

**The dangerous ones are the negative assertions**, which go green while
measuring nothing because the English string they forbid is never present
in any language:

    !body.includes("Upgrade Required")
    !/\b0 credits\b/i.test(text)

**Take those first.** A check that fails loudly is a nuisance; a check
that passes vacuously is a lie in a green log.

## 6. ~~Finish a full mutation sweep~~ — DONE 2026-09-17

    npm run test:mutation      # 172 suites · 171 green · 1 skipped · 0 red

Closed. Two suites that had been red on `main` were repaired in the same
week: `plan-enforcement`, which declared 13 mutants and exercised 10, and
`schema-canaries`, whose mutant went red on the wrong clause.

The skipped one is `user-isolation`, and the runner refuses to count it as
green — *"NO SUITE IS RED, but 1 of 169 never ran — this is not all
green."* That is item 1, not this one.

**What is still open here is the coverage, not the run.** 105 of 290
drivable gates are bare (`mutation-coverage.test.mjs` prints it on every
build), and the bare ones are categorised:

    money and access:     0
    what a person meets:  0
    everything else:    105

**A stopped sweep is still not free.** It happened twice in one session on
2026-09-17, leaving `src/lib/coding/highlight.ts` mutated both times.
`node scripts/check-mutation-tree.mjs` reports it and
`node -e 'await import("./scripts/tests/lib/sidecar-write.mjs")'` heals it.
Check `git status` for files you did not edit before any `git add -A` that
follows a sweep.

## 7. React #310 — needs production

Named in four source files and in `routes-smoke.prodtest.mjs:497` as
*production-only, intermittent (6/1/4 in three identical runs)*. Error
boundaries exist at `/dashboard` and `/dashboard/overview`. Not
reproducible without production.

## 8. Translations nobody who speaks the language has read — and one population with no pack at all

Ten locales ship and every non-English string was written by a model.
`check-i18n.js` and `i18n-coverage.test.mjs` hold structure, placeholders
and coverage — a different claim from "reads naturally". **No instrument
in this repository can close this.** It needs a person per language.

**Two populations, and only one of them has a way to be read.**

| | how many | who could review it |
|---|---|---|
| the interface, on the first-run path | 601 strings; tier 1 is 47 sentences | `docs/first-run/first-run.<locale>.md` — an hour per language |
| the emails | **1,108 strings** across ten locales | **nobody, today** |

    grep -c '"email\.' docs/first-run/first-run.en.md      # 0

The pack walks components reachable from the signup form, and an email is
not a component. These are the messages a customer reads when they are
*not* looking at the product — a welcome, a sign-in warning, an agent that
gave up, a week summarised — so they are read with more attention than a
button, not less.

**Extending `scripts/first-run-strings.mjs` to a second population is the
smaller half.** The larger half is that it is three more readers, because
a person who checks a dashboard label is not thereby checking a sentence
about somebody's money.

## 9. The unpaired block comment — needs a pointer

The build compiles and `tsc --noEmit` is clean, so it is not an
unterminated comment in anything the compiler reads. Counting `/*` against
`*/` reports 107 unbalanced files and cannot distinguish a comment from
`"*/"` inside a string — precision approximately zero. **Name the file and
it is a five-minute fix.**

## 10. The daily platform cap at scale — ~1 hour to reason, more to change

`checkDailyPlatformCap` compares `daily_ai_spend_tracking.total_calls`
against `MAX_DAILY_AI_CALLS`, which is **platform-wide**. A thousand
ordinary users trip a ceiling written to contain one runaway. Worth
deciding before there are a thousand users rather than during.

## 11. The ~33 routes whose multi-write has no reversibility study — ~half a day for the instrument

Measured 2026-09-18: **40 of 143** routes perform two or more distinct
writes, so a failure between them leaves halves. Two classes are covered
and gated already:

    scripts/tests/external-state-reversal.test.mjs   7 routes change Stripe
                                                     state, all 7 declared
                                                     with which way they fail
    scripts/tests/upload-reversibility.test.mjs      a storage upload whose
                                                     row write then fails

The remainder are database-only multi-writes, where a failure leaves an
inconsistent pair of rows rather than a charge. That is a smaller loss than
money and a larger one than nothing, and no instrument looks at it.

**The shape to build is the one that worked twice already:** derive the
population (routes with 2+ writes), require each member to be covered by a
transaction, an RPC, or a compensating path — or declared with which state
a failure leaves behind. `route-contract.test.mjs`'s register is the model:
the scanner derives, the table only records, and a reason must name
something checkable.

## 12. The per-feature margin override the estimate cannot see — a decision, not a bug

`resolveMarginFor` reads `CREDIT_MARGIN_<FEATURE>_<PLAN>` through a
default parameter, and estimation calls it **from the browser**, where
`process.env` holds only the `NEXT_PUBLIC_` variables. So an operator who
sets a per-feature override moves the charge and not the quote.

Written down in `src/lib/billing/margin-policy.ts` and held by
`scripts/tests/client-env-reach.test.mjs`, which records what the browser
gets instead and checks that the function really does run there.

**Closing it needs a `NEXT_PUBLIC_` mirror of the overrides**, which is a
decision about exposing pricing policy to the browser rather than a fix.
It belongs with item 3, which is the same question one level up.

## 13. The public surface's limiter is per-instance, and that is worth a decision — ~1 hour

`/s/<subdomain>`, `/s/<subdomain>/<page>`, its sitemap and robots.txt, and
`/r/<code>` are the tree's entire unauthenticated surface.

**I first wrote here that they had no limiter. That was wrong, and the way
it was wrong is the finding.** All four `/s/` routes call
`publicRequestAllowed` before they touch the database. It was absent from
the eight-kind `BOUNDS` table, so the scanner reported the whole public
surface as having nothing — a ninth mechanism missing from the
vocabulary, for the fourth time in six rounds. It is in
`scripts/tests/lib/route-mechanisms.mjs` now and the register in
`route-contract.test.mjs` records it, which it caught itself needing in
the same run.

**What is actually open is what that limiter is.** From its own header:

> a per-instance sliding window that blunts a single noisy source. What it
> is NOT, and must not be mistaken for: DDoS protection. That is the CDN's
> job, and it is stated here so nobody reads this and concludes the problem
> is handled.

240 requests a minute per hashed IP, held **in memory**, deliberately —
the row-per-check limiter would turn a traffic spike into a write storm.
On serverless that means the window is per warm instance, so N instances
allow N × 240. The decision to make, alongside item 10: whether the CDN in
front of production is configured to be the thing this is explicitly not.

`/r/<code>` has no limiter and needs none: it touches no database at all,
reads a path segment, sets a cookie and redirects.
