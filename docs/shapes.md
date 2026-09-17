# The shapes

A catalogue of the ways a statement in this repository has been wrong while
looking right. Every entry is tied to a **real incident here** — a defect
that shipped, or an instrument that reported health it had not measured —
and names what catches it now.

## They have names, not numbers, and that is the point of this file

The working list numbered them 1–23 and **the numbering drifted**. Two
comments in the code numbered themselves independently:
`scripts/tests/language-extremes.test.mjs` called the technically-true
comment "the NINTH shape" where the working list had it at sixteen, and
`scripts/tests/gate-state-vs-behaviour.test.mjs` called state-vs-behaviour
"the seventeenth", which did match — but nothing anywhere made either
checkable. A third, in `scripts/tests/gate-vacuity.test.mjs`, numbers four
shapes *within its own file* and never meant the global list at all.

A number that two files disagree about is worse than no number: a reader
who follows one to the wrong entry stops trusting the other. So the
entries below are **deliberately unnumbered**, they are referred to by
name, and the reference has one spelling:

    SHAPE: stale anchor

`scripts/tests/shape-names.test.mjs` fails the build on a `SHAPE:` that
names nothing here, and on any comment that writes "the Nth shape" outside
the short list of local enumerations it carries with reasons.

Shapes 1–7 of the old working list are **not** reproduced. No incident in
this repository can be sourced to them, and writing them out from memory
is the exact unchecked claim this file exists to stop.

---

## Stale anchor

A mutation's `from` string stops existing, so the suite silently tests
nothing and reports the same green it reported when it worked.

*Incidents:* six. The most recent two were caused by V4.6's own changes,
and two more in `scripts/tests/icu-quoted-placeholders.mutation.mjs`
pointed at a quoting form the catalogue had moved away from.

*Caught by:* every suite reports `STALE` and exits non-zero;
`scripts/check-mutation-tree.mjs` enumerates all 1,540 anchors;
`scripts/tests/gate-stale-anchors.test.mjs` checks the shape of the check.

## Vacuous assertion

`check("no X", found.length === 0)` over a scan that found no files at
all. The check passes hardest when it is most broken.

*Incidents:* twice in V4.6, in gates written that same day. Then twice
more in `scripts/tests/user-isolation.dbtest.mjs`, both found by its own
mutation suite: the population of tables was filtered by
`relrowsecurity`, so a table with row-level security switched off
**vanished from the population** and everything went green; and the set of
deliberately sealed tables was read live from `pg_policies`, so dropping a
policy moved its table into the category where "this account sees nothing"
is the expected answer, and the leak became the pass.

*Caught by:* `scripts/tests/gate-vacuity.test.mjs` — every emptiness
assertion over a scanned collection needs a floor.

## A suite that never ran, counted as a pass

Not a check that cannot go red — a check that was never asked. The
runner reads the exit code, the suite exits 0 because skipping cleanly is
not an error, and the tally adds it to the green column.

*Incident:* `scripts/tests/run-mutations.mjs` printed
`OK   user-isolation                                0s`, then
`89 suites · 89 green · 0 red`, then `ALL MUTATION SUITES GREEN`.
`scripts/tests/user-isolation.mutation.mjs` mutates the database schema —
it found no `DATABASE_URL`, said so in one line and exited 0, so nine
mutants that stage real cross-account leaks were never applied. All nine
could have been live and the summary line would have read the same. The
tell was the timing column: `0s`, for a suite that cannot finish in zero
seconds — measured with a database attached, the same suite takes **430
seconds**.

Sixteen files in `scripts/tests` can print such a line.

*Caught by:* `scripts/tests/lib/mutation-outcome.mjs` answers
green/skipped/red rather than ok/not-ok, and
`scripts/tests/mutation-runner-honesty.test.mjs` holds both the
classifier and the wiring — including that the summary no longer derives
green by subtracting red from the total, which is the arithmetic that
made a skip green no matter how it was classified.

*Not the same thing as:* `scripts/db/run-dbtests.mjs`, which also skips
on an unreachable Postgres and also exits 0. Its own header says why it
does not do this: it prints one loud `SKIPPED:` line and no tally, and
failing a build over infrastructure it does not control would be worse.
The lie is the count, not the skip.

## A check that cannot go red

`check("applies twice cleanly", true, true)`. The truth being asserted is
that the line was reached.

*Caught by:* `scripts/tests/gate-vacuity.test.mjs`, tautology section.

## Runtime string in an import path

A module specifier assembled at runtime, which no compiler resolves and no
editor follows.

*Caught by:* `scripts/tests/gate-import-paths.test.mjs` — 75 `@/`
specifiers and 2,101 repository paths across 386 gates.

## `-1` in a position comparison

`indexOf` answers "not here" with a number that is also a valid index, so
`>= 0` and `> -1` and a bare truthiness test each mean something different
and only one of them is right.

*Incidents:* five live instances found in V4.6, including a paywall that
would have opened for every free account the day somebody added a plan
slug.

*Caught by:* `scripts/tests/not-found-index.test.mjs` and its eight
mutations; `src/lib/ui/roving-index.ts` makes the not-found case a branch
rather than arithmetic.

## Many mutations in one dimension

A suite with thirty mutants that all vary the same thing. It reports 30/30
while a whole axis goes untested.

*Caught by:* `scripts/tests/mutation-suite-shape.test.mjs`, 527 checks.

## A test that supplies its own arguments

The fixture and the assertion agree because the same hand wrote both, and
neither one touches the product.

*Caught by:* `scripts/tests/mutation-suite-shape.test.mjs`.

## An optimisation that removes without proving what remains

Trimming a message catalogue by 93% and asserting only that it got
smaller. Nothing says the 7% still covers what the screens ask for.

*Caught by:* `scripts/tests/message-slices.test.mjs` — every namespace a
group can reach must be declared.

## A fixture that is not production

The check is correct, the assertion can go red, and the thing it runs
against is not the thing that matters. **It fails in both directions and
the register has one of each**, which is why the name is about the
fixture rather than about safety.

*Incident:* `db_exposure_report()` has counted `grant_without_policy`
since 20260917 and reported **zero**. It runs, in
`scripts/tests/grants-and-policies.dbtest.mjs`, against an ephemeral Postgres
built by `scripts/db/bootstrap-supabase.sql` — and that stub set no
default privileges at all, while Supabase grants ALL on every table in
`public` to `anon`, `authenticated` and `service_role`. The stub was a
database far more locked down than production, so the check passed for a
reason production does not have.

The proof it was the stub that was wrong, not the theory: the migrations
in this repository issue **89 targeted `revoke … from authenticated`
statements**, which are no-ops unless the grants exist. They are written
against a database where every new table arrives fully granted.
`20260906000000_revoke_anon_grants.sql` had already fixed the `anon` half
after a sweep of the live database found seventy-eight tables; nobody did
the `authenticated` half, and the instrument that should have said so was
looking at the wrong database.

Correcting the stub turned the check red at **89 (table, verb) pairs** —
`user_credits`, `credit_transactions`, `ai_cost_log`, `affiliate_payouts`
and `production_errors` among them.

*And the same shape the other way round.* `storage.objects` is created by
the stub without row level security, and `authenticated` was never
granted USAGE on the storage schema. The ten policies the migrations put
on that table were therefore inert on two counts at once — and a policy
on a table without RLS does nothing at all. Measured before the fix, with
two accounts and one file each: **account A read account B's private
file**.

**In the fixture.** The first version of this paragraph reported that as
a hole and did not say where it was; asked on 2026-09-05, production
answered `relrowsecurity = true` for `storage.objects`, so the ten
policies were load-bearing there the whole time. What this divergence
actually cost was not safety, it was **coverage**: on the only database
any gate can reach, those ten policies could not be evaluated, so one of
them saying `using (true)` would have gone unnoticed —
`db_exposure_report`'s `tables_without_rls` filters `nspname = 'public'`
and the storage schema is outside every check this project owns.

That is the part of this shape worth remembering. A fixture that is
*looser* than production does not hand you a false all-clear about
production; it hands you an untested rule, which reads the same in a
green log.

*Caught by:* `scripts/tests/stub-vs-production.test.mjs` — a register of
what the stub must model, each entry carrying the incident that put it
there, plus the divergences that remain with the direction each fails in;
every entry is checked BOTH ways, so one that has stopped describing the
stub is a failure rather than a note, plus the three answers production
gave when it was asked by hand -- each stamped with the day it was true,
because nothing re-asks them. 18 checks, 10 of 10 mutations.
`scripts/tests/user-isolation.dbtest.mjs` now probes `storage.objects` in
all three buckets, so the ten policies are exercised rather than counted.

A fixture cannot be proven equal to production from inside the
repository. It can only be made to fail loudly, and to carry a written
list of the places it is still known to differ.

## A probe that changes what it measures

The instrument is correct, and running it destroys the thing it was
pointed at.

*Incident:* `scripts/tests/user-isolation.dbtest.mjs` wrote its blanket
UPDATE and DELETE probes with `returning user_id`, to attribute which
account's rows a write had reached. Postgres applies the SELECT policy to
any row an UPDATE or DELETE has to **read**, and naming a column in
RETURNING is reading it — so the RETURNING put back exactly the blindness
the probe existed to get past. Measured on a throwaway table carrying an
unscoped delete policy: `returning 1` deleted both accounts' rows,
`returning user_id` deleted one and left the other account's alone. Two
real leaks were reported as clean, and
`scripts/tests/user-isolation.mutation.mjs` is what said so. The
attribution is now done after the role is dropped, by a superuser, whom no
policy filters.

## A technically-true comment that reads as complete

`src/lib/agents/injection-patterns.ts` said its patterns "cover the
obvious cases in more than one language". True — two of ten. A Spanish
override went through untouched.

*Caught by:* `scripts/tests/language-extremes.test.mjs` — a coverage claim
must name how many.

## A gate measuring final STATE instead of BEHAVIOUR

`scripts/tests/chat-scroll.prodtest.mjs` asserted where the scrollbar
ended up, not that the scroll had happened. A page that never scrolls and
a page already at the bottom look identical to it.

*Caught by:* `scripts/tests/gate-state-vs-behaviour.test.mjs`.

## A wiring check that never sees a VALUE

The owner-only check asked whether a page *mentions* `isAdminEmail` and
*mentions* `notFound`. `void isAdminEmail;` keeps both words, opens the
cost dashboard to every customer, and the check stays green. It was killed
by its own mutation suite the day it was written.

*Caught by:* `scripts/tests/i18n-coverage.test.mjs` reads the guard's
shape; 5/5 mutations.

## A gate that pins a bug the product fixed

`scripts/tests/offline-state.test.mjs` **required** that `/offline` still
said "You're offline" in English and still carried the excuse for why the
page could not be translated. Both were false. Fixing the page meant
turning a gate red.

*Caught by:* replaced with checks on what has to be true for a Greek
reader with no network; `scripts/tests/offline-locale.mutation.mjs`, 6/6.

## A statement that was once true and nobody re-asked

*Incidents:* the README said two cron jobs were unscheduled; both had been
in `vercel.json` for weeks. `scripts/tests/i18n-coverage.test.mjs`'s
header said "86 of these still ship" when 160 did. And
`scripts/tests/mutation-suite-shape.test.mjs` held its "names the catching
check" ratchet at 10 while 44 suites held — the floor was recorded once,
thirty-four more suites were rewritten, and nobody re-asked. A ratchet
four times below its own measurement lets four suites in five regress in
silence.

*Caught by:* `scripts/tests/self-claims.test.mjs` — every path a comment
names must resolve, held at zero. Numeric claims are **not** gated; they
are derived where they are printed instead of written down twice.

## The defence existed, was correct, and was wired at one place

`src/lib/trading/conduct.ts` described three layers of protection in the
present tense. Only the third was running: nothing in the trading feature
calls a model, so there is no output to scan. A safe state, not a checked
one — and the difference matters the day somebody adds the model call.

*Caught by:* `scripts/tests/trading-journal.test.mjs` — a model call in
that feature without a conduct scan fails the build.

## Code correct by coincidence

`ArrowDown` on a freshly-opened menu was right because `-1 + 1 = 0`.
`ArrowUp` on the same line was wrong.

*Caught by:* `src/lib/ui/roving-index.ts` makes the not-found case a
branch; tested at 0 · 1 · -1 · length · NaN · Infinity · undefined.

## An instruction requested rather than enforced

The website prompt *asks* the model for an English image query. A Greek
`λογότυπο` placeholder is then not recognised as a logo, and whatever the
photo library returns is published as the business's own mark. An
instruction to a model is a request; the enforcement has to happen after
generation, in code.

*Caught by:* `scripts/tests/ascii-boundaries.test.mjs` — a non-Latin query
is stripped, not searched. See `src/lib/website-image-placeholders.ts`.

## A detector blind to the CANCELLATION, not to the thing

Every shape above is a probe that cannot see something *exists*. This one
is a probe that cannot see something was **withdrawn**, and it is worse,
because of which way the error runs.

`scripts/db/pending-migrations.mjs` builds two lists: the objects a
migration creates, and — in `dropsOf()` — the objects a later migration
DROPS, which is what voids an earlier expectation. Its `drop policy`
pattern required double quotes around the policy name. Quotes are
optional in Postgres, and this repository writes both ways: on the DROP
side **204 statements write the name bare against 147 that quote it**, so
the *majority* form was the invisible one.

A create-side blind spot under-reports: it stops asking about objects,
and stays quiet. A cancellation-side blind spot over-reports, and it does
so **for ever**: the tool keeps expecting a policy that a migration
deliberately removed, on every run, and calls the migration PARTIAL. It
is not a missed alarm. It is a false one that never stops.

That is the direction that costs the most, because false positives teach
the reader to ignore the instrument — and this instrument is the one
CLAUDE.md names as the thing to run before a deploy. The four columns
that were genuinely missing on 2026-09-04 arrived inside exactly that
kind of noise from `/api/health`, and were found by hand.

The rule this shape gives: when a probe has a list of things it expects
and a list of things that VOID an expectation, the second list needs the
harder review. Being wrong there is louder, more persistent, and teaches
people to stop looking.

*Caught by:* `scripts/tests/sql-spellings.test.mjs` — `dropPolicy` is its
own family, checked by name against the corpus, and
`scripts/tests/sql-spellings.mutation.mjs` puts the quote requirement back
on the drop side specifically. See `scripts/db/pending-migrations.mjs`.

## The product demands of others what it does not do itself

`src/lib/website-builder.ts` carries a WRITING DIRECTION section that this
product sends to every model it asks for a website: put `dir="rtl"` on
`<html>`, lay out with logical properties, never hide with a negative
offset, mirror the icons that point and only those, do not scroll sideways
in either direction. It was written after a real Arabic site came back
carrying ~10,000px of horizontal scroll, and it is a good list.

The application obeyed none of it. Measured on 2026-09-07 with a real
browser: `dir=null` on every route in Arabic, at 390 and at 1440, and an
off-screen element census IDENTICAL to English — which is what "never
mirrored" looks like from the outside.

This is not hypocrisy, it is a blind spot with a specific mechanism: the
prompt is *content* and the layout is *code*, they live in different files,
and nothing walks from one to the other. The rule was written by somebody
thinking hard about right-to-left, for output. Nobody re-read it as a
specification of the thing they were writing it in.

**A rule the product imposes on its own output is a rule about the
product.** Anywhere this repository tells a model how to behave, the same
sentence is worth reading as a requirement on the application — and the
gate should read the rule out of the prompt rather than restating it, so
there is one catalogue and not two.

*Caught by:* `scripts/tests/rtl.test.mjs` parses
`WRITING_DIRECTION_SECTION` out of `website-builder.ts` and checks the app
against it — including deriving the four right-to-left languages from the
prompt's own prose and requiring `src/lib/text-direction.ts` to name
exactly those. `scripts/tests/rtl-layout.prodtest.mjs` measures the
behaviour in Chromium at 390 and 1440.

## A vocabulary harvested from an interface has no verbs

`src/lib/ai/module-vocabulary.ts` builds each module's terms from its slug,
its title in all ten catalogues, and its field labels in all ten. That is a
generous source and it is all nouns: every title and every label on every
screen of this product is a noun, because that is how interfaces are named.

Nobody asks a question in nouns. "Expenses" is not a question. Measured
across all thirteen modules and all ten languages — 130 verb-led questions,
one per pair — **12 reached the module they were plainly about**, and five
languages (es, de, it, pt, ar) scored **0 of 13**. The owner found it with
one query, "πόσο ξόδεψα", which scored zero on Finance in Greek, written in
Greek letters, on the module whose whole subject is money.

The shape is that a free, plentiful, obviously-relevant source can be
systematically missing one grammatical category, and the gap is invisible
to anyone reviewing the list — every term in it is correct.

*Caught by:* `scripts/tests/module-verbs.test.mjs`, the full 13x10
cross-product through the real scoring path, with the two remaining zeros
allowed by name and a staleness check on that allowance.

## A classifier that spends in order to decide whether to spend

`lib/clarification.ts` decides whether a request is too vague to act on,
and it is a Sonnet call. Every request pays for it, including the ones
whose answer is obvious from the text: "invoice Acme 4200 for March" names
a company and a number, and "do it" is a verb and a pronoun. Neither
needed a model.

The shape is not that the call is expensive — it is small. It is that a
gate placed in front of a cost IS a cost, so "decide before spending"
cannot be satisfied by a component that spends, however well it is tuned.
The fix is not a better prompt; it is a free answer for the confident
cases and a **third verdict** for the rest, so the paid check is spent on
the requests where cues genuinely cannot decide instead of on the ones
where they can.

A binary detector cannot do this. It has to pick a threshold, and every
threshold on evidence this weak is wrong for somebody: strict enough to
catch «κάν' το» is strict enough to interrogate a good one-line brief.
Three answers — clear, vague, unsure — let the cheap thing be confident
where it can be and defer where it cannot, which is the only honest use of
a weak signal.

*Caught by:* `scripts/tests/ambiguity.test.mjs` measures both errors
separately and holds them to different standards — no clear request may
ever be called vague (zero), while missing a vague one only costs the call
the product already makes (a ratchet). `ambiguity.mutation.mjs` includes
both degenerate classifiers, because "always unsure" and "always vague"
each pass a check that looks at only one of the two.

## A comment that describes a bug accurately, as if it were a design note

The worst one in this document, because the comment PROTECTS the bug.

`src/lib/sidebar-label-keys.ts` said, for months:

> The underlying strings stay English (state keys, search matching) — only
> the rendered label goes through messages/*.json.

Every word of that is true. It is also a complete description of a defect:
the command palette matched an English string it never showed anybody, so
a Greek user saw «Οικονομικά», typed «οικο», and reached nothing. 168 of
490 (item x locale) pairs were reachable by the name on the screen; Arabic
was 0 of 49.

**Why it survived.** A reviewer who sees no comment asks what happens in
Greek. A reviewer who sees THIS comment reads a considered decision,
concludes somebody already thought about it, and moves on. The comment
does not hide the behaviour — it states it exactly — but it changes the
reader's posture from *questioning* to *accepting*. An undocumented bug is
found by the next person who looks. A documented one is not looked at.

**The test.** Read the sentence as a QUESTION instead of a statement.
"The strings stay English for search matching" becomes "should the strings
stay English for search matching?" — and the answer is obviously no. Any
comment whose declarative form is comfortable and whose interrogative form
is alarming is describing something that needs fixing rather than
explaining.

The phrases that most often carry this: *stays English*, *for now*, *for
the moment*, *by design* with no design given, *intentionally* with no
intent given, *known limitation*, *acceptable for now*, *good enough*.
None of them is wrong to write. Each of them is a place to re-ask the
question, and the ones that name no reason are the ones nobody can
re-check.

*Caught by:* `scripts/tests/comment-claims.test.mjs` counts the
declarative-limitation comments in the tree and holds the count at a
ratchet, so a new one has to be looked at and either justified or fixed.
It cannot decide whether any given sentence is a bug — no scan can — so it
does the one thing a scan can do honestly: keep the list small enough that
a person can read it.

## Only the failures leave a trace

**The feature was built to make most requests cost nothing, and that is
exactly what made it unmeasurable.** V5 #6 put a free ambiguity reader in
front of a paid clarifying-question call: a request it reads as `clear`
never touches the API. Correct, cheap, and shipped.

It also meant that the only requests which left a row in `ai_cost_log`
were the ones the free reader had FAILED to decide. The cheap path spent
nothing, and spending nothing is what the log records. So the question
"how often does the free reader get it right?" had exactly one
computable answer — 100% — and it was an artifact of where the rows came
from, not a fact about the reader.

**Nobody wrote a wrong number. The number simply could not be asked
for.** The verdict was computed inside the function, used to decide
whether to spend, and dropped on the floor; three surfaces recorded what
the check COST and none recorded what it DECIDED.

**The fix has two halves and the second is the one that is easy to miss.**
Carrying the verdict out is obvious once seen. Writing a ZERO-COST ROW
for the free path is not: it looks like logging work that never happened,
and the existing guard said as much in a comment. But a decision is work,
and a ratio whose denominator is only its own failures is not a ratio.

**The test.** For anything whose success is "we did not have to act",
ask where the successes are written down. A defence that logs its
activations and not its quiet days will always report a hundred per cent
hit rate, and so will a broken one.

*Caught by:* `scripts/tests/clarification-verdict.test.mjs` requires every
decision return to carry its verdict and every surface to record it
through one builder; `clarification-verdict.mutation.mjs` drops the
verdict on the free path and requires the gate to notice.
`scripts/db/clarification-rate.mjs` is the per-day query, proven against
a real Postgres.

## A file so long that nobody is the reviewer

**Not one non-English string in this product had been read by somebody
who speaks the language.** That is a true sentence about 26,397
translations — 2,933 keys in nine languages — and it stayed true through
every round that noticed it, because the answer was always "find a native
speaker", and what a native speaker is actually offered is 2,933
sentences. Nobody reads that. So nobody read any of it, and the count
that made the problem look enormous is the same count that stopped it
being worked on.

**The fix was not more reviewers. It was a shorter list.** The strings a
person meets between the signup form and the first thing the product says
about their own data are 598 of the 2,933; the ones on those screens that
are PROSE rather than labels are 44. Forty-four sentences is an hour, and
an hour is a thing a real person will actually give you.

**What it found, immediately.** Two sentences three lines apart on the
signup screen addressed the reader differently in Greek — one εσύ, one
εσείς. Both correct; together, a product that cannot decide whether it
knows you. Measured across the whole file: 473 informal, 15 polite
plural, 2 mixing both inside one sentence. Seventeen defects, all real on
a hand read, none findable by any check that existed, and all of them
sitting in a file too long for anybody to have read.

**The test.** When a queue is too long to work, the useful question is
not "how do we get through it" but "which tenth of it carries the
damage". A backlog nobody starts has the same value as an empty one, and
a number that makes work look impossible is doing harm even when it is
accurate.

*Caught by:* `scripts/tests/first-run-strings.test.mjs` regenerates
`docs/first-run/` and compares it byte for byte, so the pack a reviewer
is sent can never be last week's wording;
`scripts/tests/address-register.test.mjs` holds Greek at zero
polite-plural strings, which is the one thing about a translation a
machine genuinely can check.

## A fair draw where a promise was wanted

**The complaint was "two sites of the same kind feel like one template",
and five rounds of answers were about the SIZE of the space.** The
section order — the axis that decides the skeleton — was hashed per site
into a list of three. Everything about that was fair, deterministic and
well tested, and it produced these numbers, measured over 20,000
constructed pairs and 4,000 constructed people:

| | |
|---|---|
| two strangers, same kind, first site each | **33.3%** the same skeleton |
| one person's own sites 2 to 5 | **59.9%** repeated a skeleton they had |
| one person, five sites, all identical | **1.0%** |

**None of that is a bug in the hash.** A three-sided die lands on the
same face a third of the time; that is what dice do. The mistake was
reaching for a die at all where the product could make a promise.

**Two different questions, and only one of them needs randomness.** Two
strangers' draws cannot see each other, so 1-in-N is a floor for them and
the only lever is N. But *one person's own* sites are all known to the
same account, and "your next site does not have your last site's
skeleton" is something a cycle can guarantee and a draw never can. The
order is now drawn once per person and stepped: their first N sites use
every order exactly once, and the first repeat is site N+1.

**The test.** For any "should be different" property, ask who is
comparing. If the two things being compared are both visible to the same
piece of code, a fair draw is the weaker answer — it gets you a
probability where an ordering would have got you a guarantee. Randomness
is for the case where coordination is impossible, not the case where it
was not attempted.

*Caught by:* `scripts/tests/section-order-space.test.mjs` measures both
numbers from the shipped function — no model call, no cost — and asserts
the repeat count is exactly zero rather than "low".
`section-order-space.mutation.mjs` turns the cycle back into a draw and
requires that clause to go red.

## The ceiling with eighteen characters left

**Found by breaking it.** Adding three more section orders to each of the
seven archetypes pushed the cached system prompt from 29,982 characters
to 32,188, against a gate that holds it under 30,000. The gate was right
and the addition was not — but the useful part is the first number:
**the prompt had 18 characters of headroom**, and nothing said so.

Every prompt-sized addition anyone proposed would have failed that gate.
There was no signal for it short of a red build: the check reports a
total and a ceiling, and 29,982 against 30,000 reads exactly like 12,000
against 30,000 to a person skimming a passing test.

**What fixed it was not a bigger ceiling.** Each shape wrote its section
names out once per order, three times over; numbering them once and
referring to them by number in a single ORDERS line made room for twice
as many orders and left the prompt 330 characters SMALLER than it started.
A limit that looks like it needs raising is often a duplication that
needs removing.

**The test.** A budget check that prints only "under the limit" is a
check whose most important state — nearly at it — is indistinguishable
from its safest one. Print the headroom, not the total.

## A cost decided by a fallback nobody wrote down

**Found 2026-09-07, and only because something else had to report it.**
`lib/websites-greek-spelling-check.ts` called the provider layer with
`purpose: "classification"` and no `model`. Every word of that reads
"cheap". `lib/ai/providers/complete.ts` reads an absent model as
`originTier = "mid"`, and `substituteModel` then returns the cheapest
anthropic model at mid tier *or above* — `claude-sonnet-4-6` at 3/15 per
MTok, not the `claude-haiku-4-5` at 1/5 the name suggests.

**Nothing was wrong with the code.** The routing rule is deliberate and
documented — *same tier or better, never worse* — and it does exactly what
its comment says. What was wrong is that a price was set by that rule and
no one had ever decided it. Every other `runCompletion` caller in the tree
named its model; this one was the only place where the number came from a
default, and the default is invisible at the call site.

**Why it survived.** The module's own comment says what it costs: "one
classification call with at most `SPELLING_WORD_CAP` words and a 300-token
ceiling: about 200 tokens on a normal site". True, checked, and measured
on the one axis that was small. The axis that was 3× is not mentioned,
because the person writing it did not know there was one.

**What it was worth.** About eight hundredths of a cent per website — and
that is the entry, not a mitigation. A defect worth almost nothing in
money is worth exactly as much as any other in *reviewability*: `charge >=
4 × real cost` is computed from the model actually served, and a model
nobody chose is a number nobody can check.

**The test.** For any call that costs money, ask what sets each input —
not what its value is. An input whose answer is "the default" has not been
decided; it has been deferred to a rule written for a different question.

*Caught by:* `scripts/tests/billing-coverage.test.mjs` §1c requires every
`runCompletion` call site to name its model, mutated in
`billing-coverage.mutation.mjs`. `scripts/check-site-spelling.mjs` reads
that name out of the source and refuses to run if it is gone, rather than
reporting a price for whatever the default lands on.

## `\b` is ASCII

JavaScript's word boundary is defined against `[A-Za-z0-9_]`, and the `u`
flag does not change it — it is the *boundary* that is ASCII, not the
pattern. `\bπροτείνω\b` matches nothing, silently, in one language. It has
broken four features here.

**THIS ENTRY SAID "THIS ONE HAS NO GATE" UNTIL 2026-09-08**, and closed
with "held by convention and one heuristic — which is a weaker sentence
than every other entry in this file, and it is the true one." It was true
then. What was missing was not effort but a rule narrow enough to enforce:
`scripts/tests/ascii-boundaries.test.mjs` catches a boundary beside a
non-ASCII *literal*, and cannot tell a correct `<img\b` from a wrong
`\bonly\b`, because both patterns are pure ASCII. The difference is not in
the pattern at all — it is in what the pattern is APPLIED TO.

So the rule was narrowed until it bites, in
`scripts/tests/untrusted-boundaries.test.mjs`: every regex applied to a
value whose name says it holds text a person or a model wrote (162 of 379
applications in `src/`) and whose pattern carries `\b` (27 of those) must
sit in a file that DECLARES the machine format it parses — and the
declaration is checked rather than taken. The pattern must carry no
non-ASCII letter and must contain a token of that format: `<`, `>`, `=`,
an escaped `/`, or `\d`. **A pattern matching a bare word cannot satisfy
that, so a boundary on prose cannot be declared at all.**

On the day it was written that admitted 27 — tag names, attribute names,
PDF object headers, OOXML elements — and refused exactly the two that were
wrong: `/^NO_RESULT\b/i` on model output, where `"NO_RESULTS"` did not
match and `"NO_RESULTΣ"` did; and `/\bjwt\b/i` on a provider's error text,
where `"jwtToken"` did not match and `"jwtΤΟΚΕΝ"` did. Both now use a
Unicode-aware lookahead.

## A check that names its subject in advance

`has_function_privilege('anon', …)`, `grantee = 'authenticated'`,
`anon_readable_relations` — three real checks in this repository, and all
three ask a yes/no question about a role somebody chose *before* running
them. A Supabase project has about fifteen roles. A grant to
`dashboard_user`, a membership handed to `authenticator`, `BYPASSRLS` set
on anything, are not *denied* by those checks. They are invisible to them:
the query never asks, so the answer never appears, and the report says all
clear.

Measured on 2026-09-07 by asking the other question — "list every grantee
you hold, on every facet" — against a database with all 66 migrations
applied: `authenticated` held TRUNCATE, TRIGGER and REFERENCES on 102
relations and UPDATE on 2 sequences; `anon` held TRUNCATE on
`help_articles`; and `truncate table public.chat_messages` **succeeded** as
`authenticated`, with row level security on and its `user_id = auth.uid()`
policies in place, because RLS does not scope TRUNCATE.

The fix is not one more role name in the predicate — the next role would
be missed the same way. It is a NAMED LIST of who may hold anything, with
a reason on every line, and everything outside it red:
`scripts/db/role-grants.mjs`, `scripts/tests/role-grants.test.mjs`,
`scripts/tests/role-grants.dbtest.mjs`.

## A gate that deletes what it measures

`clarification-rate.dbtest.mjs` needed an empty `ai_cost_log` to count
five fixture rows, and made one with `drop schema if exists public
cascade; create schema public;`. Against the throwaway server
`npm run test:db` provisions, that reads as housekeeping. Against the
staging database `scripts/db/run-dbtests.mjs`'s own header invites
somebody to point it at, it deletes the product.

It was already wrong on the throwaway one, and nothing said so. Suites run
alphabetically: the fourth left 2 tables where there had been 107, and the
FIFTH failed — `relation "public.cost_alert_log" does not exist`, a
message about a file with nothing wrong with it. The round that shipped it
had run `npm run test:db -- clarification-rate`, and a filtered run has no
fifth suite.

`db-migrations.test.mjs` section 2b refuses any `*.dbtest.mjs` or
`scripts/db/*.mjs` that drops a schema this project keeps, or drops or
truncates a table the migrations create. A scratch object a suite made
itself is fine — `pack-rate-race.dbtest.mjs` had that right from the day
it was written, and said why in its own comment.

## An exception that ate the rule

`pending-migrations.mjs` derives the objects each migration creates and
asks the database whether they exist. One migration creates a probe table
and drops it again in the same file, so the rule "an object this file also
drops is not expected afterwards" was written — correctly, for that one
case, with no notion of ORDER.

Every idempotent policy in `supabase/migrations` is written

    drop policy if exists "x" on t;
    create policy "x" on t ...;

because a migration here must be safe to paste twice. To a rule that only
asked *does this file also drop it*, all 204 of them looked exactly like
that probe. Measured 2026-09-08: **218 CREATE POLICY statements in the
directory, fourteen expected.** Whole features at once — the trading
journal, the notification tables, data analysis, bank and crypto, and
every scoped policy on `storage.objects`. In the file CLAUDE.md names as
the answer to "what else have I not run?".

A count in front of it would not have helped, and did not: the floor was
400 objects and green throughout, because 14 is a number too. What catches
it is asserting the two shapes side by side —
`scripts/tests/pending-migrations.test.mjs` runs the same two statements in
both orders and requires opposite answers.

## A probe the defence hides from

`user-isolation.dbtest.mjs` asked whether account A could reach B's file
with `update storage.objects … where name like 'B/%'`, and answered "0
rows" for a reason that has nothing to do with the UPDATE policy: when an
UPDATE or DELETE carries a WHERE that reads a column, PostgreSQL applies
the SELECT policies to the rows it fetches BEFORE consulting the write
policy. While reading is scoped, the WHERE matches nothing whatever the
write policy says.

So `using (true)` on `update_own_user_files_objects` and on
`delete_own_create_attachments` both left every line of that gate green.
Measured by its own mutation suite on 2026-09-08 — the gate could not see
two of the ten policies it was written to cover.

The probe that can is a write with **no name predicate**:
`delete from storage.objects where bucket_id = '…'` must remove exactly
one of the two rows in the bucket. The row-level half of the same file had
already learned this two rounds earlier — "only a write with no WHERE can
see this class at all" — and the storage half was written without it.

## The import satisfies the check about the call

A gate reads a file and asserts that a symbol is there:

    check("the webhook imports the decision", /creditSyncDecision/.test(webhook));

The import line contains that name. So does a file that imports the
function and never calls it — which is the exact state the gate was
written about, because a pure function nobody calls fixes nothing.

Four gates in this repository had it, all found in one afternoon on
2026-09-08, by mutation suites written for them rather than by reading:

- `subscription-sync` — the webhook could import `creditSyncDecision` and
  sync credits unconditionally; the money bug it guards, restored, left
  the line green.
- `subscription-cancel` — `/CancelSubscription/` matched the import, so
  cancelling could move back behind the Stripe portal untouched.
- `locale-resolution` — `indexOf("LOCALE_COOKIE")` found the import at the
  top of the file, so the cookie "came before" Accept-Language whatever
  the function did.
- `credit-grants` — `.includes("signup_grant:")` is satisfied by
  `oauth_signup_grant:`, a *different* namespace, which is the one defect
  that check exists for.

The fix is one character in three of the four: assert the CALL
(`= creditSyncDecision(`), the ELEMENT (`<CancelSubscription`), the READ
(`cookieStore.get(LOCALE_COOKIE)`) — and for the fourth, anchor the
substring so it cannot be a suffix of something else.

`scripts/tests/comment-claims.test.mjs` and `self-claims.test.mjs` check
that a NAME in a comment resolves. Nothing checks that a name in an
assertion is being used the way the assertion's sentence says, and a
regex cannot: only a mutation that deletes the call and leaves the import
tells you.

## A number internally consistent with everything except reality

The credit machinery is arithmetic all the way down and, until 2026-09-08,
was compared against nothing outside itself.

`CREDIT_MARGIN_*` multiplies a cost that `src/lib/billing/model-pricing.ts`
computed from its own rate table. The achieved margin stored beside it on
the `ai_cost_log` row is measured against that same computed cost. So if
the table is wrong, the charge is wrong, the stored margin is wrong, and
the margin alert — which compares the stored margin to the target — still
reads a healthy 4x, because both of its inputs moved together. That is not
hypothetical: it is exactly the 2026-08 incident, where the table held one
model and every call served by a pricier one was billed at a third of its
cost with no line of output changing.

The fix for that class is not a better internal check. It is one
comparison against a number the system did not produce — here, the invoice.

**And the comparison could not be made.** `ai_cost_log` records
`input_tokens`, `output_tokens`, `cache_write_tokens` and
`cache_read_tokens` **summed across every sub-call of an action**, and has
no model column. An action is routinely served by two or three models —
the clarifier and the classifier on the cheap tier, the generation on the
expensive one — so a row reading `input_tokens = 50000` is equally
consistent with $0.05 of Haiku and $0.50 of Fable. An Anthropic invoice is
broken down BY MODEL. The monthly totals could be compared; nothing below
them could.

The absence was invisible because every question the table had ever been
asked was answered before the summing: `real_cost_usd` was priced per
model and then added up. The column that was missing only mattered for a
question nobody had asked yet.

`CostAccumulator.byModel()` records the split, `settleReservation` writes
it into `metadata.modelBreakdown`, and
`scripts/db/anthropic-reconcile.mjs` turns a month of it into invoice
lines. Two properties of that tool are load-bearing, and both are the
opposite of the obvious choice:

- **Rows settled before the split existed get their own line, with their
  own money on it.** Dropping them, or spreading them across models by
  proportion, would make a report on 12% of a month look like a report on
  the month.
- **A model with no published rate prices to NULL, not to zero.** Zero
  would shrink the difference against the invoice, so the report would
  look better the less it knew — the shape `/api/health` and
  `i18n-coverage` are both in this document for.

## The number that was right when it was typed

A count in a comment is the easiest claim in a repository to be wrong
about, and the hardest to notice. It was true, something was added, and
nothing anywhere connects the sentence to the thing it counts. Three were
wrong on 2026-09-08:

- `api/create/top-modules` said "the 13 business modules + ideas".
  `CLASSIFIER_MODULES` is thirteen INCLUDING ideas, so the sentence
  counted it twice and described a universe of fourteen that has never
  existed.
- `dashboard/layout.tsx` said the layout's `<main>` makes the landmark
  true for "all 39 pages". There are 41.
- `i18n-coverage`'s client-fallback baseline stood at 31 against a
  measured 28, with the comment beside it saying "31 new keys across ten
  locales". Three fallbacks had been paid off and nobody lowered the
  number, so three new ones could ship green.

**The general scan does not work, and the number says why.** A regex over
prose finds 844 sentences in `src/` and `scripts/` that read like a count
claim, and almost all of them enumerate the paragraph rather than the
repository: "the two halves", "the three things", "the four questions".
Precision is well under a tenth, and a gate at that ratio gets its
baseline set to the size of the problem — which is the same as deleting
it.

**So the claim declares its own check.** A count that matters carries a
marker naming what to count and where, and
`scripts/tests/count-claims.test.mjs` requires both the count AND that
the number appears in the sentence the marker vouches for. A marker that
agreed with the repository while the prose beside it said something else
would be the same defect one level down.

The first marker written was invisible: it went into a JSX comment, whose
inner lines carry no `//` or `*`, and the reader only knew about prefixed
ones. A marker nothing read, in the gate whose subject is claims nothing
reads. Its own mutation suite found it.

## A bug described as a design note, which does not survive being a gate

This shape is real — a comment that states calmly, in the present tense,
that something does not work, and reads as a decision — and V5 #13 was
asked to make it enforceable. It could not be, and the measurement is
worth more than the attempt.

165 comment blocks in `src/` and `scripts/` match the strongest phrasing
("is broken", "is wrong", "does not work", "has no effect"). 71 name a
gate, a round or a plan. Twelve of the remaining 94 were read by hand,
and **none was a live defect**. Every one was prose about behaviour: "what
is broken now" as a page's subject, "a rule with no data did not pass, it
did not run", "nothing throws, nothing is logged, and nobody will ever
see it" explaining why a guard exists.

The count is printed by `count-claims.test.mjs` and not asserted, so the
next person can re-measure instead of re-arguing.

## The experiment that could not see the witness

V5 #14 was asked to work through ~2,400 defensive guards on the strength
of an earlier result: nine were tested by removing each and running the
whole unit suite, and seven came back with nothing red. Extrapolated, that
said roughly 1,800 guards had no witness.

**The instrument was wrong three times over, and all three errors point the
same way — inventing an absence of guards.**

1. **ENOBUFS read as "nothing went red".** `execFileSync` defaults to a
   one-megabyte stdout buffer; `npm run test:unit` prints 1,195,212 bytes.
   Every call threw, the output was truncated at 1,037,423 bytes, zero
   `FAIL` lines were parsed from the fragment, and an empty failure list is
   exactly what the caller reads as *nobody is watching this guard*. The
   output was already ~1.19 MB when the file was written, so no `NOBODY`
   verdict it ever printed was evidence of anything.
2. **Its own sidecar made unrelated gates red.** The runner holds a sidecar
   for the seconds the suite is running, and `check-mutation-tree.mjs`
   reports a populated sidecar as a killed run — through
   `mutation-tree.test.mjs`, which is inside that suite. Combined with the
   loop's early exit, the verdict was decided by *which unrelated gate
   failed first*: a guard whose deleted line carried English prose tripped
   `baselines.test.mjs` and read as unwatched; one whose line carried none
   reached the tree check and read as watched. `if (!isAdminEmail(…))` was
   reported WATCHED by an owner-only test that is green when it is deleted.
3. **`test:unit` stops at the first failing suite.** Remove
   `if (!user) return 401` and `baselines.test.mjs` reddens first — one
   server-side English string went missing — the loop stops, and the suite
   that would have caught the deletion never runs.

The proof is one guard. `if (ownedIds.length !== requested.length)` in
api/files/collections was the previous round's headline unwatched guard.
With the instrument fixed it comes back **WATCHED**, by a check that names
it: *"the count is compared … and the mismatch is a 404, not a shrug."*
The gate had been there the whole time.

**A witness that is a count is not a witness.** Once the buffer was fixed,
deleting an authentication guard turned the build red on
`SERVER_PROSE_BASELINE` — 655 English error strings became 654. True,
useful, and completely silent about authentication: it fires identically
for deleting a typo message. Counting it would have made every guard whose
rejection carries prose read as watched. It is filtered with the
mutation-marker gate, for the same reason.

## The population was not what the sample said it was

The nine guards first tested were picked because they looked odd — unicode
folding, whitespace trimming, a date parse. The population is nothing like
them. Of 2,252 guards that reject rather than compute, the ones touching
money, auth and user data are **302 / 189 / 66** — and the auth 189 are
only **32 distinct shapes**, of which one line accounts for 132:

    if (!user) return NextResponse.json(…, { status: 401 });

So the experiment is not "one guard at a time" but **one representative per
shape**. Nine experiments covered 195 guard instances, which is what made
it possible to answer the question at all rather than sample it.

## The gate that dies instead of failing

A gate is red when it prints

      FAIL  the thing that is wrong

and the mutation runner reads that line to decide which check caught which
defect. A gate that THROWS is also red, and says nothing:

    (exited non-zero with no FAIL line)

Both are exit code 1, so a build gate cannot tell them apart and neither
can a person reading CI. What is lost is the only part that was useful —
which of the gate's forty checks noticed, and what it noticed.

Six were found in this repository during V5 #9, all by mutation suites and
none by reading, between 2026-09-11 and 2026-09-12:

- `cron-auth` — `timingSafeEqual` raises on buffers of different lengths,
  so a wrong secret of the wrong length killed the run.
- `purchased-credits` and `margin-report` — the same shape, in a SQL
  statement and in a numeric coercion.
- `accent-search.itest` — `applyFile` throws, so a migration that will not
  apply took the itest down before its first result.
- `locale-formatting` — `Intl.DateTimeFormat` raises a RangeError on an
  invalid Date, which is also the production symptom: an uncaught
  RangeError in a Server Component is a 500, not an empty cell.
- `help-articles` — the matcher is called directly, and it sits inside a
  chat request, so a throw is a failed message rather than a fall-through
  to the model.

The fix is the same three lines every time — a wrapper that turns the
throw into a value the check can compare:

    const safe = (fn) => { try { return fn(); } catch (err) { return `THREW: ${err}`; } };

The reason it keeps happening is that a gate is written against working
code, where nothing throws. The defect it will one day face is the thing
that makes it throw, and that is the run where it explains itself worst.
`scripts/tests/mutation-runner-honesty.test.mjs` reports the runner's own
version of this; nothing yet holds the population of gates that can die,
because finding one costs a mutation that makes it die.

## A field that costs nothing to add and looks like work

A name is declared — a field on a config type, a flag on a plan, a
constant — and **nothing reads it**. Adding it costs one line, it shows up
in a diff as progress, and it is a promise with no mechanism behind it.
The declaration is the whole feature.

**The incident: `PlanCapabilities.websiteBuilder`, 2026-09-13.** It was
declared on all six plans, `false` on Free, and rendered as a ✕ on the
pricing page and a ✕ on the signup grid. It was read in exactly three
places in the product and **all three were drawing a tick or a cross**. A
Free account could open `/dashboard/website-builder` and generate a site.
The field had never gated anything, from the day it was written.

Two things kept it alive:

- **The refusal was one step later.** `maxPublishedSitesForPlan` is 0 on
  Free and `api/websites/[id]/publish` does refuse — so a Free account
  could generate and not publish, and anybody who checked casually met a
  real refusal and stopped looking. The expensive half, the model call,
  had already run.
- **A true sentence about the wrong thing.** The page's header said the
  Websites module "already has its own credit cost + plan gating", which
  is true of the hand-typed tracker at `/dashboard/websites` and was read
  for months as true of the builder.

**The variant that is quieter and just as real**: a capability enforced by
a PARALLEL rule. `/dashboard/memory` refused with
`planMeetsMinimum(planSlug, "starter")` — a correct refusal that never
mentions `capabilities.aiMemory`. The field and the lock agreed by
coincidence, so moving the feature to another tier would have moved the
pricing column and left the door open, in a green build. Both pages that
inherited that URL after the split carried the same shape.

**Why a gate for this is not obvious.** The natural check is "does a file
mention the field", and `websiteBuilder` passed that in three files. The
check that works asks for two things at once: the named file must READ
the capability **and** contain a refusal — a 4xx, an `UpgradeRequired`, a
`notFound()`, a `redirect()`. A file that mentions it and returns nothing
is a display, not a door.

`scripts/tests/plan-enforcement.test.mjs` holds it for
`PlanCapabilities`: every field is claimed by exactly one row of
`lib/billing/feature-catalog.ts`, every built field is read where
something is refused, and a field declared `notBuilt` must be read by
**nothing** — so the day somebody enforces a placeholder tier, the build
goes red until its row is published. `plan-enforcement.mutation.mjs`
re-introduces the original defect and twelve of its neighbours.

The same shape at the pricing surface is
`scripts/tests/pricing-truth.test.mjs`: a row on the comparison table must
name code that exists, and — since 2026-09-13 — must not be a row for a
capability the catalog itself declares unbuilt.


## The one live use that makes the whole table look alive

`CREDIT_COSTS` had fifteen entries. Eleven were read by nothing and were
deleted on 2026-09-13. The remaining four were written up as the survivors
— and three of them were dead too, one hop further out.

They feed `recordAiCallForDailySpend(estimatedCreditCost)`, which writes
`daily_ai_spend_tracking.estimated_cost`. Nothing reads that column.
Application code reads `total_calls` and nothing else; the owner's own
diagnostics (`docs/sql/4-spend.sql`, `docs/sql/5-undercount.sql`) read
`total_calls` and say in their own header that real spend comes from
`ai_cost_log`; every other mention in the repo is a test asserting the RPC
accumulates, or the drift report listing the column as one that should
exist.

**The one use was also the most wrong.** Twenty-one of the twenty-four
callers of that function pass `estimate.estimatedCredits` — a real
per-request number. The three fed from `CREDIT_COSTS` pass a flat 1, 1 and
2. So the single thing keeping those entries alive was also the single
place feeding the number a fiction; if that column ever gains a reader, it
will report chat, text actions and the weekly reflection as nearly free.

**Why the first pass missed it.** The scan that found the eleven asked
"does anything read this symbol", and for these three the answer was yes —
a real function, called from a real route, on every request. The question
that finds it is one hop further: *and does anything read what that
does?* A reader that is itself unread is not a reader. `estimated_cost` is
written by twenty-four call sites, which is exactly what a live field
looks like from one step away.

**This is why the correction is in the same file as the mistake.** The
commit that deleted eleven unread fields also wrote, about these three,
*"they size a telemetry tick, not a bill, and moving one moves a graph."*
There is no graph. A sentence asserting a consumer that does not exist,
written in the act of removing eleven fields for having no consumer — the
check stopped one call short, and the prose filled the gap with something
plausible.

**What a gate for it would have to do.** `scan-declared-never-read.mjs`
settles a symbol by renaming it and running `tsc`, which proves nothing
about a value that crosses into SQL. Reaching `estimated_cost` needs the
question asked of a database column: written by N call sites, read by how
many? That is a different instrument, and until it exists the habit is the
defence — when a field's only justification is "it feeds X", open X.

## A check that passes because the sentence it forbids is in another language

A gate asserted that a plan row reads `Unlimited`. It is a correct check
in a product that ships in one language, and this one ships in ten.

`node scripts/scan-english-anchored-gates.mjs` asks how many others there
are. The test for "user-visible" is provable rather than guessed: the
literal must appear as a VALUE in `messages/en.json`, which by definition
is a string this product renders and by definition has nine other
spellings. A table name, an HTTP verb, a CSS class and a route are English
too, and none of them changes when the locale does.

**26 hits in 11 files. Twenty-two of them go red; four go green.** That
split is the shape:

    body.includes("Run history")          → FAILS on a working product
    !body.includes("Upgrade Required")    → PASSES, having looked at nothing

The negative form is the dangerous one, and for a reason that has nothing
to do with translation: **the needle is absent for the wrong reason.** The
check means "no upgrade wall is on this page" and what it actually tests
is "this page does not contain an English string it was never going to
contain". A green line, in a green log, measuring nothing — the same
failure as an empty scraper in `db-migrations`, arriving through the
locale instead of through a filter.

**The fix is not to translate the literal.** `scripts/tests/lib/ui-text.mjs`
reads `<html lang>` off the page and resolves the expected text out of
THAT locale's own messages file — the same file the renderer read. An
English run still asserts the English string; a Greek run asserts the
Greek one; neither has a sentence typed into the test. It also closes a
second hole for free: a copy change in `en.json` used to break these
checks silently, because the literal in the test stopped matching anything
and the negative ones went green.

**And the vacuity can come back one level down.** An empty needle makes
`includes()` always true and its negation always false, so a key that
resolves to nothing would restore exactly the defect being removed.
`uiTextStrict` throws on a needle under three characters rather than
returning one.

**Its precision was measured, not claimed.** The first version of the scan
took every string in the file and scored 2 real out of 7 hand-checked;
every false positive was a literal in a comment, in a `console.log`
heading, or in the third argument of `check(...)` — the message printed
when the assertion fails. All three are English about English. After
`stripComments` and a restriction to predicate position, 10 of 11 files
were verified real by reading the assertion. This repository had already
paid for that lesson once: `plan-enforcement.test.mjs` failed a file it
had just fixed because the explanatory paragraph contained the symbol it
scanned for.

**It reports; it does not gate.** A prodtest signing in to an English
account and asserting English is narrow, not wrong, and which to widen is
a judgement about where the product is going.

## A line-level tool asserting a structural property

`security-posture.test.mjs` stripped block comments with a regex to count
live SQL statements. A **glob** — `src/components/entity-links/*` — inside
a `--` line was read as an opener, the non-greedy match closed at the first
genuine `*/` **541,136 characters later** in a migration written a month
afterwards, and the count read **28 instead of 86**. Fifty-eight tables
vanished from a security census.

Nothing was unterminated. The text said "here is an opener"; the structure
said "this is inside a line comment, so it is prose". The tool could only
read the first.

**Four more in this repository, all the same shape:**

| the tool | the text it read | the structure it meant |
|---|---|---|
| `mutant-list.mjs` finds each suite's mutant array by `indexOf` of a marker | a comment ABOVE the declaration that merely *named* the marker | the declaration, not a description of it |
| `mutation-coverage` sorts gates into money / what-a-person-meets / everything-else with `^`-anchored name regexes | the first word of a filename | whether the gate guards something a person meets |
| `combined-ceiling` paired backticks in order | the *n*th backtick | whether this backtick opens or closes |
| `scan-english-anchored-gates`, first version | every string in the file | strings in *predicate position*, not in comments or failure messages |

`mutation-coverage`'s is the quietest and the worst: `plural-forms`,
`empty-states`, `landmarks` and `one-primary-action` are every one of them
a thing a person meets, and every one lands in "everything else" — so the
category prints **0** and reads as finished, because its membership test
is a prefix where the category is a property.

**Why it survives.** Text and structure agree almost always. The tool is
right until the first file where they differ — and that file is usually
the one in another alphabet, or the one whose author wrote a comment about
the thing being searched for. It is the `\b`-is-ASCII shape with the
alphabet replaced by syntax.

**It cannot be scanned for, and the attempt is the best evidence of that.**
Three versions were written on 2026-09-16:

1. four signals (balance-counting, regex comment-stripping, marker lookup,
   `^`-anchored classification) → **400 hits across 260 of 350 gates**
2. narrowed to markers that also appear in a comment somewhere → **274**
3. minus CLI flags and self-matches → **192**, still mostly `"insert
   into"` in SQL prose and `"aria-hidden"` as an attribute

**Precision approximately zero, all three times.** And the reason is the
shape itself: deciding whether a hit is real needs two structural facts —
which files that tool actually reads, and whether it strips comments
first — and all three versions tried to establish them by matching text.
The scanner reproduced the defect it was hunting, which is why it was
deleted rather than committed.

**What does help, and is already the convention here:** 126 of 258 gates
strip comments before matching, and every one of the five instances above
now carries its limitation in its own header. `comment-claims.test.mjs`
ratchets the census of such notes at 67 precisely so the list stays short
enough for a person to read — which is the only instrument that has ever
found this shape.

**The question to ask instead of running a scan:** *this check reads text
— what would have to be true about the structure for the text to lie?* For
a comment: could this token appear in prose? For a name: is the category a
property or a prefix? For a pair: can one half be quoted?

## The check covers the participants, not the ones who stayed out

`billing-coverage.test.mjs` inventories every `messages.create` and
`messages.stream` in the tree and fails the build on one that does not
declare how it bills. It is a real gate: it brute-forces margin across
plan × pack × cost, it has caught flat charges that could not clear 4× on
Ultimate, and it runs on every build.

It asks: **do you settle correctly?**

A route that does not settle at all is never asked. It is not in the set
the check iterates, so no assertion in the file has an opinion about it —
and the file passes, every time, at full strength, while the thing it was
written to prevent happens beside it.

**How it showed up.** Five routes, found on 2026-09-16 by asking the
inverted question — not *does this settle correctly* but *does this spend
at all, and if so what bounds it*:

| route | what it spends | what bounded it |
|---|---|---|
| `mission/[id]/pdf` | a server-side PDF render | nothing |
| `research/[id]/pdf` | a server-side PDF render | nothing |
| `presentations/[id]/pdf` | render + every slide photo downloaded | nothing |
| `presentations/[id]/pptx` | `pptxgenjs` build + every slide photo | nothing |
| `notifications/channels` POST | a message to a caller-supplied address | nothing |

The last one is the sharpest. `/api/delivery-channels` does the same
thing — sends a test message to an address the caller gives — and has
been rate limited on scope `delivery_channel_test` since it was written.
One directory away, the same action had no limit at all, and nothing in
258 gates compared them, because the comparison nobody runs is between a
member and a non-member.

None of the five was reported by any instrument. They were found by
listing the population first and subtracting the members.

**Why "it does not charge" reads as an answer when it is half of one.**
Each of the four export routes carried a correct comment: *"No model call,
no charge: the deck was paid for when it was written."* That is true, and
it is the right answer to *should this reserve credits?* It was silently
also standing in as the answer to *what stops a thousand of these?* — a
question nobody had asked, because the only instrument that looks at
spending asks the first one.

**The fix is not a better version of the same check.** It is the
complement: enumerate the population FIRST — here, every route that spends
anything, by any mechanism — and require each member to be either inside
the system or explicitly outside it with a written reason.
`route-spend-inventory.test.mjs` does that, and its first assertion is the
one the old gate could not contain: *every route that spends either
reserves credits or is declared below*.

**It is the line-versus-structure shape one level up.** There, the unit of
checking (the line) was not the unit of meaning (the structure). Here, the
unit of checking (a call that settles) is not the unit of meaning (a call
that costs). Both survive for the same reason: the check is sound about
everything it looks at, and the thing that is wrong is never looked at, so
there is no failing output anywhere to notice.

**The question to ask of any check that iterates a set:** *what would an
item look like if it never joined this set — and would anything at all go
red?* If the answer is "it would look exactly like a route that does not
exist", the set is the finding, not the assertions over it.

**Two more sightings the same day, in instruments written by different
hands.**

`delete_user_file_objects()` deletes storage objects under the deleted
account's folder in `user-files`. The product has three buckets.
`gdpr-coverage.test.mjs` asserted the RPC is CALLED and called BEFORE
`deleteUser`; `security-posture.test.mjs` asserted the same two things.
Both stayed true while `create-attachments` and the PUBLIC
`website-references` survived every account deletion — so a deleted
account's photographs stayed reachable by URL. The route's comment names
Article 17 and covers a third of what it describes. The fix is one array
in the migration and a gate that scrapes every `BUCKET` constant out of
`src/lib` and checks membership.

`security-posture.test.mjs` scans every endpoint under `src/app` for a
session or a written reason, and its own comment records widening once,
from `src/app/api` to all of `src/app`, *"which is precisely the kind of
route that most needs to be on a justified list"*. It widened by
DIRECTORY. Next.js makes a public response out of five filenames, and the
scan's population is `f.endsWith("route.ts")` — so `src/app/sitemap.ts`,
which reads `published_sites` through the admin client with no session,
was never in it. The file is correct. Nothing had ever asked.

**Three instruments, three populations, one shape.** The common cause is
that a population is cheap to write as whatever was in front of you — the
calls that settle, the bucket the feature used, the files named
`route.ts` — and no assertion over it can see its own edge. So the
population gets its own floor, and the floor is the check: *this set
should have at least N members, and here are the specific ones it must
contain.*

### Asked deliberately, of four other things, on 2026-09-17

Not "does it do X wrongly" but "is it in the conversation at all". Six
more, in gates written by different hands, on four dimensions:

| what was asked | the population it had | the population there was |
|---|---|---|
| is RLS on? | one boolean over the corpus, plus `rlsStatements >= 40` | 110 tables |
| is a cron guarded? | 3 named routes, under the heading *"every cron route"* | 10 the scheduler fires |
| does this AI route's client report the receipt? | 6 declared pairs, under the heading *"every AI route"* | 10 routes build one |
| does this stream consumer use the shared reader? | 3 named components | 4 read a stream |
| is this page behind an auth boundary? | nothing anywhere | 63 pages |
| what bounds this route? | the routes that already call `checkRateLimit` | 39 that insert rows |

The two headings are the sharpest part. A section titled **"every cron
route actually uses the shared guard"** iterated three of ten — and the
seven outside it each move money or delete rows across every account.
A section titled **"every AI route returns a receipt, and its client
reports it"** iterated six of ten, and all four it missed were doing the
precise thing that sentence forbids.

**A ceiling of Infinity is not a ceiling.** `/api/team/invite` was
cleared by a bound-detector because `seat_count` appears in it. That seat
check is real on Professional; on Ultimate and Enterprise the plan
ceiling is `POSITIVE_INFINITY` and the branch is skipped outright — so on
exactly the accounts with no cap, nothing bounded a route that emails an
address the caller supplies. A presence check for a bound is not a check
that the bound binds, for every member.

**Four of the six were correct all along, and that is the point.** 109 of
110 tables have RLS; all ten crons are guarded; all 63 pages are behind a
boundary; 13 English screens are each English for a good reason. Nothing
recorded that any of it was a decision, so the day one of them stopped
being true, nothing would have said so.

**The precision is not the same in both directions.** Asking "which
routes have no rate limit" of 143 returned 67, and most were right to
lack one — this tree has eight kinds of bound. The question only became
answerable when it was narrowed to a population where the absence
matters: routes that INSERT. That is the difference between a scan worth
committing and one worth deleting.

### And the population of the instrument written to catch this, on 2026-09-17

`i18n-population.test.mjs` was written five days earlier, about exactly
this shape, and its own email population was **a folder name**:

```js
})("src/lib/email");
```

Fourteen modules in this tree call `resend.emails.send`. Twelve are under
that path. The two that are not:

- `src/lib/notify/dispatch.ts` — the email face of every notification, and
  by volume the most-sent message the product has.
- `src/lib/billing/cost-alert-delivery.ts` — an operator alert with an
  English subject, outside every i18n instrument in the project.

Both are correct. Neither was in the conversation, and the reason was not
a judgement anybody made: it was that the walk started at the directory
where the first twelve happened to live. Widening it to `src/lib` and
filtering by *what the module does* rather than *where it sits* is a
two-line change and it found both in one run.

**The same file had a second one, one level in.** It asked whether each
SENDER resolved a language, which is one of three things a translated
email needs: the template has to take a locale, the sender has to resolve
one, and the call site has to hand over the account. A template that
accepts a `locale` nobody passes renders English for everybody **and reads
in review as converted**. So the templates are their own population now,
with the same rule: take a language, or be named with a reason.

**And the last English sentence in a translated email was below the
fold.** `layout()` carried "You're receiving this because you have a
Ionexa AI account." as a literal. Four emails were converted to ten
languages, reviewed, merged — and all four still closed in English,
because the footer sits under the panel and every eye reading that diff
was above it. It is a required argument with no default now, for the
reason it survived four conversions: a default that renders correctly is
the kind nobody notices is still there.

## A check that answers the adjacent question

Not absent, and not wrong. Present, passing, and about something else.

`security-posture.test.mjs` asks of every endpoint in this app: does it
know WHO is calling? Every one passes — 147 routes, each authenticating
or carrying a written reason it does not need to. It is a thorough gate
and its answer is true.

The question it does not ask is the one that decides whether a row is
yours. A route that resolves the caller and then reads
`.eq("id", params.id)` and nothing else has a complete, correct,
load-bearing auth check, and serves somebody else's record. Nothing about
it is missing. Nothing about it is a mistake. It is scoped to the row
that was asked for rather than to the person asking, and no gate written
for "is there a check" can tell the two apart, because there is one.

**Why this is not the participants shape.** There, the item was outside
the set the check iterates, so nothing had an opinion about it. Here the
item is inside the set and passes — the coverage is complete and the
question is adjacent. The first is a hole in a population; this is a hole
between two questions that sound like one.

**What the measurement found, 2026-09-17.** 120 authenticated routes; 66
act on an identifier the request supplied; 16 of those reach past RLS
with the admin client. Zero defects — and that is only worth knowing
alongside how the other 50 are safe, which is *not* in their own source
at all. They read through the caller's own client and let a database
policy do the scoping. `using (true)` on one table is an ownership hole
in fifty routes at once, with every one of them still calling
`auth.getUser()` and still reading correctly.

So the two halves were joined rather than each asserted alone:
`rls-coverage.test.mjs` proves 204 of 205 policies scope to `auth.uid()`
— in both spellings, because 12 of them are created inside a DO loop as
`execute format('create policy … using (auth.uid() = user_id)')`, a
policy in a *string* that a literal scan cannot see — and
`resource-ownership.test.mjs` cites those assertions by their text, so
removing either one turns the other red.

**And one clause that reads like another.** A policy's `using` clause
scopes what is READ. Only `with check` stops `insert … user_id =
<somebody else>`. 43 insert policies had never been checked for it. All
43 were correct; nothing had asked.

**The question to ask of a check that passes:** *what is it scoped to,
and is that the same thing I care about?* Scoped to the row, scoped to
the caller; scoped to the read, scoped to the write; knows who is asking,
knows whose it is. Each pair reads like one question and is two.
