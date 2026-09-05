# V4 — closing report

Written at the end of V4.6, to be read before V5 starts.

This is not a summary of what was built. It is an account of **how much of
this system is actually known to work, by what means, and what is still
taken on trust** — because the recurring failure in V4 was not a broken
feature. It was an instrument reporting health it had not measured.

---

## 1. The verdict

**75%.** Four axes, each computed as *(what is checked mechanically) ÷
(what could be)*, with the remainder named rather than rounded away.

| Axis | Score | What the score rests on |
| --- | --- | --- |
| Security & data | **85%** | Schema and code proven; live multi-user isolation unproven |
| Money | **75%** | Every path instrumented; no real money has moved under test |
| Structural verification | **80%** | 218 gates; 107 of them adversarially proven |
| Live verification | **60%** | Production healthy; most of the surface needs an account to reach |

The number is deliberately not higher. Every point above these came from
something that could be re-derived on demand; the missing points are three
specific things that cannot be closed from a keyboard.

### Axis 1 — Security & data: 85%

| Checked | How it was measured |
| --- | --- |
| RLS on **106 / 106** tables | Live, against an ephemeral Postgres built from all 64 migrations |
| Grants: no function executable by `anon` or `authenticated` unexpectedly | Live, same database |
| `search_path` pinned on **46 / 46** `SECURITY DEFINER` functions | Migration scan |
| **91 / 91** functions taking a `userId` use it as a filter or owner column | AST |
| **128 / 128** API routes scanned for service-role misuse | AST |
| Owner-only components reachable only behind a real guard | The guard's *shape*, not the presence of two words |
| Every column a Supabase call names exists on the table it names | Live, authoritative |

| **96 / 96** user-owned tables probed with **two accounts** | Live, `scripts/tests/user-isolation.dbtest.mjs`, impersonating `authenticated` |

**PART OF THE NAMED 15% IS NOW CLOSED, and it is worth being exact about
which part.** `scripts/tests/user-isolation.dbtest.mjs` seeds two accounts
into every one of the 96 user-owned tables and, inside a session that has
done `set local role authenticated` and `set local request.jwt.claim.sub`
— the mechanism production uses — asks four questions per table: can A see
B's row, update it, delete it, and can an unpredicated write reach it. Not
one of them can. It carries its own positive control (A sees A's own row
in all 91 readable tables; nothing at all in the 5 sealed ones) and a live
demonstration that it can go red, and 7 of 7 schema mutations turn it red.

**What is still missing, named:** this is impersonation against a database
built from the migrations. It is **not** two real accounts holding real
sessions against production through PostgREST, which would additionally
prove that GoTrue issues the claim the policies read and that the deployed
schema equals this one. That remains untested, and it is a smaller gap
than it was rather than no gap.

**And it found something.** The stub these dbtests run against had no
grants at all where Supabase grants everything, so `grant_without_policy`
had been reporting zero against a database more locked down than
production. Corrected, it reported **89 (table, verb) pairs** granted to
`authenticated` with no policy covering them — `user_credits`,
`credit_transactions`, `ai_cost_log`, `affiliate_payouts`,
`production_errors` among them. See `docs/shapes.md`, *A gate whose
fixture is safer than production*.

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

- **219** unit suites; **18,462** passing assertions in `npm run build`
- **89** mutation suites; **1,522** declared mutations across **383** files
- **9 meta-gates that check the gates**: vacuity, stale anchors,
  state-vs-behaviour, suite shape, import paths, export drift,
  self-claims, mutation markers/tree, and shape names

**The 20% that is missing, named:** **96 of the 219 gates (44%) are named
by a mutation suite.** The other 123 have never been shown to go red on
the defect they describe. A gate without that proof is a gate whose
clauses might all be decorative — which is precisely the failure this
project found four times in its own instruments.

> **CORRECTION.** The first version of this document said *107 of 218
> (49%)*. That number cannot be re-derived: counting gates whose name has
> a matching `.mutation.mjs` gives 83, and counting gates *named* by any
> mutation suite — the looser and more generous reading, and the one the
> sentence means — gives 96. Neither is 107. The figure above is the
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
| 23 dbtests + `db-migrations` | 283 checks, real Postgres from the migrations |
| `/offline` in ten languages | Real build, real Chromium, real service-worker install, network actually cut |

**The 40% that is missing, named:** **35 of the 41 prodtests require a
signed-in account** and cannot run in an automated environment without
one. The live surface that is exercised is the public one.

---

## 2. What stays open, seriously

Three things were named at the close of V4 as unable to close now. They are
listed here so that V5 does not quietly inherit them as solved.

### 2.1 The isolation test — needs two real accounts

Not a missing test. A missing **fixture**. Every RLS policy in this app is
verified against a database; none is verified against two people. The
shape of the eventual test is known:

- two accounts, both real, both with rows in the same tables
- account A's session issues every read the app issues
- assert that not one row of B's appears

Until that exists, "row-level security is on" is a statement about
Postgres configuration, not about this product.

### 2.2 Stripe end-to-end — needs real money (V8)

The billing code is the most heavily instrumented part of this system and
the least *witnessed*. Reserve → execute → settle is proven by 729 checks
and a live database; a charge landing on a card is proven by nothing. The
gap is not knowledge, it is a transaction nobody has run.

### 2.3 The five people — V7.5

Every judgement in this repository about whether a screen is
understandable has been made by the people who wrote it. That is a known,
structural blind spot: no amount of instrumentation detects a sentence that
is clear to its author and opaque to everybody else. Five readers, once,
would answer questions no gate can be written for.

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
| **Stale anchor** | A mutation's `from` string stops existing, so the suite silently tests nothing. Six occurrences, most recently two caused by V4.6's own changes and two in `icu-quoted-placeholders` pointing at a quoting form the catalogue had moved away from. | Every suite reports `STALE` and exits non-zero; `check-mutation-tree` enumerates all 1,518 anchors |
| **Vacuous assertion** | `check("no X", found.length === 0)` over a scan that found no files at all — the check passes hardest when it is broken. Caught twice in V4.6, in gates written that same day. | `gate-vacuity.test.mjs` — every emptiness assertion over a scanned collection needs a floor |
| **Runtime string in an import path** | A specifier assembled at runtime that no compiler resolves. | `gate-import-paths.test.mjs` — 75 `@/` specifiers and 2,101 repository paths across 386 gates |
| **A check that cannot go red** | `check("applies twice cleanly", true, true)` — the truth asserted is that the line was reached. | `gate-vacuity.test.mjs`, tautology section |
| **`-1` in a position comparison** | `indexOf` answers "not here" with a number that is a valid index. Five live instances found in V4.6, including a paywall that would open for every free account the day a plan slug was added. | `not-found-index.test.mjs` + 8 mutations |
| **Many mutations in one dimension** | A suite with thirty mutants that all vary the same thing, reporting 30/30 while one axis goes untested. | `mutation-suite-shape.test.mjs`, 521 checks |
| **A test that supplies its own arguments** | The fixture and the assertion agree because the same hand wrote both, and neither touches the product. | `mutation-suite-shape.test.mjs` |
| **An optimisation that removes without proving what remains** | Trimming a message catalogue by 93% and asserting only that it got smaller. | `message-slices.test.mjs` — every namespace a group can reach must be declared |
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
| `npm run build` | exit 0 — 219 suites, 18,462 assertions |
| Mutation suites | 89 / 89 complete; 1,522 declared mutations over 383 files |
| Gates with adversarial proof | **96 of 219 (44%)** — see the correction in §1 |
| i18n | 2,868 keys × 9 locales, 0 untranslated |
| Hardcoded English on a customer screen | **0** (160 remain: 123 legal texts, 37 owner-only diagnostics, both classified and checked) |
| Path claims in comments and docs | 2,387 scanned, **0 unexplained**; 18 findings covered by 17 exception entries across 6 files, each with a reason and a staleness check in both directions |
| Symbol claims in comments | 1,473 scanned, 24 unresolved, **1 genuinely wrong** — precision ≈ 4%, measured and **not** gated |

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
