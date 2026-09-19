# V5 — closing report

**Every number here was measured on 2026-09-18 by running the thing that
produces it.** Where a number could not be measured, the row says so
instead of carrying a figure. The commands are named so the next reader
re-runs rather than trusts.

    npm run build            # every gate, then next build
    npm run build:ci         # the same under a deployed environment
    npm run test:prod        # the prodtests — needs production
    npm run test:mutation    # every *.mutation.mjs

**This supersedes the 2026-09-13 edition.** Five days and eight rounds of
work sit between them; the figures below replace the ones that were true
then. Where a section is unchanged it says so rather than being retyped.

**Re-measured at the close of the final round**, after the multi-write
sweep and the unread-write pass: §Δ and the verdict in §ΣΤ carry the last
figures, and every figure in them names the command that derives it.

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
| **Meeting → actions** | **NOT BUILT** | `sidebar-nav.ts` carries `notBuilt: true`; there is no `src/app/dashboard/meetings` | — |
| Sidebar (structure) | WORKS in code | `sidebar-structure` 38/38, `sidebar-naming` 154/154, `sidebar-size` 37/37 | NO |
| Step flow | WORKS in code | `step-flow.test.mjs` — 47/47 | NO |
| Design | WORKS in code | `design-density.test.mjs` — 14/14 | NO |
| The 89 grants | WORKS in code | `role-grants.test.mjs` — 93/93. A V4 item — see `docs/v4-closing-report.md` | NO — `role-grants.dbtest.mjs` needs a database |
| **Isolation** | **UNTESTED here** | `user-isolation.dbtest.mjs` needs `DATABASE_URL`, unset here. Did not run. | NO |
| The pricing page | WORKS in code | `pricing-truth.test.mjs` 51/51, `feature-catalog.test.mjs` 36/36 | NO |
| The capabilities of PLANS | WORKS in code | `plan-enforcement.test.mjs` — 20/20 | NO |
| **Publishing** | WORKS in code | `publishing.test.mjs` — 155/155, incl. the ceiling and the clash | NO |
| **Emails in ten languages** | WORKS in code | `i18n-population.test.mjs` 30/30, `email-logo.test.mjs` 25/25 | NO |
| **The client bundle's environment** | WORKS in code | `client-env-reach.test.mjs` — 30/30 | NO |
| **The route contract** | WORKS in code | `route-contract.test.mjs` — 34/34 | NO |

`npm run build` — **EXIT=0, 0 failures** across all 271 `*.test.mjs`.
`npm run build:ci` — **EXIT=0**, "The build passes in a deployed
environment as well as in this one."

### The five findings this brief named, measured

The brief named five sets by number. Three of the five numbers are not
ones I produced, and the honest answer is the measurement rather than
agreement.

| what the brief called it | what the tree says today | command |
|---|---|---|
| "the 7 free routes" | **0 remain.** 36 routes reach a model call; every one reserves credits or is declared with what else stops a loop. | `route-spend-inventory.test.mjs` — 23/23 |
| "the 5 without ownership" | **8 were reported on 2026-09-18, and all 8 were scoped.** The vocabulary was three mechanisms short, not the tree. All **66** routes acting on a request id now show a mechanism. | `resource-ownership.test.mjs` — 23/23 |
| "the 51 without rate limit" | **94 of 143 call no `checkRateLimit`; 53 have no bound of any of the eight kinds.** Both are correct: this tree bounds by eight mechanisms, and a route that reads and returns needs none. What matters is the narrowed question — **0 of the 39 inserting routes are unbounded.** | `route-write-bound.test.mjs` — 30/30 |
| "the 231 translations" | **1,108 email strings across ten locales**, on top of 3,266 interface keys × 9. I could never source 231. | `node scripts/check-i18n.js` |
| "the publish with 3 defects" | **2 real, both fixed. The third was never there.** Ownership is RLS through the caller's own client, and two controls in `resource-ownership.test.mjs` already named that route. | `publishing.test.mjs` — 155/155 |

---

## Β. Security

Counted out of `supabase/migrations/*.sql` on 2026-09-18:

| | count |
|---|---|
| tables created in `public` | 110 |
| of them with RLS | **109** (86 literal, 23 through a `DO` loop) |
| RLS on, no policy — deny-all on purpose | 10, each with a written reason |
| without RLS | **1**, `zz_anon_default_probe`, created and dropped inside one `DO` block |

**RLS on the new tables — yes, each one.** `projects`, `generated_posts`,
`transition_suggestions` and `nav_events` each carry
`enable row level security` and policies in their own migration;
`ai_presentations` is one of the 23 protected through a loop, which
`rls-coverage.test.mjs` resolves and asserts by name.

**Does the isolation test cover the new tables? Yes — by construction,
and it did not run here.** `user-isolation-live.prodtest.mjs` asks
PostgREST for its own OpenAPI document and takes every exposed table with
a `user_id` or `owner_id` property. There is no list for anybody to
forget to update: a new table is in the population the moment it has an
owner column. `user-isolation.dbtest.mjs` does the same against
`pg_class`. **Neither ran: `DATABASE_URL` is unset and no two accounts
were supplied.** This is the largest single gap in this report and the
fourth report in a row to say so.

**RPC canaries — all of them, or a written reason.**
`rpc-canaries.test.mjs` — 106/106, both directions: an RPC with no canary
and no exemption is red, an exemption for an RPC nothing calls is red, and
a canary for a function `src/` never calls is red.

**And a finding about this report's own method.** During this audit I
measured 41 RPCs called from `src/` against 33 function canaries, found
nine unwatched — six of them the credit path — and wrote canaries for all
nine plus a gate to hold them. The full sweep turned `rpc-canaries` red in
one run: that gate already **registers** the nine, with the reason that
they are baseline-schema functions, and a database missing the baseline
fails the health probe's own read first, so `db` goes false and a canary
there reports a state no user can reach. Nine alarms for an unreachable
state, and a second gate that would have drifted from the first. All
reverted. The lesson is section Δ's: I searched the tree for the gap
before searching it for the gate.

**How many routes are outside the registry? Six, all declared.**
`route-contract.test.mjs` asks the question the four narrow gates cannot —
is any route in *no* population — and the register that answers it is held
to two conditions: the scanner derives every mechanism and the table only
records them, and a reason must name a file, a function, a table or a
status code rather than reassure.

    identity   asked of 143 · answered by 136
    ownership  asked of  66 · answered by  66
    bound      asked of  39 · answered by  37
    spend      asked of   6 · answered by   6
               6 routes in no population, all declared

Other security gates, all run today, all green: `security-posture` ·
`owner-only-access` · `gdpr-coverage` · `untrusted-boundaries` ·
`user-scoped-queries` · `injection-patterns` · `log-scrubbing` ·
`write-guards` · `rpc-signatures` · `page-auth-boundary` 23/23.

---

## Γ. What is open

### The six already known, checked one by one

**1. React #310 — real, documented, not reproduced here.** Named in
`src/app/dashboard/error.tsx`, `src/app/dashboard/overview/error.tsx` and
`scripts/tests/routes-smoke.prodtest.mjs`, which records it as
*"production-only, intermittent"*. Error boundaries are in place at both
the dashboard and the overview segment. **Open, and not closable without
production.**

**2. Routes with no reversibility study — 33, and ten of them have now
been read.** *(Updated 2026-09-19. Three of the ten were broken; see
`docs/v6-list.md` item 11 and `multi-write-reversal.test.mjs`.)*

**The original entry, left as it was measured:**

**Routes with no reversibility study — 40, not 66.** Measured today:
40 of 143 routes perform two or more distinct writes, so a failure between
them can leave halves. Two classes are now covered and gated —
`external-state-reversal.test.mjs` (7 routes change Stripe state, all
seven declared with which way they fail) and `upload-reversibility.test.mjs`
(a storage upload whose row write fails). **The remaining ~33 are
database-only multi-writes, where a failure leaves an inconsistent pair of
rows rather than a charge. Open, and the cheapest next instrument.**

**3. Translations with no native speaker — and now a second population
that no reader can reach at all.** Ten locales ship and every non-English
string was written by a model. `docs/first-run/first-run.<locale>.md` is
the review pack for the interface: 601 strings on the first-run path,
tier 1 being 47 sentences. The emails are **not in it** —
`grep -c '"email\.' docs/first-run/first-run.en.md` returns 0, because the
pack walks components and an email is not a component. **1,108 email
strings, ten languages, no reviewer and no pack. Open.**

**4. The measurements that did not run — three classes, not three
measurements.** 29 dbtests (need `DATABASE_URL`), 44 prodtests (need
production), 19 itests. **92 of the 363 gates in the tree.** The full
`npm run test:mutation` sweep DID complete on 2026-09-17: 169 suites, 168
green, 1 skipped, 0 red — and the skipped one is `user-isolation`, which
the runner correctly refuses to count as green.

**5. Sidebar height in production.** Measured locally against a real
production build with a stand-in Supabase; not against production.
`node scripts/measure-sidebar-height.mjs` prints it. **Open.**

**6. Isolation of the new tables.** Covered by construction (Β), never
executed. **Open — and it is 15 minutes of the owner's time, not a day of
mine. See Η.**

### Found in this round, and fixed

**The plan ceiling on publishing was asked once.**
`if (!isAdmin && !existing)` ran the plan check on first publish only, and
nothing in this tree unpublishes anything when a subscription ends. An
account that published on a paid plan and moved to Free kept its sites
live **and kept pushing new content to them**, through a route whose own
refusal reads "Publishing is available on paid plans."
`plan-enforcement.test.mjs` stayed green throughout — correctly, because
the capability is read and does refuse, on the path that gate looks at.

**The same clash, two answers.** Renaming a site to an address somebody
else owns returned 500 from the update path and 409 from the insert path.
`subdomainTaken()` runs under the caller's own client and can only see
their own rows — deliberately — so the unique index is the arbiter, and
one of the two paths was not reading it.

**Eight routes reported as establishing no ownership, all eight scoped.**
Three mechanisms were missing from the vocabulary: an RPC through the
caller's client where the function is `SECURITY INVOKER` (read out of the
migrations, because `.rpc("x")` looks identical for a `DEFINER` function
that bypasses every policy), the caller's client handed into a helper, and
a helper given `user.id`. The predicates had **two copies** — one in
`resource-ownership`, one in `route-contract` — so the widening would have
landed in one and left the other disagreeing. They are one definition now,
in `scripts/tests/lib/route-mechanisms.mjs`.

**Two mutation suites were reporting more mutants than they were
running.** `plan-enforcement` declared 13 and exercised 10 (three anchored
on a page that had moved), and its coverage check let **nine of fourteen**
Free capabilities flip to true while staying green — a ratio over 45 sold
rows, most of which are a number rather than a capability. Replaced with a
per-row rule derived from the catalogue's own `minPlan`.
`schema-canaries` had a mutant that went red on the wrong clause.

**A mutant that could not fail, found by the sweep itself.**
`baselines.mutation.mjs` flipped `MUTATION_SUITE_FLOOR` from a floor to a
ceiling, expecting a breach to read as room. It never killed anything, and
the reason is not a hole in the gate: `gap` is `measured - declared` for a
floor and the reverse for a ceiling, and **all twelve baselines sit at
exactly zero slack today**. Zero negated is zero. The `direction` field is
unfalsifiable by any single-file mutation while that holds, which is a
true and uncomfortable thing to know about a gate — it is right, and
nothing proves it. Replaced with a mutant that raises a floor above what
the tree can show, which is the edit a person actually makes, and the
original's reasoning left in place where the mutant was.

**The whole client bundle's environment.** 228 `"use client"` entries pull
in 392 files; six read `process.env` for something a browser does not
have, and **three of the six are invisible to any name scan** because they
pass the object wholesale or take it as a default parameter. Measured by
building with unique markers: nothing leaks, and two of the five do run in
a browser. `margin-policy.ts`'s own header claimed the quoted and charged
multipliers "cannot drift apart"; they can, in exactly one way, and it now
says which.

### And in the two rounds after this section was first written

**Seven of 33 multi-write routes were broken** — 3 of the 10 touching
money or publishing, 4 of the remaining 23. The worst was not a route:
`settleReservation` wrote a cost-log row, two `production_errors` rows
and a margin-alert email to the owner every time an AI call THREW,
because it settled a zero instead of releasing. `releaseReservation`'s
own doc comment, ten lines below it in the same file, stated the rule it
was breaking. Fixed in the function all forty call sites reach.

**Six of 14 unread writes were broken.** The population — a write whose
`.error` nobody reads, which in supabase-js is a write that cannot fail
as far as the surrounding code knows — is printed by `node
scripts/scan-unread-write-errors.mjs`; it stood at 36 of 145 before that
pass and 25 of 139 after. Four of the six were a guard whose own silent
failure removes the thing it guards: a daily email that never stops, a
scheduled run that reruns its own AI call, an agent that resubmits every
fifteen minutes, and a deletion link the route promises still works.

**Five of the 14 were read and found CORRECT**, and are held in the gate
beside the six, because each is safe for a reason located somewhere else:
a claim that fails closed, a cached id the recovery re-derives, a stale
reaper that rescues three rows. Any of those three can change without the
unchecked write changing at all.

---

## Δ. The patterns

**There are far more shapes in `docs/shapes.md` than the 29 the brief
named** — 50 at the close of 2026-09-18, three of them added by the
multi-write and unread-write sweeps of that day. `node scripts/tests/shape-names.test.mjs`
prints the live count and resolves every `SHAPE:` reference against the
catalogue. Read the command's number, not this sentence's.

The brief that asked for this report said 29; that is the catalogue's own shape *the number that was
right when it was typed*, happening to the request for the audit — for the
third report running.

**A per-shape "found / real / fixed" table still cannot be produced
honestly.** The document records instances in prose, not in a
machine-readable field, and most sections name one defect rather than a
population. What it does carry, where it carries it:

| Shape | found | real | fixed |
|---|---|---|---|
| `\b` is ASCII | 32 checks in `untrusted-boundaries.test.mjs` | — | yes, that gate IS the rule |
| The gate that dies instead of failing | 3 ways, named in `prodtest-hygiene` | 3 | yes |
| A field that costs nothing to add | 22 declarations | 22 | yes |
| Unjudged numbers (`scan-unjudged-numbers.mjs`) | 19 | **1** | yes |
| The check covers the participants | 6 dimensions asked deliberately | 4 of 6 correct all along | yes — each now has a population with a floor |
| The variable that does not exist where the code runs | 6 reads in the client bundle | 0 leaks, 2 that run there | yes — `client-env-reach.test.mjs` |
| The route in no conversation at all | 6 of 143 | 6 correct | yes — `route-contract.test.mjs` |

**The dominant pattern of the last six rounds is one shape, and it is not
in the code.** Nine times out of ten the defect was a POPULATION: a scan
asking a sound question of the wrong set.

| the question | the vocabulary it had | what the tree had |
|---|---|---|
| which modules send mail? | files under `src/lib/email` | 14 calling `resend.emails.send`, two elsewhere |
| who is asking? | session, cron secret, Stripe signature | + password, OAuth code, bearer token, new account |
| whose row is this? | 5 mechanisms | + RPC under RLS, client handed on, helper given the id |
| what bounds this route? | 8 kinds | + an in-memory window, which is the whole public surface |

Each was right about everything it looked at. **The fourth was found by a
sentence of mine that was wrong** — I wrote in the V6 list that only one
of the four public site routes had a limiter, and `grep -c
publicRequestAllowed` says all four do. I believed my own instrument's
silence over a thirty-second grep. `docs/shapes.md` records it and its
inverse, which happened in the same session.

---

## Ε. The seven questions

**1. What broke silently in V5?** The publishing ceiling — asked on first
publish and never again, while nothing unpublishes on downgrade. Revenue,
silent, and green in every gate.

**2. Which features did nobody touch?** Meetings, Music, Browser agent and
Computer agent — four sidebar positions carrying `notBuilt: true`, held
deliberately and correctly kept off the pricing page. Of built features,
the `estimated_cost` column remains the untouched surface.

**3. Which promise something they do not do?** Zero on the pricing page —
that is what `pricing-truth.test.mjs` holds, and a `notBuilt` row cannot
be published. One remains in code: the `~N credits` estimate is the hold's
number, deliberately biased high, and nothing measures whether "about" is
about. A second, smaller one closed this week: an operator who sets a
per-feature `CREDIT_MARGIN_*` override moves the charge and not the
estimate, because the estimate runs in a browser where the variable does
not exist — now written down in the function that does it.

**4. Which were declared done and are not?** `docs/v5-list.md` §5 read as
though the translation work needed a day of coding when the pack was
already built. Fixed in the same commit as the work, per the standing
rule. And this report's 2026-09-13 edition, which is why it has been
rewritten rather than appended to.

**5. The most dangerous security point?** Unchanged, and it is the same
answer as V4: `user-isolation` has still never executed. Everything else
in the security column describes configuration — RLS is on, a policy
exists, a grant has a policy behind it. The file that demonstrates two
real people are kept apart needs two real accounts.

**6. What would an attacker do first?** Ask what `anon` can read: the
answer is `help_articles` and the schema-usage grant. Then the RPC
surface, since 41 functions are callable by name and `SECURITY DEFINER` is
where RLS stops applying — `rpc-signatures` and `rpc-canaries` stand
there, both green. Then the five public routes under `/s/<subdomain>` and
`/r/<code>`, which are the tree's entire unauthenticated surface and are
the six entries in `route-contract`'s register.

**7. What breaks at 1,000 users?** The daily platform breaker:
`checkDailyPlatformCap` reads `total_calls` against `MAX_DAILY_AI_CALLS`,
a **platform-wide** ceiling, so a thousand ordinary users trip a limit
written for a runaway. Second, the five public site routes: they read the
database on every view, have no limiter of their own, and their only
ceiling is how many sites an account may publish. Third, the sidebar at
1702px in a 900px viewport.

---

## ΣΤ. The verdict

**Two percentages, and the gap between them is the report.**

**In code: 100%.** All **273** `*.test.mjs` gates pass (`ls
scripts/tests/*.test.mjs | wc -l`). `npm run build` exits 0 with zero
failures; `npm run build:ci` passes under a deployed environment.

**In proof: 75%.** **273 of the 365** gates in the tree executed here.
The other 92 — 29 dbtests, 44 prodtests, 19 itests — need a database or
production, and none of them ran. That ratio has not moved in three
reports and it will not move on this machine: it is a statement about
what a checkout can execute, not about effort.

### THE 28% THAT IS STILL OPEN — held here deliberately

**The owner is bringing `DATABASE_URL`, an Anthropic balance and a
published site.** Until those arrive this section stays in the report
rather than being closed with a number that sounds better than it is.
What each unlocks, and what is unprovable without it:

| what is missing | what cannot run | what stays unproven |
|---|---|---|
| `DATABASE_URL` | 29 dbtests, chief among them `user-isolation.dbtest.mjs` — 426 lines, 25 checks, two real accounts | **that one account cannot reach another's rows.** Everything else in the security column describes configuration: RLS is on, a policy exists, a grant has a policy behind it. This is the only thing that demonstrates two people are kept apart |
| a published site + an Anthropic balance | 44 prodtests | every claim about the live product: React #310, the published-site surface, the credit receipts a real generation writes |
| neither — this is a checkout limit | 19 itests | the integration seams |

**Two things this round showed about the 273 that DO run**, and they are
the argument for not treating 75% as 75% of the truth:

- `stripComments`, which 99 of them import, was deleting 9,862
  non-whitespace characters across 44 files — including the
  open-redirect guard — before any of them looked. No verdict changed
  when it was fixed, which is the good outcome and also the point: the
  exposure was silent and would have stayed silent.
- Four checks in `navigation-cost.test.mjs` and one in
  `example-prompts.test.mjs` were anchored on comment text, so they
  measured prose rather than code. One of them was green on the exact
  value its own fix had removed.

A gate that runs is not the same as a gate that is looking at the thing
it names. `node scripts/scan-self-confirming-gates.mjs` is what asks
that question now, and its own section 1 says how weak it is.

Mutation coverage over what the sweep CAN drive is **64.0%**, 187 of 292
(`node scripts/tests/mutation-coverage.test.mjs`), against 60.6% five
days ago. 105 gates are bare; none is in the money or access categories,
which that gate reports separately and holds at zero.

The four axes:

| axis | in code | in proof |
|---|---|---|
| **Truth** — does the product say true things? | strong: pricing page, PLANS and catalog gated both directions; a per-row rule, not a ratio. **Five instruments** corrected in the last two rounds for claiming more than they could — a reaper that said a charge was structurally impossible, two gates matching a log tag as prose, a register entry that outlived its file, and `mutation-anchors` printing its count of dead anchors without judging it | good: gates ran; the pricing page rendered live locally. `scan-self-claims` holds every path named in a comment at zero unresolved, and an anchor that no longer resolves is now gated at zero too |
| **Security** — is one account sealed from another? | strong: **109 of 110** tables with RLS (86 literal, 23 through a resolved loop, 10 deny-all); **120** authenticated routes — 66 acting on a request id, 16 reaching past RLS, 50 delegating to it; 33 function canaries | **weak, unchanged: the one test that demonstrates it has still never run.** §Η item 1, for the fifth report |
| **Money** — is what is charged what is shown? | **the axis that moved.** `settleReservation` releases rather than settling a zero when no call completed — one change covering forty call sites, closing a cost-log row, two error rows and an owner email per failed request during an AI outage. 7 multi-write defects fixed across 33 routes; 6 unread-write defects across 14 | weak: nothing measures estimate against settlement, and the per-feature override is invisible to the estimate by design (V6 §3, §12) |
| **Endurance** — does it survive scale and a second language? | improved: emails in ten languages with plural forms from `Intl.PluralRules`; three cron loops that could repeat work indefinitely now count their own failures into their output | weak: 105 bare gates; the platform-wide daily cap; 1,108 email strings no reader of those languages has seen |

**What moved and what did not.** Money is the axis these rounds changed —
not by adding a gate but by moving a decision into the one function every
paid action already calls. Security is exactly where it was five days
ago, and what would move it is fifteen minutes of the owner's time (§Η
item 1). Truth improved in a direction worth naming: four of the
corrections were to instruments, not to product code.

**The honest one-line summary.** The code is in better shape than the
proof, the proof is where it was, and the single number that would move
the verdict most is still not a number I can produce.

---

## Ζ. Documents

`docs/v6-list.md` carries what this report leaves open — fourteen items,
of which §11 closed on the day this report was written and §14 is what
that closure left behind. `docs/shapes.md` is the pattern catalogue;
`node scripts/tests/shape-names.test.mjs` prints how many it defines (50
at the close of 2026-09-18) and resolves every `SHAPE:` reference in the
tree against it. `node scripts/scan-unread-write-errors.mjs` prints
§14's population.

---

## Η. The list for the owner — only what I could NOT verify

Six things. Each says what to press, what you should see, what it means if
you do not see it, and how long it takes.

> ### If you have ten minutes
>
> Do **number 1** and stop. It is the only measurement in this report that
> puts two real people in the database and checks they cannot reach each
> other, it takes fifteen minutes of which fourteen are you finding two
> passwords, and it has never run in a session that produced a report —
> four reports running. Everything else on this list can wait a week
> without changing what is true.

### 1. The isolation test — 15 minutes, and it is the one that matters

**What you press:**

    DATABASE_URL='postgres://…' node scripts/tests/user-isolation.dbtest.mjs

or, against the live API rather than the database:

    ISOLATION_EMAIL_A=… ISOLATION_PASSWORD_A=… \
    ISOLATION_EMAIL_B=… ISOLATION_PASSWORD_B=… \
    node scripts/tests/user-isolation-live.prodtest.mjs

**What you should see:** a run that creates two users, seeds a row for
each in every table with an owner column, and ends `ALL PASS`. Four
questions per table, and the first is `A CAN see A's own row` — the
positive control.

**What it means if it is missing:** if a table reports "A cannot see B"
**without** passing its own positive control, that table proved nothing —
the seed failed or the grant is absent, and the green is empty. If a real
failure appears, one account can read, update or delete another's rows.

**Why this one first:** every other security number in this report
describes configuration. The population is derived from PostgREST's own
OpenAPI document, so the four tables added since V5 started are already in
it and no list needs updating. What is missing is the run.

### 2. Sidebar targets — one decision, no keyboard

**What you decide:** whether V4.6's 4 groups / 20 rows / 15 readable /
1100px still bind, now that the accordion ships. Today: 6 / 26 / 7 /
1702px. `node scripts/measure-sidebar-height.mjs` prints it.

**What it means if you leave it:** `npm run test:prod` stays red at 23
checks and the next person cannot tell stale limits from real failures.

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

**And one thing this round added to the same question:** if you have ever
set a per-feature `CREDIT_MARGIN_<FEATURE>_<PLAN>` override, it moves the
charge and **not** the estimate — the estimate runs in the browser, where
that variable does not exist. Written down now in `margin-policy.ts` and
in `client-env-reach.test.mjs`. Closing it needs a `NEXT_PUBLIC_` mirror,
which is a decision about exposing pricing policy to the browser.

### 4. React #310 — needs your production

**What you press:** load `/dashboard` and `/dashboard/overview` a few
times.

**What you should see:** never the error boundary.
`scripts/tests/routes-smoke.prodtest.mjs` records it as intermittent.

**What it means if it appears:** hooks rendered conditionally somewhere on
that segment. Boundaries are in place, so a user sees a recovery screen
rather than a blank page — but they see it.

### 5. The translations — and now there are two populations, not one

**For the interface:** one reader per script — Japanese, Chinese, Arabic —
through `docs/first-run/first-run.<locale>.md`, tier 1 first. That is 47
sentences per language, roughly an hour each.

**For the emails: there is no pack, and that is the new part.** 1,108
strings across ten languages, every one written by a model, and
`grep -c '"email\.' docs/first-run/first-run.en.md` returns **0** — the
pack walks components and an email is not a component. These are the
messages a customer reads when they are *not* looking at the product: a
welcome, a sign-in warning, an agent that gave up, a week summarised. They
are read with more attention than a button, not less.

**What it means if it is wrong:** the product reads as machine-translated
in nine of its ten languages and nothing goes red. No instrument here can
tell you otherwise.

### 6. The unpaired block comment — name the file

**What you press:** nothing yet. The build compiles and `tsc --noEmit` is
clean, so it is not an unterminated comment in anything the compiler
reads. Counting `/*` against `*/` reports 107 files and cannot tell a
comment from `"*/"` inside a string — that method's precision is
approximately zero and I am not going to dress it up.

**What I need:** the file, or the round it was found in.

### And a seventh, which is mine and not yours — now closed

The full `npm run test:mutation` sweep **completed on 2026-09-17**: 169
suites, 168 green, 1 skipped, 0 red. Two suites that had been red on
`main` were repaired in the same week.

The hazard it leaves is still real and worth knowing: a **stopped** sweep
leaves its last mutation applied. It happened twice in this session — once
to `src/lib/coding/highlight.ts` — and `node scripts/check-mutation-tree.mjs`
is what tells you, with `node -e 'await import("./scripts/tests/lib/sidecar-write.mjs")'`
to heal it. Check `git status` for files you did not edit before any
`git add -A` that follows a sweep.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
