# V6 — the list

Everything V5 left open, in the order the evidence says to take it. Every
item names what it costs to CHECK, which is usually far less than what it
costs to fix, and several of these turn out to need fifteen minutes of the
owner's time rather than a day of coding.

**Measured 2026-09-13, commit `7eeee62a`.** Numbers that can be re-derived
name the command.

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

## 5. The 11 English-anchored gates — ~2 hours, or 30 minutes for the worst 4

    node scripts/scan-english-anchored-gates.mjs

11 files compare browser-rendered text against an English literal that is
provably user-visible (it matches a value in `messages/en.json`). 22 hits
go **red** against a Greek, Arabic or Chinese UI — visible, somebody fixes
them. **4 hits go green while measuring nothing**, because they are
negative assertions and the English string they forbid is never present:

    !body.includes("Upgrade Required")
    !/\b0 credits\b/i.test(text)

**Take the 4 first.** A check that fails loudly is a nuisance; a check
that passes vacuously is a lie in a green log.

## 6. Finish a full mutation sweep — ~3 hours of wall clock, ~0 of attention

`npm run test:mutation` has been started twice and stopped twice. 109 of
277 drivable gates are bare (`mutation-coverage.test.mjs` prints it on
every build), and the bare ones are categorised:

    money and access:     0
    what a person meets:  0
    everything else:    109

**A stopped sweep is not free.** The second stop left an applied mutation
in `messages/en.json` — `"presentations"` rewritten to *"It does not
create slides."* — which the next `git add -A` would have committed.
Whoever runs it should check `git status` for files they did not edit
before committing afterwards.

## 7. React #310 — needs production

Named in four source files and in `routes-smoke.prodtest.mjs:497` as
*production-only, intermittent (6/1/4 in three identical runs)*. Error
boundaries exist at `/dashboard` and `/dashboard/overview`. Not
reproducible without production.

## 8. Translations nobody who speaks the language has read — unbounded

Ten locales ship. `check-i18n.js` and `i18n-coverage.test.mjs` hold
structure, placeholders and coverage. None of them can say whether a Greek
or Japanese sentence reads naturally. **No instrument in this repository
can close this.** It needs a person per language.

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
