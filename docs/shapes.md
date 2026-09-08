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

**This one has no gate, and saying so is the entry.** JavaScript's word
boundary is defined against `[A-Za-z0-9_]`, and the `u` flag does not
change it — it is the *boundary* that is ASCII, not the pattern.
`\bπροτείνω\b` matches nothing, silently, in one language. It has broken
four features here.

128 occurrences are scanned and classified; 83 legitimately match a tag or
attribute name and would be *wrong* without the boundary, 26 are genuinely
ASCII domains, and the 19 touching human text were read one by one. Two
live instances were fixed. `scripts/tests/ascii-boundaries.test.mjs`
catches a boundary next to a non-ASCII literal, but it cannot tell a
correct `<img\b` from a Greek word without reading intent. Held by
convention and one heuristic — which is a weaker sentence than every other
entry in this file, and it is the true one.

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
