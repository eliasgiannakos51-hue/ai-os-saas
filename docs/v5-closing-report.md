# V5 — closing report

**Every number here was measured on 2026-09-13, on commit `7eeee62a`, by
running the thing that produces it.** Where a number could not be
measured, the row says so instead of carrying a figure. The commands are
named so the next reader re-runs rather than trusts.

    npm run build            # every gate, then next build
    npm run build:ci         # the same under a deployed environment
    npm run test:prod        # the 44 prodtests — needs production
    npm run test:mutation    # the 154 mutation suites

---

## Α. What works

**"Live?" means: seen running against production.** It is NO on every row
of this table, and that is the single largest gap in this report. This
session had no production credentials and no `DATABASE_URL`. A gate
passing is evidence about the code; it is not evidence about the deployed
product, and the two have disagreed in this repository before
(`check-site-spelling`, 2026-09-11, green locally and red on Vercel).

| Feature | State | Evidence (re-run it) | Live? |
|---|---|---|---|
| Greeklish | WORKS in code | `greeklish.test.mjs` — 25/25 | NO |
| RTL | WORKS in code | `rtl.test.mjs` — 42/42 | NO |
| ⌘K per language | WORKS in code | `command-palette-language.test.mjs` — 16/16 | NO |
| Verbs | WORKS in code | `module-verbs.test.mjs` — 13/13 | NO |
| `help_articles` locale | WORKS in code | `help-articles.test.mjs` — 147/147 | NO |
| Projects | WORKS in code | `projects.test.mjs` — 151/151 | NO |
| Presentations | WORKS in code | `presentations.test.mjs` — 115/115 | NO |
| Posts | WORKS in code | `posts.test.mjs` — 96/96 | NO |
| Universal Memory | WORKS in code | `ai-memory.test.mjs` — 51/51 | NO |
| **Meeting → actions** | **NOT BUILT** | `sidebar-nav.ts:372` carries `notBuilt: true`; there is no `src/app/dashboard/meetings` | — |
| Sidebar (structure) | WORKS in code | `sidebar-structure` 38/38, `sidebar-naming` 154/154, `sidebar-size` 37/37 | NO |
| Sidebar (density) | **BROKEN gate** | `sidebar-density.prodtest.mjs` — 17 passed, 23 failed. See Γ. | NO |
| Step flow | WORKS in code | `step-flow.test.mjs` — 47/47 | NO |
| Design | WORKS in code | `design-density.test.mjs` — 14/14 | NO |
| The 89 grants | WORKS in code | `role-grants.test.mjs` — 93/93. **A V4 item, not V5**: `docs/v4-closing-report.md`. 50 `revoke … from authenticated` statements in migrations, which `shapes.md` counts as 89 (table, verb) pairs. | NO — `role-grants.dbtest.mjs` needs a database |
| **Isolation** | **UNTESTED here** | `user-isolation.dbtest.mjs` requires `DATABASE_URL`, which is unset in this environment. It did not run. | NO |
| The pricing page | WORKS in code | `pricing-truth.test.mjs` 51/51, `feature-catalog.test.mjs` 36/36 — 45 rows, 7 sections | NO |
| The 7 lies of PLANS | WORKS in code | `plan-enforcement.test.mjs` — 18/18. 14 capabilities declared, 10 enforced, 4 held for unbuilt features | NO |

`npm run build` — **EXIT=0, 0 failures**. `npm run build:ci` — **EXIT=0**,
"The build passes in a deployed environment as well as in this one."

---

## Β. Security

Counted out of `supabase/migrations/*.sql` (72 files) on 2026-09-13:

| | count |
|---|---|
| `enable row level security` statements | 92 |
| `create policy` statements | 225 |
| `grant … on …` statements | 80 |
| `revoke … from authenticated` statements | 50 |

**RLS on the new tables — yes, each one.** `generated_posts`,
`transition_suggestions`, `nav_events` and `projects` each carry
`enable row level security` and policies in their own migration.
`ai_presentations` (the table the presentations migration extends) grants
the four verbs to `authenticated` and issues `revoke all … from anon` in
the same file.

**GRANT and POLICY together — held by a gate, not by hand.**
`20260926000000_revoke_authenticated_grants_without_policy.sql` exists for
exactly this, and the presentations migration restates the rule in its own
header: *"A POLICY WITHOUT A GRANT IS A LOCKED DOOR."*

**No anon — one documented exception.** The only `grant … to anon` on a
table is `grant select on public.help_articles to anon, authenticated`
(public help content). `grant usage on schema public to anon` remains, and
`20260906000000_revoke_anon_grants.sql` explains the policy: nothing
inherits, everything anon may read says so in its own migration.

**Does the isolation test cover the new tables? Yes — by construction, and
it did not run here.** `user-isolation.dbtest.mjs` derives its population
from "has a `user_id` or `owner_id` column", deliberately NOT filtered by
`relrowsecurity`. Its own header records why: the first version filtered on
RLS being on, and the mutation suite turned RLS **off** on `user_credits`
— the table holding people's money — and the suite went green, because the
table dropped out of the population along with its protection. So a new
table is covered the moment it has an owner column. **But `DATABASE_URL`
is unset here and the file did not execute.** This is the V4 closing
report's largest gap, and this session did not close it.

**RPC canaries — all of them, or a written reason.**
`rpc-canaries.test.mjs` — 106/106. It reads 40 distinct database functions
called from `src/` across 916 files, checks them against 31 canaries, and
for every RPC without one asserts that its exemption carries a reason
**and** that it is not also a canary.

Other security gates, all run today, all green: `security-posture`
403/403 · `owner-only-access` 68/68 · `gdpr-coverage` 64/64 ·
`untrusted-boundaries` 32/32 · `user-scoped-queries` 15/15 ·
`injection-patterns` 85 · `log-scrubbing` 92 · `write-guards` 21 ·
`rpc-signatures` 12.

---

## Γ. What is open

### The six already known, checked one by one

**1. React #310 — real, documented, not reproduced here.** Five places in
the tree name it: `src/app/dashboard/error.tsx`,
`src/app/dashboard/overview/error.tsx`,
`src/app/dashboard/overview/page.tsx:484`, and
`routes-smoke.prodtest.mjs:497`, which records it as *"production-only,
intermittent (6/1/4 in three identical runs)"*. Error boundaries are in
place at both the dashboard and the overview segment. It cannot be
reproduced without production. **Open.**

**2. The unpaired block comment — I could not find it, and I am not going
to pretend otherwise.** The build compiles and `tsc --noEmit` is clean, so
it is not an unterminated comment in any TypeScript the compiler reads.
Counting `/*` against `*/` across `src/` and `scripts/` reports 107
unbalanced files, and that count is worthless: it cannot tell a comment
from `"*/"` inside a string or a regex. **Precision of that method is
approximately zero and I am reporting it as zero.** Point me at the file
and it is a five-minute fix.

**3. Gates without a mutation suite — 109, and the build prints it.**
`mutation-coverage.test.mjs`:

    test      160/258  62.0%   itest    8/19   42.1%
    dbtest      2/29    6.9%   prodtest 3/44    6.8%
    MUTATION COVERAGE: 168 of 277 drivable gates = 60.6%  (0 exempt, 109 bare)

The 109 are categorised by what they protect, and the categories are the
reassuring part:

    money and access:     0
    what a person meets:  0
    everything else:    109

**4. The measurements that did not run.** Three classes, not three
measurements: **29 dbtests** (need `DATABASE_URL`), **44 prodtests**
(need production), and the **full `npm run test:mutation` sweep**, which
was started twice this week and stopped both times. A stopped sweep is not
free: the second stop left an applied mutation in `messages/en.json`
(`"presentations"` rewritten to *"It does not create slides."*) which
would have been committed by the next `git add -A`. **Open.**

**5. Translations with no native speaker.** Ten locales ship. Nothing in
this repository can establish that a Greek, Arabic, Japanese or Chinese
sentence reads naturally to somebody who speaks it — `check-i18n.js` and
`i18n-coverage` hold structure, placeholders and coverage, which is a
different claim. **Open, and not closable by any instrument here.**

**6. Sidebar height in production.** Measured locally against a real
production build with a stand-in Supabase; **not** measured against
production. The owner will supply a test account. **Open — see Η.**

### Found in this round, and fixed

**`sidebar-density.prodtest.mjs` was reading before the thing it measures
existed.** `measureExpanded()` set `grid-template-rows: 1fr` and read
`scrollHeight` in the same `evaluate()`, before the collapse transition
ran. It printed `1440x900: 900px of content in 900px — fits`, which is the
panel's own height echoed back. The truth is **1702px in 900px — SCROLLS**.
Fixed: open, wait, then measure.

**That prodtest is red — 17 passed, 23 failed — and was red before this
round.** It is not run by `npm run build`, only by `npm run test:prod`,
which is why nobody saw. Every failure traces to one fact:

| V4.6 target | V5 reality |
|---|---|
| ≤ 4 groups | **6** |
| ≤ 20 rows | **26** |
| ≥ 15 readable @1080p | **7** |
| ≤ 1100px of content | **1702px** |

Those targets were written before the accordion existed, and the accordion
— one group open at a time — is what makes 7 readable rows correct rather
than a regression. **Nothing here was relaxed to make it pass**: 1440
carries the same floor as 1080p (15) so it fails honestly beside it, and a
new invariant requires every viewport to appear in exactly one of `FLOOR`
or `NO_FLOOR`, so a future viewport can be neither floored nor silently
skipped. Re-baselining is the owner's decision.

**`estimated_cost` is written by 24 call sites and read by nothing.** Not
application code, not `docs/sql/4-spend.sql` or `5-undercount.sql` (both
read `total_calls`, and 4-spend says in its own header that real spend
comes from `ai_cost_log`), not any dashboard. Twenty-one of the
twenty-four callers pass a real `estimate.estimatedCredits`; three pass a
flat 1, 1 and 2 out of `CREDIT_COSTS`. **Open — the fix is the owner's
choice** between rewiring three routes and dropping the column, which
needs a migration applied by hand.

---

## Δ. The patterns

**There are 44 shapes in `docs/shapes.md`, not 26.** The brief that asked
for this report said 26; the file has 44, the last two added this week.
That is shape 38 — *the number that was right when it was typed* —
happening to the request for the audit.

**A per-shape "found / real / fixed" table cannot be produced honestly.**
The document records instances in prose, not in a machine-readable field,
and most sections name one defect rather than a population. Inventing
three numbers for each of 44 rows would be the exact thing rule 47
forbids. What the document DOES carry, where it carries it:

| Shape | found | real | fixed |
|---|---|---|---|
| `\b` is ASCII (31) | 32 checks in `untrusted-boundaries.test.mjs` | — | yes, that gate IS the rule |
| The gate that dies instead of failing (42) | 3 ways, named in `prodtest-hygiene` | 3 | yes |
| A field that costs nothing to add (43) | 22 declarations | 22 | yes — removed, with each naming comment |
| The one live use (44) | 3 of the 4 CREDIT_COSTS survivors | 3 | comment fixed; the wiring is open |
| Unjudged numbers (`scan-unjudged-numbers`) | 19 | **1** | yes |
| English-anchored gates (new) | 26 hits in 11 files | 10 of 11 files verified | **no — open** |

The honest summary of the rest: they are recorded as narratives with a
fix, and the count of instances was never kept.

---

## Ε. The seven questions

**1. What broke silently in V5?** `sidebar-density.prodtest.mjs`. Red
since the sidebar gained its accordion, invisible because prodtests are
not part of `npm run build`. And inside it, a measurement that reported
`fits` for something that needs twice the screen.

**2. Which features did nobody touch?** Meetings, Music, Browser agent and
Computer agent — four sidebar positions carrying `notBuilt: true`, held
deliberately and correctly kept off the pricing page. Of built features,
the `estimated_cost` column is the untouched surface: 24 writers, no
reader, for long enough that three price constants survived a cull by
feeding it.

**3. Which promise something they do not do?** Zero on the pricing page —
that is what `pricing-truth.test.mjs` now holds, and a `notBuilt` row
cannot be published. One remains in code: the `~N credits` estimate shown
before submit is the same number used to size the hold, and a hold is
deliberately biased high. The estimator returns 73–156 credits for a
website generation where the one production row recorded in
`website-margin-real-numbers.itest.mjs` charged **45**. The wording says
"about", and nothing measures whether "about" is about.

**4. Which were declared done and are not?** The V4.6 sidebar targets (4
groups / 20 rows / 15 readable / 1100px) read as met and are not. The
`time-constants.ts` consolidation described itself in the past tense with
three holdouts still writing the numbers inline — fixed this week. And my
own sentence *"moving one moves a graph"*, written in the commit that
deleted eleven fields for being unread, about a column nothing reads.

**5. The most dangerous security point?** That `user-isolation.dbtest.mjs`
has not executed in this environment. Everything else in the security
column is a statement about configuration — RLS is on, a policy exists, a
grant has a policy behind it — and the V4 report already identified that
those describe the machinery rather than demonstrate it keeps two real
people apart. The file that demonstrates it needs a database, and did not
run.

**6. What would an attacker do first?** Ask whether `anon` can read
anything: the answer is `help_articles` only, and the schema-usage grant.
Then try the RPC surface, since 40 functions are callable by name and
`SECURITY DEFINER` is where RLS stops applying — `rpc-signatures` and
`rpc-canaries` are the gates standing there, and both are green. Then
cross-account reads, which is question 5.

**7. What breaks at 1,000 users?** The daily platform breaker is the
honest candidate: `checkDailyPlatformCap` reads `total_calls` against
`MAX_DAILY_AI_CALLS`, a **platform-wide** ceiling, so a thousand ordinary
users trip a limit written for a runaway. Second, the sidebar: 1702px of
nav in a 900px viewport is a scroll on every page for every user, not a
tail case. Third, any unbounded read — `/dashboard/search` reads 21 tables
at 60 rows each, bounded deliberately, but that bound was added after a
page-load timeout was found the same way.

---

## ΣΤ. The verdict

**Two percentages, and the gap between them is the report.**

**In code: 100%.** All 258 `*.test.mjs` gates pass. `npm run build` exits
0 with zero failures; `npm run build:ci` passes under a deployed
environment.

**In proof: 74%.** 258 of the 350 gates in the tree executed here. The
other 92 — 29 dbtests, 44 prodtests, 19 itests — need a database or
production, and none of them ran. Mutation coverage over what the sweep
can drive is **60.6%** (168 of 277), and the full sweep did not complete.

The four axes:

| axis | in code | in proof |
|---|---|---|
| **Truth** — does the product say true things? | strong: pricing page, PLANS, catalog all gated both directions | good: gates ran; the pricing page rendered live locally |
| **Security** — is one account sealed from another? | strong: 92 RLS, 225 policies, 106 canary checks | **weak: the one test that demonstrates it did not run** |
| **Money** — is what is charged what is shown? | mixed: settlement is measured and gated; the shown estimate is the hold's number | weak: nothing measures estimate against settlement |
| **Endurance** — does it survive scale and a second language? | mixed: bounded reads, atomic increments | weak: 11 gates anchored on English; 109 bare gates; platform-wide daily cap |

---

## Ζ. Documents

`docs/v6-list.md` carries what this report leaves open. `docs/shapes.md`
gained shapes 43 and 44 this week.

---

## Η. The list for the owner — only what I could NOT verify

Six things. Each says what to press, what you should see, what it means if
you do not see it, and how long it takes. **If you have ten minutes, do
number 1 and stop.**

### 1. The isolation test — 15 minutes, and it is the one that matters

**What you press:**

    DATABASE_URL='postgres://…' node scripts/tests/user-isolation.dbtest.mjs

**What you should see:** a run that creates two users, seeds a row for
each in every table with an owner column, and ends `ALL PASS`. Four
questions per table, and the first is `A CAN see A's own row` — the
positive control.

**What it means if it is missing:** if a table reports "A cannot see B"
**without** passing its own positive control, that table proved nothing —
the seed failed or the grant is absent, and the green is empty. If a real
failure appears, one account can read, update or delete another's rows.

**Why this one first:** every other security number in this report
describes configuration. This is the only one that puts two people in the
database and checks they cannot reach each other. It has never run in a
session that produced a report.

### 2. Sidebar targets — one decision, no keyboard

**What you decide:** whether V4.6's 4 groups / 20 rows / 15 readable /
1100px still bind, now that the accordion ships. Today: 6 / 26 / 7 /
1702px.

**What it means if you leave it:** `npm run test:prod` stays red at 23
checks and the next person cannot tell the stale limits from real
failures.

**The one number worth keeping whatever you decide:** 1702px of nav in a
900px viewport is a scroll on every page for every user.

### 3. The estimate the customer reads — 20 minutes with SQL

**What you press:** `docs/sql/4-spend.sql`, then compare
`credits_charged` against what the UI said before submit.

**What you should see:** them close. The estimator returns **73–156
credits** for a website generation; the one production row this repo has
recorded charged **45**.

**What it means:** the number shown before a click is the same number used
to size the hold, and a hold is deliberately biased high. If the gap is
real at scale, every customer is quoted more than they pay, in the
direction that stops them clicking.

### 4. React #310 — needs your production

**What you press:** load `/dashboard` and `/dashboard/overview` a few
times.

**What you should see:** never the error boundary.
`routes-smoke.prodtest.mjs:497` records it as intermittent, 6/1/4 in three
identical runs.

**What it means if it appears:** hooks rendered conditionally somewhere on
that segment. Boundaries are in place, so a user sees a recovery screen
rather than a blank page — but they see it.

### 5. The translations — one person per language

**What you press:** nothing. No instrument in this repository can tell you
whether a Greek, Arabic, Japanese or Chinese sentence reads naturally.
`check-i18n.js` holds structure and placeholders, which is a different
claim.

**What it means if it is wrong:** the product reads as machine-translated
in nine of its ten languages and nothing goes red.

### 6. The unpaired block comment — name the file

**What you press:** nothing yet. The build compiles and `tsc --noEmit` is
clean, so it is not an unterminated comment in anything the compiler
reads. Counting `/*` against `*/` reports 107 files and cannot tell a
comment from `"*/"` inside a string — that method's precision is
approximately zero and I am not going to dress it up.

**What I need:** the file, or the round it was found in.

### And a seventh, which is mine and not yours

The full `npm run test:mutation` sweep has not completed. If you run it:
when it ends, or if you stop it, check `git status` for files you did not
edit. A stopped sweep leaves its last mutation applied — the one on
2026-09-13 left `"presentations"` rewritten to *"It does not create
slides."* in `messages/en.json`, one `git add -A` away from shipping.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
