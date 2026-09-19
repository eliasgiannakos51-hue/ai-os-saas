# V6 — the list

Everything V5 left open, in the order the evidence says to take it. Every
item names what it costs to CHECK, which is usually far less than what it
costs to fix, and several of these turn out to need fifteen minutes of the
owner's time rather than a day of coding.

**Measured 2026-09-18.** Numbers that can be re-derived name the command
that derives them; read the command's number, not the sentence. This
replaces the 2026-09-13 edition: item 11 closed the same day the
multi-write sweep finished, item 14 is what that sweep left behind.

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

## 2. ~~Decide the sidebar's real targets~~ — DECIDED 2026-09-19

The owner decided it, and the decision was not a relaxation: **every
group open, all the time, scroll accepted, on the one condition that the
phone stays under three screens.**

    node scripts/tests/sidebar-density.prodtest.mjs     # 46 checks, all green
    SIDEBAR_SHOTS=/tmp node scripts/tests/sidebar-density.prodtest.mjs   # …and a PNG per viewport
    node scripts/measure-sidebar-height.mjs             # the same arithmetic, no browser

| V4.6 target | before | now | what replaced it |
|---|---|---|---|
| ≤ 4 groups | 6 | 6 | `=== 6`, the structure since 2026-09-05 |
| ≤ 20 rows in the DOM | 26 | 26 | a FLOOR of 26 — no row may silently stop rendering |
| ≥ 15 readable @1080p | 7 | 19 | floor kept; 1440 floor 15→14, said plainly to be fitted |
| all rows readable @1080p | no | no | monotonicity: a taller viewport may never paint fewer rows |
| ≤ 1100px | 1702px | 1633px @390 | ≤ 3 screens, the owner's own condition |

**What it cost to leave undecided.** The prodtest was red on 23 checks
for a fortnight and read as a sidebar problem. Inside that noise was a
real one: five of six headings stood over nothing, and the gate that
would have said so did not exist. See `docs/shapes.md`, *every gate read
the declaration; the defect was on the screen*.

**Measured 2026-09-19, in a browser, against a production build:**
1.9 screens at 390×844, 1.7 at 1440×900. With all six future rows drawn
it is 2.4 (`measure-sidebar-height.mjs`). The condition holds with room.

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

## 11. ~~The 33 multi-write routes~~ — SWEPT, 7 of 33 were broken (2026-09-18)

All thirty-three read by hand, in two sittings. The population is printed
on every run by `node scripts/tests/multi-write-reversal.test.mjs`.

| sitting | read | broken | rate |
|---|---|---|---|
| money and publishing | 10 | 3 | 30% |
| everything else | 23 | 4 | 17% |
| **total** | **33** | **7** | **21%** |

Held by `multi-write-reversal.test.mjs` (27 checks, 10/10 mutants) and
`reservation-lifecycle.test.mjs` (56 checks, 23/23 mutants).

### The enforcement question, answered

*"The state the user sees must be the LAST write"* — **as stated, no.**
`api/websites/generate/process` writes `status: "processing"` first on
purpose and its final status write comes deliberately after settlement,
so a polling client cannot read a balance the charge has not reached.
Seventeen files write durably after settling and most are right; a gate
on the stated rule would flag the tree and be turned off.

**Two narrower forms are true and both are enforced:**

1. **The helper decides.** `settleReservation` is the one function all
   forty call sites reach, so "no AI call completed" is handled there —
   it releases and writes no cost-log row. Nothing at the call sites
   changed; the forty-first will not need to either.
2. **A register with a verified mechanism.** Every file that takes a hold
   and never releases one is listed with how its holds end —
   `settles_unconditionally` (checked: no `return NextResponse` between
   the hold and the settle) or `handed_on` (checked: the named module
   releases). Four entries; an unregistered offender and a stale entry
   both turn it red. One entry was deleted the day it was written,
   because the run route started releasing and the both-ways check said so.

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

## 14. The writes whose error nobody reads — 25 left, and a decision first

    node scripts/scan-unread-write-errors.mjs

**25 of 139 route writes (18%), measured by that command, not by this
sentence.** supabase-js returns database errors in `.error` rather than
throwing, so an unread result is a write that cannot fail as far as the
surrounding code knows.

This is the population six of the seven multi-write defects came from.
**Ten were taken by priority on 2026-09-18** — state the user sees, then
credits — and four more came with them because they cannot be judged
apart:

| # | write | verdict |
|---|---|---|
| 1 | `cron/scheduled-runs` ×8 terminal status | **BROKEN** — the due query is `status = pending` with no claim column, so a status that did not land is picked up tomorrow; on the two post-AI failure branches the mission step is not `completed`, the guard does not catch it, and the AI runs again on a fresh reservation |
| 2 | `cron/scheduled-runs` `stuck_notified_at` | **BROKEN** — the column's only job is the `is null` filter one line above it; sending first and marking after, unchecked, is the one order in which it does nothing, and the stuck-generation email arrives daily forever |
| 3 | `websites/generate/process` stopped-status | **BROKEN** — the only path here that settles before writing status; a lost write leaves a charged row for `api/websites/status` to stamp *"No credits were charged"* |
| 4 | `delete-account/confirm` token give-back | **BROKEN** — *"Your link still works"* is a promise about that write; unchecked, the reassurance shipped without the fact, on the erasure path |
| 5 | `research/[id]/run` reservation hand-off | **BROKEN** — nothing else remembers the id; the chunked runner reads it off the row, and `failChunk` had nothing to give back |
| 6 | `cron/scheduled-runs` success status | minor — the mission-step guard prevents the recharge; the run row is stuck `pending` while the completion email has gone |
| 7 | `cron/scheduled-runs` insufficient-credits | minor — pre-AI, so the rerun is free |
| 8 | `research/[id]/run` insufficient-credits | minor — report stuck `processing`, nothing charged |
| 9 | `cron/agent-runs` claim | **correct** — fails CLOSED: a null result is treated as "somebody else has it" |
| 10 | `billing/addons` item-id write-back | **correct** — a cache of something `recoverSubscriptionItemId` re-derives |
| 11 | `websites/generate/process` fallback status | **correct** — it IS the fallback inside the error handler; there is nothing below it |
| 12 | `websites/generate/process` failed-status | **correct** — rescued by the stale reaper, whose message (*"No credits were charged"*) is true on that path |
| 13 | `websites/generate` reference-image mark | **correct** — same reaper, same true message; the 500 stops the browser starting the worker |
| 14 | `cron/scheduled-runs` mission-gone | minor — pre-AI |

**6 of 14 broken (43%), all six fixed.** Five of the fourteen were
correct and are held in the gate too, because the reason each is safe is
a fact about somewhere else — the claim failing closed, the recovery
being re-derivable, the reaper existing.

**What is left is a decision, not a sweep.** Most of the 25 are
legitimately best-effort: a `status: "failed"` write on a path already
answering an error, where reading the result changes nothing the route
does. A zero-offender register means ~25 written reasons, which is a
round of work. The alternative is to leave the scan reporting and re-run
it after each round.

## 15. Why the answer is hard to read while it is being written — one measurement short

**Contrast is not the cause, and that is now measured rather than
assumed.**

    CHAT_SHOTS=/tmp node scripts/tests/chat-streaming-contrast.prodtest.mjs

Nine text points on the STREAMING block — the one inside
`sending && streamingText !== null`, identified by having no "Listen"
button — read **15.71:1 at 1440×900 and 15.68:1 at 390×844** on
2026-09-19. `chat-ground-dim` is on both the finished and the streaming
answer; the source always said so, and no gate had ever photographed the
second one. `chat-measure.prodtest.mjs` seeds `chat_messages`, so every
figure behind the 2026-09-04 choice of `dim` was taken on a finished
message.

**What is left is MOVEMENT, and this harness cannot measure it.**
`route.fulfill` hands Playwright the whole NDJSON body at once, so the
component receives every delta in one burst: the streaming state it
samples is a frozen snapshot of a finished stream. A version of the file
did measure travel and printed 0px in one second — a number that meant
nothing, and was removed rather than reported.

The remaining hypothesis is `hooks/use-stick-to-bottom.ts`: the thread
sticks to the bottom as tokens arrive, so a line someone has started
reading is somewhere else by the time they finish it.

**What would settle it:** point `ANTHROPIC_BASE_URL` at a local server
emitting `content_block_delta` events with real gaps, so the app's own
streaming path runs at a real pace. That also needs the Supabase
stand-in to answer the reserve and settle RPCs, which it currently does
not. Roughly half a day.

## 16. The gates that read the same artefact as the code — swept 2026-09-19

    node scripts/scan-self-confirming-gates.mjs

**The question:** a gate that reads the same file as the feature checks
nothing — it confirms the file equals itself. How many others do that?

**Section 1 answers the census and admits it cannot do more.** Of 274
gates: 250 read at least one artefact, 102 read ONLY app source, and 79
of those also EXECUTE or RUN it rather than reading its text. 126 hold
a second KIND of artefact — migrations against TypeScript, translations
against components — which is the strongest thing short of a browser.
Its binary "self-confirming" flag scored **0 of 8 candidates real and
missed the one gate that was**, and says so in its own output.

**Section 2 is exact and is where the findings came from:** a regex
whose ONLY match in its target is inside a comment is being satisfied by
prose today. 1,344 `/regex/.test(fileVariable)` pairs resolve to a real
target; 38 match only inside a comment; 9 of those look like code.

**Five were real and are fixed** (`docs/shapes.md`, *the gate found the
sentence about the code, not the code*): four in
`navigation-cost.test.mjs` anchored on `ONE WAVE, NOT A QUEUE` and
`requestIdleCallback`, and one in `example-prompts.test.mjs` that was
green on `min-h-[36px]` — the value its own fix had removed, surviving
only in the comment that records the rejection.

**What is left:** the remaining candidates in section 2, several of
which deliberately anchor across a comment AND the code under it, which
is legitimate. They are listed on every run and settled one at a time by
mutating the source — never by reading the gate.

