# V4 — closing report

Written at the end of V4.6, to be read before V5 starts.

This is not a summary of what was built. It is an account of **how much of
this system is actually known to work, by what means, and what is still
taken on trust** — because the recurring failure in V4 was not a broken
feature. It was an instrument reporting health it had not measured.

---

## 1. The verdict

**74%.** Four axes, each computed as *(what is checked mechanically) ÷
(what could be)*, averaged, with the remainder named rather than rounded
away.

| Axis | Score | What the score rests on |
| --- | --- | --- |
| Security & data | **81%** | Two-account isolation proven at the database; not through a production session, and the tested database is a model — now checked against production on three points |
| Money | **75%** | Every path instrumented; no real money has moved under test |
| Structural verification | **80%** | 221 gates; 98 of them named by a mutation suite |
| Live verification | **60%** | Production healthy; most of the surface needs an account to reach |

**IT WENT 75 → 73 → 74, AND NEITHER MOVE IS ABOUT THE PRODUCT.** It fell
when the denominator gained a component it had been missing — whether the
database being measured resembles production — and it rose when three
questions were put to the real database and answered. The product's
security improved throughout: 89 grants revoked in production, 96 tables
and 3 storage buckets proven, ten storage policies exercised instead of
counted. On the denominator V4 was using, security reads **92%**; that
ruler is kept here only so the two are not confused.

> **CORRECTION, and it is the largest in this document.** The sentence
> above used to read *"a real hole was found and closed in production …
> ten storage policies went from decoration to load-bearing"*. The
> decoration was in the **fixture**. `storage.objects` was created
> without row level security by `scripts/db/bootstrap-supabase.sql`, and
> that is where account A read account B's private file. Production was
> never asked. It was asked on 2026-09-05 —
> `select relrowsecurity from pg_class where oid =
> 'storage.objects'::regclass` — and answered **true**: the ten policies
> were load-bearing there the whole time.
>
> The real hole closed in production this round was the **89 grants**,
> which is a separate incident in the opposite direction. What the
> storage divergence cost was not safety but **coverage**: on the only
> database any gate can reach, those ten policies were inert, so one of
> them saying `using (true)` would have gone unnoticed. That is worth
> fixing and it is fixed — but it is not what I said it was.

The published number is the five-component one, because the four-component
denominator never counted *whether the database being measured resembles
production* — and that omission is exactly what hid 89 grants. A verdict
that leaves out the thing which hid the defect is an instrument reporting
health it has not measured, which is the failure this whole document is
about. §Axis 1 shows the weights so they can be argued with separately
from the arithmetic.

The number is deliberately not higher. Every point above came from
something that could be re-derived on demand; the missing points are named
rather than rounded away.

### Axis 1 — Security & data: 81%, on a ruler that gained a component and then got used

| Checked | How it was measured |
| --- | --- |
| RLS on **106 / 106** tables | Live, against an ephemeral Postgres built from all 64 migrations |
| Grants: no function executable by `anon` or `authenticated` unexpectedly | Live, same database |
| **96 / 96** user-owned tables probed with **two accounts** | Live, `user-isolation.dbtest.mjs`, impersonating `authenticated` |
| **3 / 3** storage buckets probed with the same two accounts | Live, same suite — the file, not the row about it |
| `search_path` pinned on **46 / 46** `SECURITY DEFINER` functions | Migration scan |
| **91 / 91** functions taking a `userId` use it as a filter or owner column | AST |
| **128 / 128** API routes scanned for service-role misuse | AST |
| Owner-only components reachable only behind a real guard | The guard's *shape*, not the presence of two words |
| Every column a Supabase call names exists on the table it names | Live, authoritative |
| **8** facts the test database must model, **5** divergences that remain, **3** answers from production | `stub-vs-production.test.mjs`, 18 checks, 10/10 mutations |

**THE ISOLATION TEST EXISTS NOW.** Two accounts are seeded into every one
of the 96 user-owned tables and, inside a session that has done
`set local role authenticated` and `set local request.jwt.claim.sub`, four
questions are asked per table: can A see B's row, update it, delete it,
and can a write with **no WHERE** reach it. The last one is there because
a predicate reads a column, so SELECT policies apply to it and B's row is
already invisible to the WHERE — a targeted probe cannot see an unscoped
UPDATE or DELETE policy at all. Not one question answers yes. Three
storage buckets are probed the same way. The suite carries its own
positive control and a live demonstration that it can go red, and **9 of 9
schema mutations turn it red**.

**AND IT FOUND TWO REAL THINGS**, in opposite directions, both because the
database the gates run against is not the database that matters.

- The stub set **no default privileges** where Supabase grants ALL on
  every table to `anon`, `authenticated` and `service_role`. So
  `db_exposure_report`'s `grant_without_policy` had been reporting **zero**
  against a database more locked down than production. Corrected, it
  reported **89 (table, verb) pairs** granted to `authenticated` with no
  policy covering them — `user_credits`, `credit_transactions`,
  `ai_cost_log`, `affiliate_payouts`, `production_errors` among them.
  `20260926000000` revokes them; it has been applied to production.
- `storage.objects` was created here **without row level security**, and
  `authenticated` had no USAGE on the storage schema, so the **ten**
  policies the migrations put on it were inert on two counts. Measured
  before the fix, **in the fixture**: account A read account B's private
  file. **Production has RLS on** (asked 2026-09-05) — so this one cost
  coverage, not safety: nothing here could evaluate those policies, and
  nothing would have noticed if one had said `using (true)`.

#### Why the number moved: 85 → 78 → 81

**85 → 78** because the denominator was wrong, and last round showed it.
The 85% scored five components as four: it never counted *whether the
database being measured resembles production*. Three of the rows above
are live against that stub, and the stub has now been wrong twice, in
both directions. A score that omits the thing which hid 89 grants is
itself an instrument reporting health it has not measured.

**78 → 81** because the component the denominator gained was then
partly *filled*. Three questions this repository cannot ask were put to
production by hand and answered (§1, *The three questions production answered*). Two of the five named divergences
are bounded by those answers, and the one that read worst — the storage
policies — turns out to be a fixture defect, not a production one.

The weights are a judgement and are written down so they can be argued
with separately from the arithmetic:

| Component | Weight | Done | Contribution |
| --- | --- | --- | --- |
| Schema correctness — RLS, policies, grants | 30 | 0.93 | 27.9 |
| Code scoping — 91 functions, 128 routes, guard shapes | 25 | 1.00 | 25 |
| Two-account isolation, **at the database** | 20 | 1.00 | 20 |
| Two-account isolation, **through a production session** | 15 | 0.00 | 0 |
| Fixture fidelity — is the tested database production? | 10 | 0.85 | 8.5 |
| | | | **81.4 → 81** |

Schema correctness is 0.93 rather than 1.00 for the same reason fixture
fidelity is not 1.00: it is measured against the model. Both moved up
this round for one reason and it is worth being exact about it — **not
because anything in the code changed, but because production was asked
three questions and answered them.** Fixture fidelity went 0.60 → 0.85;
schema correctness 0.90 → 0.93, because the grant half of it is the half
those answers touched.

Nothing re-asks those three. If production changes tomorrow, this score is
stale and no gate here will say so — which is why they are recorded with a
date, in *The three questions production answered* below, rather than
folded into a green tick.

**On the four-component denominator the number reads 92%, and that is the
one that answers "did security improve".** It did: **89 grants** that
production really held were revoked there, **96** tables and **3** storage
buckets are proven with two accounts, and the ten storage policies are now
exercised by a gate instead of merely counted. What moved on the
five-component ruler is not the product — it is how much of the
measurement is itself measured.

**The 19% that is missing, named.**

1. **Two real accounts through PostgREST, in production** (15). Everything
   above impersonates. It proves RLS scopes correctly *given* `auth.uid()`;
   it does not prove GoTrue issues the claim the policies read, nor that
   the deployed schema is this one. Nothing in this round touched it.
2. **Fixture fidelity** (1.5 of 10). Five divergences remain, each named
   in `stub-vs-production.test.mjs` with the direction it fails in. Two
   are now bounded by an answer from production; the two that are not are
   the extension layout and the shape of the JWT claim `auth.uid()` reads
   — and the second of those is the same thing item 1 covers.
3. **Schema correctness against the model** (2.1 of 30). The same caveat,
   applied to the three rows that are live rather than AST.

### The three questions production answered — and why they are not a gate

This repository cannot reach the real database: no credentials, no
network path, deliberately. These were run by hand by the owner on
**2026-09-05** and are recorded in §2b of
`scripts/tests/stub-vs-production.test.mjs`, where a gate holds each one
to a date, an exactly-quoted query and a line of the register it bounds.

| Query | Answer | What it bounds |
| --- | --- | --- |
| `select relrowsecurity from pg_class where oid = 'storage.objects'::regclass` | **true** | The ten storage policies are load-bearing in production and always were. The leak measured here was the fixture's. |
| `select rolname, rolbypassrls from pg_roles order by 1` | no role carries an unexpected `rolbypassrls` | The seven roles the stub does not model cannot read past a policy — the way their absence could have mattered most. |
| `select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where grantee not in ('anon','authenticated','service_role','postgres') order by 1,2,3` | one object: `pg_stat_statements` — SELECT to `PUBLIC`, all privileges to `dashboard_user` | The sharpest thing the grant checks cannot see. Supabase's own diagnostics; no table of user data. |

**None of these is a gate, and the distinction is the point.** Nothing
re-asks them. Production can change the hour after they were answered and
every suite here will keep passing. They are stamped with the day they
were true, they bound rather than prove, and §1 of that register still
requires the stub to model storage RLS *regardless* of the first answer —
because deleting that line would make the ten policies untestable again,
which is what the divergence cost in the first place. There is a mutation
that proves that clause is load-bearing.

### Axis 2 — Money: 75%

| Checked | |
| --- | --- |
| `billing-coverage` | 729 checks — every `runCompletion` records its usage; every feature has a margin key |
| `money-races`, `combined-ceiling` | 28 + 99 checks on concurrent settlement and ceilings |
| `credit-flow`, `revenue-engine` | 65 + 43 checks, live against a real Postgres |
| Paywalls fail closed in **both** directions | Added in V4.6 — see the `-1` catalogue below |

**The 25% that is missing, named:** **no real money has moved through this
system under test.** No end-to-end Stripe charge, no refund, no webhook
replay. And the margin figures are computed from a price table that has
**never been reconciled against an actual provider invoice** — the system
is internally consistent about money it has never counted.

### Axis 3 — Structural verification: 80%

- **221** unit suites; **18,529** passing assertions in `npm run build`
- **91** mutation suites; **1,540** declared mutations across **389** files
- **11 meta-gates that check the gates**: vacuity, stale anchors,
  state-vs-behaviour, suite shape, import paths, export drift,
  self-claims, mutation markers/tree, shape names, stub-vs-production,
  and mutation-runner honesty

**The 20% that is missing, named:** **98 of the 221 gates (44%) are named
by a mutation suite.** The other 123 have never been shown to go red on
the defect they describe. A gate without that proof is a gate whose
clauses might all be decorative — which is precisely the failure this
project found four times in its own instruments.

> **CORRECTION.** The first version of this document said *107 of 218
> (49%)*. That number cannot be re-derived: counting gates whose name has
> a matching `.mutation.mjs` gives 85, and counting gates *named* by any
> mutation suite — the looser and more generous reading, and the one the
> sentence means — gives 98. Neither is 107. The figure above is the
> second, and it is reproducible:
>
>     node --input-type=module -e 'import{readdirSync,readFileSync}from"node:fs";const D="scripts/tests";const t=new Set();for(const f of readdirSync(D).filter(f=>f.endsWith(".mutation.mjs")))for(const m of readFileSync(`${D}/${f}`,"utf8").matchAll(/"(scripts\/tests\/[a-z0-9-]+\.(?:db)?test\.mjs)"/g))t.add(m[1]);const u=readdirSync(D).filter(f=>f.endsWith(".test.mjs")).map(f=>`scripts/tests/${f}`);console.log(u.filter(f=>t.has(f)).length,"of",u.length)'
>
> A number in a document that nobody can reproduce is the shape this
> document exists to name. It was in the row that names it.

### Axis 4 — Live verification: 60%

| Executed live | Result |
| --- | --- |
| Production `/api/health` | `{"schema":{"ok":true,"checked":16,"functions":"listed","missing":[]}}` |
| `public-live.prodtest` | 171 / 171 against the real URL |
| `health-probe.prodtest` | 32 / 32 |
| `language-visible.prodtest` | 115 / 115 |
| 24 dbtests + `db-migrations` | **1,137** checks across **25** suites, real Postgres from the migrations |
| `/offline` in ten languages | Real build, real Chromium, real service-worker install, network actually cut |

> **CORRECTION.** This row said *283 checks*. That was `db-migrations`'s
> own summary line — the last suite `npm run test:db` runs — read as the
> total for the run. The measured total is 1,137 across 25 suites:
> `npm run test:db 2>&1 | grep -c '^  PASS  '`. The same mistake was made
> out loud one round earlier, reporting "287 passed" as the whole database
> run when it was one suite. A number copied off the last line of a log is
> not a measurement.

**The 40% that is missing, named:** **35 of the 41 prodtests require a
signed-in account** and cannot run in an automated environment without
one. The live surface that is exercised is the public one.

---

## 2. What we do not know yet

Four things. Each is stated as a question nobody here can answer, not as a
task somebody forgot — and each names what *would* answer it, so a later
round can tell whether it has been answered or merely discussed.

### 2.1 Isolation through PostgREST, with two real accounts

**What is proven.** `scripts/tests/user-isolation.dbtest.mjs` seeds two
accounts into **96 user-owned tables** and **3 storage buckets**, and
inside a session that has done `set local role authenticated` and
`set local request.jwt.claim.sub`, asks four questions per table: can A
read B's row, update it, delete it targeted, delete it blanket. 22 checks,
green, against a real Postgres built from all 64 migrations. Its own
mutation suite stages nine real leaks — `using (true)`, RLS switched off,
an unscoped UPDATE, an unscoped DELETE, storage RLS off — and **9 of 9**
go red.

**What is not.** That whole apparatus proves RLS scopes correctly *given*
`auth.uid()`. It does not prove that GoTrue issues the claim those
policies read, nor that the schema deployed to production is this one.
The stub's `auth.uid()` reads the singular `request.jwt.claim.sub` GUC;
PostgREST sets the plural `request.jwt.claims` JSON. That divergence is
named in the register and it is exactly this gap.

*Answered by:* two real signed-in accounts, A's session issuing every read
the app issues, asserting not one row of B's comes back. It is 15 of the
100 points on axis 1 and nothing else moves it.

### 2.2 Stripe end to end — needs real money (V8)

The billing code is the most heavily instrumented part of this system and
the least *witnessed*. Reserve → execute → settle is proven by 729 checks
and a live database; a charge landing on a card is proven by nothing. The
gap is not knowledge, it is a transaction nobody has run.

*Answered by:* one real payment, and one real refund, reconciled against
`ai_cost_log` and the margin table for the same period.

### 2.3 The five people — V7.5

Every judgement in this repository about whether a screen is
understandable has been made by the people who wrote it. That is a known,
structural blind spot: no amount of instrumentation detects a sentence
that is clear to its author and opaque to everybody else.

*Answered by:* five readers, once, in their own language, with nobody
explaining anything to them first.

### 2.4 The five stub/production divergences

The database every gate runs against is a model. It has been wrong twice
already, in opposite directions — once stricter than production (hiding
89 grants), once looser (leaving ten storage policies inert here while
production enforced them). Five differences remain, each in
`scripts/tests/stub-vs-production.test.mjs` with the direction it fails in
and a predicate checked both ways:

| Divergence | Direction | What it costs |
| --- | --- | --- |
| Extensions live in `public` here; a Supabase project may keep them in `extensions` | either | Nothing observed: ⌘K returns rows in production through a chain that cannot resolve unless `unaccent` is in `public` there too, and the migration is written for both layouts. |
| `auth.users` has 6 columns here, ~30 in GoTrue | safer | Nothing: a query naming a column the stub lacks fails **loudly** here and works there. The reverse would be dangerous and cannot happen. |
| No `auth.jwt()` / `auth.email()` here | safer | Nothing *while* nothing depends on them — checked, not assumed: 0 calls across 64 migrations, against 256 `auth.uid()` calls. |
| `auth.uid()` reads the singular GUC; PostgREST sets the plural JSON | either | The named half of §2.1. It is why that suite proves scoping and not authentication. |
| Five roles here, ~twelve in a Supabase project | safer | The grant checks name `anon` and `authenticated` explicitly. **Bounded twice:** a GRANT to a role the stub lacks fails here, so this repository cannot create one; and production was asked once (§1, *The three questions production answered*) and held one object, `pg_stat_statements`. Once is not a gate. |

*Answered by:* making the grant checks role-agnostic — "which roles hold
this, and is each one on a named list" — which needs no production access
and is item 8b on the V5 list.

---

## 3. The catalogue of shapes

The working list ran to twenty-three shapes. What follows are the ones that
can each be tied to a **real incident in this repository** — not a category
somebody imagined, but a defect that shipped, and what now catches it.

**The numbering drifted, and it is now retired.** The working list
numbered these 1–23; two comments in the code numbered themselves
independently and disagreed with it, and nothing anywhere could tell a
reader which was right. So the catalogue moved to `docs/shapes.md`, where
the entries have **names and no numbers**, and a comment refers to one in a
single spelling — `SHAPE: <name>` — that `scripts/tests/shape-names.test.mjs`
resolves against that document's headings. The table below is the same
catalogue in summary; `docs/shapes.md` is the copy that is kept current.

Shapes 1–7 of the working list have no incident recorded here that can be
sourced, and are therefore not reproduced: writing them from memory is
exactly the kind of unchecked claim this document exists to stop.

| Shape | The incident | What catches it now |
| --- | --- | --- |
| **Stale anchor** | A mutation's `from` string stops existing, so the suite silently tests nothing. Six occurrences, most recently two caused by V4.6's own changes and two in `icu-quoted-placeholders` pointing at a quoting form the catalogue had moved away from. | Every suite reports `STALE` and exits non-zero; `check-mutation-tree` enumerates all 1,540 anchors |
| **Vacuous assertion** | `check("no X", found.length === 0)` over a scan that found no files at all — the check passes hardest when it is broken. Caught twice in V4.6, in gates written that same day. | `gate-vacuity.test.mjs` — every emptiness assertion over a scanned collection needs a floor |
| **Runtime string in an import path** | A specifier assembled at runtime that no compiler resolves. | `gate-import-paths.test.mjs` — 75 `@/` specifiers and 2,101 repository paths across 386 gates |
| **A check that cannot go red** | `check("applies twice cleanly", true, true)` — the truth asserted is that the line was reached. | `gate-vacuity.test.mjs`, tautology section |
| **`-1` in a position comparison** | `indexOf` answers "not here" with a number that is a valid index. Five live instances found in V4.6, including a paywall that would open for every free account the day a plan slug was added. | `not-found-index.test.mjs` + 8 mutations |
| **Many mutations in one dimension** | A suite with thirty mutants that all vary the same thing, reporting 30/30 while one axis goes untested. | `mutation-suite-shape.test.mjs`, 521 checks |
| **A test that supplies its own arguments** | The fixture and the assertion agree because the same hand wrote both, and neither touches the product. | `mutation-suite-shape.test.mjs` |
| **An optimisation that removes without proving what remains** | Trimming a message catalogue by 93% and asserting only that it got smaller. | `message-slices.test.mjs` — every namespace a group can reach must be declared |
| **A fixture that is not production** | Wrong in **both directions**. *Stricter:* no default privileges, so `grant_without_policy` reported zero while production carried **89** granted (table, verb) pairs. *Looser:* no RLS on `storage.objects`, so ten policies were inert **here** — account A read account B's private file in the fixture, while production had RLS on the whole time (asked 2026-09-05). The first was a hole; the second was a blind spot that reads the same in a green log. | `stub-vs-production.test.mjs` — 8 facts the fixture must model, 5 divergences that remain each with a direction and a predicate checked both ways, and 3 production answers each stamped with a date; 10/10 mutations |
| **A suite that never ran, counted as a pass** | `run-mutations.mjs` printed `OK   user-isolation  0s`, then `89 suites · 89 green`, then `ALL MUTATION SUITES GREEN`, for a run in which that suite skipped for want of a database and applied none of its nine schema mutants. Sixteen files in `scripts/tests` can print such a line. | `lib/mutation-outcome.mjs` answers green/skipped/red; `mutation-runner-honesty.test.mjs`, 33 checks, 8/8 mutations |
| **A technically-true comment that reads as complete** | `injection-patterns.ts` said its patterns "cover the obvious cases in more than one language". True — two of ten. A Spanish override went through untouched. | `language-extremes.test.mjs` — a coverage claim must name how many |
| **A gate measuring final STATE instead of BEHAVIOUR** | `chat-scroll.prodtest.mjs` asserted where the scrollbar ended up, not that the scroll happened. | `gate-state-vs-behaviour.test.mjs` |
| **A wiring check that never sees a VALUE** | The owner-only check asked whether a page *mentions* `isAdminEmail` and *mentions* `notFound`. `void isAdminEmail;` keeps both words, opens the cost dashboard to every customer, and the check stayed green — killed by its own mutation suite the day it was written. | `i18n-coverage.test.mjs` reads the guard's shape; 5/5 mutations |
| **A gate that pins a bug the product fixed** | `offline-state.test.mjs` **required** that `/offline` still said "You're offline" in English and still carried the excuse for why. Both were false. Fixing the page meant turning a gate red. | Replaced by checks on what has to be true for a Greek reader with no network; `offline-locale.mutation.mjs`, 6/6 |
| **A statement that was once true and nobody re-asked** | The README said two cron jobs were unscheduled; both had been in `vercel.json` for weeks. `i18n-coverage`'s header said "86 of these still ship" when 160 did. | `self-claims.test.mjs` — every path a comment names must resolve, held at zero |
| **The defence existed, was correct, and was wired at one place** | `trading/conduct.ts` described three layers of protection in the present tense. Only the third was running: nothing in the trading feature calls a model, so there is no output to scan. A safe state, not a checked one. | `trading-journal.test.mjs` — a model call in that feature without a conduct scan fails the build |
| **Code correct by coincidence** | `ArrowDown` on a freshly-opened menu was right because `-1 + 1 = 0`. `ArrowUp` on the same line was wrong. | `roving-index.ts` makes the not-found case a branch; tested at 0 · 1 · -1 · length · NaN · Infinity · undefined |
| **An instruction requested rather than enforced** | The website prompt *asks* for an English image query. A Greek `λογότυπο` placeholder is then not recognised as a logo, and whatever the photo library returns is published as the business's own mark. | `ascii-boundaries.test.mjs` — a non-Latin query is stripped, not searched |

### The one that has no gate

**`\b` is ASCII.** JavaScript's word boundary is defined against
`[A-Za-z0-9_]`, and the `u` flag does not change it — it is the *boundary*
that is ASCII, not the pattern. `\bπροτείνω\b` matches nothing, silently,
in one language. This has broken four features here. It is now scanned
(128 occurrences, classified) and the two live instances are fixed, but the
scan cannot tell a legitimate `<img\b` from a Greek word without reading
the surrounding intent. It is held by convention and one heuristic.

---

## 4. What V4.6 measured about itself

Numbers a reader can re-derive, not summarise:

| | |
| --- | --- |
| `npm run build` | exit 0 — 221 suites, 18,529 assertions |
| Mutation suites | 91 / 91 complete, 0 skipped; 1,540 declared mutations over 389 files — see the correction below |
| Gates with adversarial proof | **98 of 221 (44%)** — see the correction in §1 |
| i18n | 2,868 keys × 9 locales, 0 untranslated |
| Hardcoded English on a customer screen | **0** (160 remain: 123 legal texts, 37 owner-only diagnostics, both classified and checked) |
| Path claims in comments and docs | 2,387 scanned, **0 unexplained**; 18 findings covered by 17 exception entries across 6 files, each with a reason and a staleness check in both directions |
| Symbol claims in comments | 1,473 scanned, 24 unresolved, **1 genuinely wrong** — precision ≈ 4%, measured and **not** gated |

> **CORRECTION.** The row above read *90 / 90 complete* on the strength
> of a sweep whose log ended `89 suites · 89 green · 0 red` and `ALL
> MUTATION SUITES GREEN`. One of those eighty-nine was
> `user-isolation.mutation.mjs`, which mutates the database schema, found
> no `DATABASE_URL`, printed one `SKIPPED:` line and exited 0 — so none
> of its nine mutants were applied and the runner counted it green
> anyway. Its `0s` in the timing column was the only tell: re-run with a
> database attached, the same suite reports **430s**.
>
> The nine mutants ARE caught — measured separately, against a real
> Postgres, twice this round. What was false was the sweep's arithmetic,
> not the coverage. `scripts/tests/run-mutations.mjs` now answers
> green / skipped / red, never derives green by subtraction, and will not
> print “all green” when anything was skipped;
> `scripts/tests/mutation-runner-honesty.test.mjs` holds that, with eight
> mutations of its own. The number above was re-measured with a database
> attached, so nothing in it is a skip.

That last row is the shape of this whole document. A check with 4%
precision gets its baseline set to the size of the problem, which is the
same as deleting it. So the number is printed and the assertion is not
made — and saying so is worth more than a green tick would be.

---

## 5. The rule V4 ends on

> Every statement about this repository is checkable, or it does not
> exist.

Held mechanically for paths (zero, with a stale-checked exception table)
and for `Run:` headers (each must name the file it heads — six did not).
Not held for numeric claims, which are instead **derived where they are
printed** rather than written down twice.

The reason it is the closing rule and not a footnote: every instrument
failure in V4 — all four — was a sentence about the code that had stopped
being true, in a file whose comments were otherwise the most reliable
documentation in the project. The comments are worth having. That is
exactly why a wrong one is expensive.
