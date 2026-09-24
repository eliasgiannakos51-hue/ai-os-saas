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

## THE BUILD ORDER — eight features, and it is a different list from the numbers below

**Read this first, because two things in this repository are now called
"V6 #1".** The numbered items below are ENGINEERING debt V5 left open —
the isolation test, the guards, the mutation coverage. The eight
features here are what the product gains, in the order the owner
accepted on 2026-09-23. When a report says "V6 #1" without qualifying
it, it means **Meeting → actions**, the feature; the engineering items
are cited as "v6-list #N".

| # | feature | how much was already there | state |
|---|---|---|---|
| 1 | **Meeting → actions** | transcription, billing, minute caps — the "→ actions" half was missing entirely | **built 2026-09-23**, see below |
| 2 | Universal memory | `chat_memory` exists; it is read in one feature | next |
| 3 | Images | nothing | analysis first |
| 4 | Email / Calendar | Gmail, partly | — |
| 5 | Browser agent | nothing | analysis only, do not build |
| 6 | Video | nothing | analysis only |
| 7 | Music | nothing | analysis only — the question asked is whether it is worth anything |
| 8 | Computer use | nothing | analysis only, and it waits for V7's verification layer |

The order is not arbitrary and the first column is why: 1 and 2 are the
two where most of the machinery already exists and only the last step is
missing, so they are the cheapest real gain per hour. 5 and 8 are last
because they are the two that can take an irreversible action on
somebody's behalf.

### 1. Meeting → actions — BUILT 2026-09-23

    node scripts/measure-meeting-limits.mjs     # the ceilings, from the tree
    node scripts/tests/meetings.test.mjs        # 57 checks
    node scripts/tests/meetings.mutation.mjs    # 13 of 13 caught
    node scripts/tests/meetings.prodtest.mjs    # 43 checks, a real build

Upload or record → transcript → summary → **a list of proposed actions
(who, what, when) that are inert until the user keeps them.**

**The ceiling is measured, not chosen.** See the section under item 37
below: the request body cap is what binds, and the number the product
enforces is derived from it in code rather than typed in two places.

**The audio is never stored.** Not "deleted promptly" — there is no
bucket, no column and no cron. It exists as a `Blob` in one function's
memory and is unreferenced when that function returns, exactly as
`/api/voice/transcribe` already worked. The ten-language notice says so
before the file picker opens, because the people in the recording did not
consent to anything and the person uploading is the only one who can tell
them.

**No action is ever created automatically.** The model's output is stored
as JSON **on the meeting row**, where it is data about the meeting and not
an entity anywhere. `meeting_actions` only ever receives rows the user
pressed Keep on, and a gate asserts that the insert exists in exactly one
route.

**Three things the gate found in the code that wrote it**, which is the
argument for writing the gate in the same commit rather than the next one:

1. `parseAnalysis` accepted a JSON **array** and returned its first
   element as though it were the whole answer — the parser inventing, in
   the function whose comment forbids exactly that.
2. The notice check measured `length > 30`, and the Chinese privacy
   sentence is 29 characters. That is the **third** ASCII-length rule in
   two days (`docs/shapes.md`, "A rule about ten languages, written as a
   number of characters"); it now asks whether the ten sentences are ten
   DIFFERENT sentences, which is script-neutral.
3. The parser had **two** guards against the array case and the mutation
   sidecar showed one of them was doing nothing. One survives, and it is
   the more general one.

**And two more that only a real request could find.** The prodtest
builds the product, starts it, and drives the three routes against
stand-in providers reached through their own documented base-URL
variables:

4. **Whisper returns a language NAME, not a code.** `verbose_json`
   answers `"language": "greek"`; every unit test had fed `"el"`. So
   `languageNameFor` resolved to nothing and the prompt said *"held in
   the language it was recorded in"* for **every meeting** — in the one
   feature whose entire point is the language. Invisible to any test
   that supplies its own input. The column stores a normalised code now.
5. The keep route's injection guard had never had an injection sent at
   it. It holds: a body carrying its own `what` gets its sentence
   dropped, because the text is re-read from the row by index.

**What is still NOT proved, stated rather than implied:** whether a real
recording of a real Greek meeting comes back with the right NAMES in it.
The transcript in the prodtest is one the test wrote. No gate in this
repository can answer that; a person with a recording can, in about a
minute, and `meetings.test.mjs` §7 says so in the file.

---

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

## 5. ~~The 10 English-anchored gates~~ — DONE 2026-09-20

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

**Done, 2026-09-20.** All ten converted to needles resolved out of
`<html lang>` and that locale's own messages file
(`scripts/tests/lib/ui-text.mjs`, now with `uiFormat` for ICU plurals
and `quoteForSelector` for Playwright selectors). The BREAKS list is
**gated at zero** by `scripts/tests/english-anchored-gates.test.mjs`
(19 checks, 9 of 9 mutations caught), with **two** written exceptions,
each checked both ways:

| kept | why |
|---|---|
| `!/An agent cannot/` on a Greek page | the assertion IS that the English sentence is absent; resolving it through the page makes it say nothing |
| `"Every morning"` in background-jobs | not a product string — it is that file's own fake Anthropic's suggestion, echoed back. The scan's one mis-attribution of ten |

**Three things came out of it that the list did not ask for:**

1. `published-site-seo` asserted `!/not available/i` about a page
   whose heading is *"This site isn't available"* — the same vacuity
   with no locale in it, green on every run since it was written. Its
   harness also served a straw 404 with no `<h1>`; both halves now come
   from the route file.
2. **The guard against the vacuity had the vacuity's own shape.**
   `uiTextStrict` refused any needle under three characters, and
   "Succeeded" is 成功 — two characters, the whole word. It would have
   THROWN on a working Japanese product. Found by the new gate running
   every key through all ten messages files; eight of nine hits were
   CJK. The floor is script-aware now and pinned from both ends.
3. Ten more literals that the scan does not report, because they are
   not verbatim values in `en.json`: `input[aria-label="Primary colour
   (hex)"]` is `${t("primary")} (hex)`, and `/7/` was the entire
   assertion about a sentence, in a product where a digit survives
   translation.

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
prose today. The three figures it prints — pairs resolved, prose-only,
code-shaped — are produced by the scan on every run; do not read them
from here. At the close of the sweep they were 1,278 · 28 · **1**, and
that one is the exception described below.

It started at 1,344 · 38 · 9. Four of the nine were the scan being
wrong rather than the gate: `gdpr-coverage` and `clarification-verdict`
strip their source before testing it (one through a helper, one through
a `.replace().filter()` chain written in place) and the scan resolved
the variable to the raw file; `empty-states` and `help-articles` the
same. A name bound twice, or bound through anything at all, resolves to
nothing now. And it reported *itself*: the note explaining a regex it
had just removed was read as a live check, so it strips the gate's own
comments first.

**Eleven were real and are fixed** (`docs/shapes.md`, *the gate found
the sentence about the code, not the code*). Five in the first pass:
four in `navigation-cost.test.mjs` anchored on `ONE WAVE, NOT A QUEUE`
and `requestIdleCallback`, and one in `example-prompts.test.mjs` that
was green on `min-h-[36px]` — the value its own fix had removed,
surviving only in the comment that records the rejection. Six in the
second, each settled by MUTATION and not by reading: `agent-depth`
("a fill failure still creates the agent" stayed green with `throw err;`
added under the logging), `user-photos` ("…and fails open" stayed green
with a `return;` beside the words), `context-optimization` ("…and judges
blind" — now the three code facts: the arms are swapped, the prompt
names neither, the verdict is decoded back through the swap),
`job-consumption` ×2 (the code half was real, but the comment was the
locator, so rewording it reddened a gate about behaviour), and
`research-reliability` (a legitimate machine-read marker, but the gate
held a second copy of the build step's regex — it runs `applyToSource`
now).

Two more came out of the neighbourhood rather than the list:
`mutation-sidecar` proved a file gitignored by searching `.gitignore`
for its name, which a `!` line one row below leaves untouched — it
evaluates the rules in order now, negations included, and agrees with
`git check-ignore` on twelve paths. And `context-optimization` held a
`|| /is false/` disjunct that would have kept a documentation check lit
off any other sentence in the file.

**Nothing is left open, and it is a gate now rather than a report.**
`scripts/tests/prose-anchored-checks.test.mjs` holds the code-shaped
count at its baseline, with one allowed entry carrying its reason and
checked BOTH ways so the list cannot go stale. A new check anchored on
prose fails the build and the failure says what to do.
`prose-anchored-checks.mutation.mjs` puts two of the six defects back
and empties the scan in four places — 6 of 6 caught.


## 17. What every gate has to disagree with — swept 2026-09-19

    node scripts/scan-gate-independence.mjs
    node scripts/tests/gate-independence.test.mjs
    node scripts/tests/gate-independence.mutation.mjs

**The question, widened:** item 16 answered "which gates are satisfied
by a comment" for one narrow mechanism. This asks the general form —
what does each suite hold the code up against, and would it go red if
the source were wrong?

**Answered as a ladder, not a verdict,** because the verdict version
scored 0 real of 8. Every suite is reported at its strongest rung:
NETWORK · DOM · DB · DISK · EXECUTION · CROSS-KIND · LITERAL · NONE.
The counts are produced by the scan on every run — do not read them
from here.

**The distribution is the finding.** Of the build's gates, four reach
the network, seven the DOM and three the database; everything else is
DISK and EXECUTION. The four independent sources the owner named live
almost entirely in the 93 prodtests, dbtests and itests that do NOT run
in the build and mostly cannot run here at all — which is the same
28% held open in `docs/v5-closing-report.md`, arriving from a different
direction.

**Four build gates reach NONE and all four HELD under mutation** —
`address-register` (a corpus of 546 Greek strings), `design-density`
(a census with ratchets), `language-reachable` (a relation between six
files), `write-guards` (a shape over the writes it finds). Each carries
its real reference and the mutation that settled it in
`gate-independence.test.mjs`. A fifth gate arriving at NONE fails the
build.

**One real defect, from the sibling shape** (`docs/shapes.md`, *the
rule targets the shape, the check anchors on the example*):
`user-photos`' "every table that carries HTML is read" named four
tables. A fifth table with an `html_content` column left it green — and
a table the storage cleanup does not read makes every photograph
reachable only from it an orphan, deleted on a schedule. It derives the
list from the migrations now, via `tablesWithColumn()`.

**Three detectors were wrong before one was right.** The first LITERAL
detector counted `.length > 0`, which every gate's footer satisfies:
264 of 275 matched and NONE could never happen. `BASE_URL` without a
leading `\b` matches inside `DATABASE_URL`, filing every database suite
one rung too high. And the scan twice had the blind spot this repo has
now recorded four times — a path in a `const`, built with `path.join`,
or read through a wrapper. All three are pinned by fixtures in the gate.

**What is NOT closed:** the ladder reads text. A gate that enumerates a
directory and ignores the answer still counts as DISK. Only mutation
settles that, and only the bottom rung has been settled that way.

## 18. The final V5 check, re-run 2026-09-19

    node scripts/verify-closing-report.mjs     # every N/N in the report, re-derived
    npm run test:mutation                      # all 176 suites, ~90 minutes

**The counted claims.** `verify-closing-report.mjs` parses every
`` `<gate>.test.mjs` — N/N `` out of `docs/v5-closing-report.md`, runs
that gate and prints AGREES, MOVED or RED. **24 of 24 agree**, nothing
moved, nothing red, nothing gone. It refuses to report on fewer than
ten claims, because a parser that finds nothing prints
"0 agree · 0 moved · 0 red" and exits clean — which reads exactly like
a verified document. Settled three ways by mutation: an aged number
(MOVED), a named gate made to fail (RED, exit 1), and an emptied parser
(the floor, exit 1).

**The uncounted claims have moved, all in one direction — the tree
grew.** 276 build gates (was 271, then 273), 45 prodtests, 29 dbtests,
19 itests; 369 in the tree; 74.8% run here, which is §ΣΤ's 75% to one
decimal. The re-verification is its own dated section at the top of the
report rather than an edit to the 2026-09-18 record.

**The mutation sweep: 2,399 of 2,400 caught, one hole, now zero.** The
hole was a mutation that had stopped testing anything —
`user-photos.mutation.mjs` anchored on an early return that gained a
`dropped: null` field. The suite reported STALE and exited 1, exactly
as designed; nothing in the build runs the suites, so nobody saw it for
a day.

**Closed in the same round:** `mutation-suite-shape.test.mjs` §5 looks
up every `from:` in every declared mutant in the file it names — 2,418
anchors in 0.15 seconds, in the build. Proved both ways: the real
defect put back (RED) and the mutant reader emptied (RED on the floor).

**What is still not verified** is what it was: a `DATABASE_URL`, an
Anthropic balance and a published site. See
`docs/v5-closing-report.md`, "the 28% that is still open".

## 19. ⌘K found nothing, and the pricing claim on signup — 2026-09-19

Both reported from production, both reproduced, both fixed.

### ⌘K

    node scripts/tests/palette-aliases.test.mjs
    npm run db:search-rows -- --sql        # the one query for the index

**«οικο» always worked.** Run against the real catalogue, the matcher
returns Οικονομικά first — the translated-label fix of 2026-09-07 is
real and is in `main`. **«θέλω να δω τα έσοδά μου» never could**, and
neither could «έσοδα»: every tier of the matcher compared the WHOLE
query with a candidate, and nothing is called that. The module is
«Οικονομικά» and its fields are Ποσό, Περιγραφή, Τύπος.

Worse than one word: a third of the sidebar is a phrase rather than a
noun — «Δες τι λένε τα νούμερα», «AI που δουλεύει για σένα», «Ψάξ' το
καλά» — so the label is the word a person is least likely to type.

**Fixed two ways.** `lib/palette-aliases.ts` holds the words people
actually use, **English and Greek only**, hand-written and dated, with
coverage printed per locale on every run so the absence of the other
eight is visible rather than assumed. And the matcher falls back to the
query's own words, longest first, bounded at eight — so a sentence
naming three things reaches three pages and a sentence naming none
reaches none.

**What the 520/520 number could not see.** The existing gate forms its
query from the first word of the label it is testing, so an
everything-matcher printed 520 of 520 unchanged. It has a negative
control in the same loop now. The new gate's queries come from the
alias table instead — not from the labels — which is the whole point.

**Not answered here:** whether `search_index` has rows. That needs
`DATABASE_URL`. It is also not the explanation for either reported
query: both are page navigation and never reach that table.

### The pricing claim

    node scripts/tests/plan-claims.test.mjs

Not `/pricing` — that page was rendered against production at 390×844
in Greek and English and every card showed only its own features. It
was **`/signup`**, where seven English string literals were listed
under every plan with a ✕ at `text-muted/50` — 2.25:1, measured —
above a second list of the plan's real features. See `docs/shapes.md`,
*the data was right and the screen said otherwise*.

One list now, derived from the catalogue, labelled from
`pricing.rows.<id>` in ten languages, with a cross at 5.34:1 / 7.73:1.
Built on the SERVER: `client-env-reach.test.mjs` caught the first
version importing the catalogue into the browser, where the seven limit
modules it reaches read `process.env` and get `undefined`.

## 20. Derived data checked as code, never as content — 2026-09-19

    node scripts/scan-derived-data.mjs
    node scripts/tests/derived-data-health.test.mjs
    node scripts/db/emit-search-backfill.mjs          # the backfill, generated

**The incident.** ⌘K found no content for an account with 88 records.
Every check about `search_index` passed and the table was empty. The
counts are produced by the scan; do not read them from here.

**The backfill.** `supabase/migrations/20260919000000_search_index_backfill.sql`
re-runs it on its own, reports a line per table and a total, and ends by
selecting what the index holds. Generated from the spec array of
`20260824000000_unified_search.sql` — a second hand-written list is
exactly what that migration's own comment warns about — and
`search-backfill.test.mjs` holds the two in step both ways.

**Verified in a real PostgreSQL 16**, not reasoned about: reproduced the
reported state (88 source rows, 0 indexed, no triggers), ran the
backfill (88 indexed, per-table notices), ran it again (0 added), wrote
a new source row (self-indexed through the re-attached trigger) and
searched `search_fold('εσοδα')||':*'` (50 hits).

**The probe.** `/api/health` reports `derived.verdict` now — `EMPTY`
means the index holds nothing while the product has accounts. Same shape
and same reason as `nav.verdict`.

**The general case, measured.** 4.2% of the build's checks prove that
somebody wrote a call, inside a gate that reaches no network, browser or
database and does not run the code. Printed, not gated.

**What is NOT closed:** the scan reads SQL text. A table filled by
application code in a shape it does not model is not listed, and only
`search_index` has a live row count — the other eight are counted by
suites, most of which need a `DATABASE_URL`.

## 21. A Vercel failure naming a gate that does not exist — 2026-09-19

    node scripts/build-identity.mjs
    node scripts/tests/plan-claims.test.mjs

**The report:** `plan-feature-matrix.test.mjs`, "no feature is marked
available on a plan that lacks it", `free: unexpected 3`.

**The gate is in no commit.** 32 remote branches searched by tree, every
ref by name, the full history for the check's own sentence — zero.
`main` was byte-identical to the branch it merged, and `npm run build`
exited 0 on it. The gate written in that commit is `plan-claims.test.mjs`.

**The claim does not reproduce.** Four readings of "free is marked
available on 3 features it lacks", computed against the real data, all
give zero. See `docs/shapes.md`, *a red build naming a file that does
not exist*, for the table.

**What changed anyway, because the question was good:**

- `npm run build` states its own identity on the first line — commit,
  branch, gate count — reading the SHA from the platform first, because
  Vercel's detached HEAD makes `git rev-parse --abbrev-ref HEAD` answer
  "HEAD". A pasted failure now carries its provenance.
- `plan-claims.test.mjs` holds two more directions, both settled by
  mutation: a plan shown a **cross for something it has**, which the
  `minPlan` check structurally cannot see, and a **zero wearing a
  number** ("0", "0 MB") — a cross with extra steps.

**What is NOT closed:** where the pasted output came from. It is not
this repository at that commit, and I cannot say what it is. If it
recurs, the first line of the build now names the tree.

## 22. What differs from the builder, apart from the environment — 2026-09-19

    npm run test:order                      # 280 gates, three runs each, ~20 min
    node scripts/tests/order-stability.test.mjs   # the cheap half, in the build

**The question:** three CI failures in a few rounds, two of them naming
gates that exist in no commit here. The third — `check-site-spelling`,
2026-09-11, in CLAUDE.md — was real. So: what differs between this
machine and Vercel beyond env vars?

**Measured, not listed.** Node 22.22.2 against `engines: 22.x`,
full-icu, UTC, and five paths that exist here and not in a clone
(`.next/`, `node_modules/`, `next-env.d.ts`, `prod-audit/`,
`tsconfig.tsbuildinfo`). None of those explained anything. **File order
did.**

`scripts/scan-order-dependence.mjs` runs every gate three times — twice
normally, to learn which lines are naturally volatile, and once with
every `readdirSync` reversed. **15 of 280 disagreed with themselves; one
flipped green → RED.** All 15 are fixed; the sweep is now clean.

The green → RED one is `rpc-signatures.test.mjs`: `sigs[name] = params`
over an unsorted listing of `supabase/migrations`, where several
migrations redefine a function with `create or replace`. Which
definition survived was the filesystem's choice. See `docs/shapes.md`,
*the gate read an order nobody promised*.

**Both instruments needed correcting before they were right**, and both
by mutation:

- the scan reported `prodtest-hygiene` because it prints a pid — a
  control run now separates volatile from order-dependent;
- the gate's key-assignment detector was `\w+\[[^\]]+\]\s*=`, which
  cannot reach past the nested bracket in `sigs[m[1]] =` — the one
  instance in the tree. Putting the defect back left it green.

**What is NOT closed:** 234 of 237 `readdirSync` call sites are still
unsorted. Almost all enumerate to filter and count, where order changes
nothing, and the empirical sweep now finds no disagreement among them —
but "no disagreement today" is weaker than "sorted". The gate holds the
correctness subset (last-writer-wins) at zero; the rest is measured by
`npm run test:order` rather than forbidden.

## 23. The fallback that reported nothing — 2026-09-20

    node scripts/scan-silent-fallbacks.mjs

⌘K turned a 500 into `[]`, rendered `[]` as **"No matches for
«έσοδα»"**, and cached it — so retyping never retried. «Το ⌘K δεν βρίσκει
τίποτα» and «το ⌘K είναι χαλασμένο» were the same screen, reported three
times, and each round fixed something real in the matcher that was not
the reason.

**The rule: a fallback MUST report that it was used.** Otherwise it does
not protect the user from the bug, it protects the bug from being found.

**733 catch blocks across 917 files**, classified: 577 report, rethrow or
return a value that carries the failure; 59 recover silently; 56 are
empty; 41 neither. Measured 2026-09-20, after this round's four orphan
deletions; the gate prints the live figures on every build. The first version of the classifier said 172 were
silent, because `catch { return NextResponse.json({ ok: false }) }` has
no `console.error` in it — the discriminator is whether the value
CARRIES the failure, not whether the block logs.

**Looking for the second caller found something bigger.**
`LibrarySearch` had the identical shape — and had been an **orphan since
2026-09-02**, when the merge that chose main's sidebar naming deleted its
page and left the component behind. Nothing had rendered it for eighteen
days. It was deleted rather than fixed.

`orphan-i18n-keys` could not see it: `dashboard.library.*` had a reader,
namely the orphan. **A dead component keeps its translations alive in ten
languages, and a gate that starts from the thing being read calls that
health.** `entry-points.test.mjs` now requires every component under
`src/components` to have an importer. **Four did not** — `library-search`,
`loading-state` (described in the present tense by three comments as the
one "the whole app boots with"), `quick-action-card`, `quick-start-button`
— all deleted, with the three comments corrected in the same commit.

The fallback gate kept the rule that generalises: every component reaching
`/api/search` must read `res.ok` AND raise a flag on the dropped request.
**The first version of that sweep found zero**, looking for a quoted string
where the code uses a template literal; the floor under it caught that, and
there is now a named-member clause too, because a sweep pointed at the wrong
directory passes a count.

**What is NOT closed:** the 59 remaining silent recoveries are printed
and not gated. Most are right — a probe whose contract is "null when it
cannot ask" reports through its return value. The scan cannot see whether
the CALLER looks, and settling one means making the inner call fail and
watching whether anything says so. `scripts/tests/silent-fallbacks.test.mjs`
holds the classifier's ability to sort them, not the number itself.

## 24. Quick Start is dead end to end — a decision, not a bug

Found on 2026-09-20 by the new orphan-component clause in
`entry-points.test.mjs`, and **exempted there rather than deleted**,
because this is a product question:

| piece | state |
|---|---|
| `src/components/overview/quick-start-modal.tsx` | rendered by nothing |
| `/api/templates/apply` | called only by that modal |
| `src/lib/workspace-templates.ts` | read only by those two |
| `dashboard.overview.quickStart*` | translated into ten languages |

It became unreachable when `quick-action-card.tsx` and
`quick-start-button.tsx` — its only importers — turned out to be orphans
themselves.

**Two ways to close it, and the cost is the asymmetry:** deleting takes
about twenty minutes and loses a feature somebody once wrote and ten
translators once translated; wiring it back to the Overview page is
roughly an hour and needs a decision about where the button goes, which
is the decision that got lost in the first place. `user-data-registry.ts`
already documents the route as a source of user rows, so a deletion has
to go through there too.

**Until it is decided, it is named in the exemption and the exemption is
checked both ways** — the file must still exist, and it must still have
no importer. Wiring it up makes the exemption fail rather than leaving a
paragraph about something that stopped being true.
