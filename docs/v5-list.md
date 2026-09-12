# V5 — the list

Ordered. Each item carries an estimate, what "done" means, and how it would
be proven. Read `v4-closing-report.md` first: several of these exist
because V4 measured its own blind spots rather than assuming it had none.

**The ordering rule.** Money, then the things a user meets, then the
instruments. Not because instruments matter less — V4's whole lesson is
that they matter more than they look — but because an instrument built
before the feature it guards is a gate with nothing behind it.

---

## Tier 1 — cannot ship V5 without these

**Three things are blocked, and all three are blocked on the owner rather
than on work.** Stated together here so the list does not have to be read
to find out why it has not moved:

| Blocker | What it stops | Why it is not a coding task |
|---|---|---|
| **Two real accounts** (email + password) | the isolation prodtest, item 1 | a JWT GoTrue actually issued is the point; a fixture cannot make one |
| **An API balance on the key's own account** | the spelling note end to end (2), `website-pairs-check` (3) | $0.53 was spent, then "credit balance is too low" — three rounds running. The key is valid; its account has no credit, so the credit is landing on a different account or organization |
| **The URL of an existing published site** | the free half of item 2 | `/s/<subdomain>`; there is no public index — the sitemap lists static pages only, and `/s` bare is a 404 |

Nothing else in this tier is waiting on anything.


### 1. The isolation test: two real accounts — BOTH HALVES WRITTEN; neither has met a real account
**~15 minutes of running.** Blocked on: two real accounts existing.

**This entry said "~half a day left" and described the prodtest as
something still to be written, until 2026-09-11. It was written on
2026-09-07** — `scripts/tests/user-isolation-live.prodtest.mjs`, commit
0445cef at 15:50, six hours before this file's own last commit that day.
Nothing here named it. The estimate was wrong by most of a day in the
owner's favour, which is the more expensive direction: work that looks
unstarted does not get scheduled.

**The database half.** `scripts/tests/user-isolation.dbtest.mjs`
impersonates `authenticated` the way production does and probes all 96
user-owned tables with two accounts — read, update, delete, and the
unpredicated write a predicate cannot see, plus the three storage buckets
as files rather than as rows about files. It is what found the 89 grants
no policy covered.

**The production half, and what it needs.**
`user-isolation-live.prodtest.mjs` (426 lines, 25 checks) asks the same
questions through a real session: the GoTrue password grant, the PostgREST
OpenAPI root, `/rest/v1/*` and `/storage/v1/object/*`, with a RUN_TAG
cleanup. Run without its six environment variables it prints what is
missing and checks nothing — which is the state it has been in every time
anybody has run it.

*What is left, and it is not code:* two throwaway accounts, six env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`ISOLATION_EMAIL_A`/`PASSWORD_A`, `ISOLATION_EMAIL_B`/`PASSWORD_B` — none
of which are in `.env.local.example` yet), and one run.

*Proven by:* the dbtest going red when a policy is loosened —
`user-isolation.mutation.mjs` stages 15 named schema mutations — plus, for
the production half, the same suite returning zero of B's rows through the
API. **That second half has never run against anything but a stub**
(`isolation-probe-honesty.itest.mjs` stands up a fake GoTrue/PostgREST and
spawns the prodtest at it: 17 checks, and it proves the instrument, not the
database).

### 2. The spelling check — A RUNNER EXISTS; the model call has still never happened
**~1 hour left.** Blocked on: an API balance, and the URL of an existing site.

**No longer "never run".** On 2026-09-06 a site was generated from a Greek
brief and the checker's word extraction was run against the real page: 60
words, capped at `SPELLING_WORD_CAP`. The model half — the one call that
judges those words — never happened, because the API balance ran out
first. So the note has still never been *produced*.

**But the extraction alone found the thing that mattered.** The brief said
"Ζαχαροπλαστείο στο **Χαλάνδρι**"; the page it produced said "στην καρδιά
του **Χαλανδρίου**"; and Χαλανδρίου went into the list of words the model
is asked to judge as misspellings. That is this file's own FIRST promise —
"IT NEVER ASKS ABOUT THE OWNER'S OWN WORDS. A village, a surname, a
business name written in the brief is the owner's spelling of their own
thing" — and it held for exactly the one form the owner happened to type.
Greek inflects.

Six of six constructed cases leaked (Χαλανδρίου, Παπαδόπουλος,
Θεσσαλονίκης, Ναυπλίου, Ιωαννίνων, Παπαδόπουλου). After the fix, zero —
with six controls proving no real misspelling is silenced to protect a
name, ρεμπα among them. 10 of 10 mutations.

**2026-09-07: there is now a runner, and writing it found a second
defect.** `scripts/check-site-spelling.mjs` takes a URL (or a local file)
and a brief, and reports what would be asked, what was held back and by
which of the five rules, what the model answered, and the cost in dollars.
`--dry-run` does the whole selection without calling anybody, which
answers three of the owner's four questions for $0.00.

It reads the system prompt and the model id **out of the shipped source**
rather than carrying copies, and refuses to run if it cannot — and that
refusal is what found the defect. There was no model to read:
`findGreekMisspellings` passed `purpose: "classification"` and no `model`,
so `providers/complete.ts` read it as tier `mid` and `substituteModel`
returned **claude-sonnet-4-6 at 3/15 per MTok**, not the claude-haiku-4-5
at 1/5 that "one cheap classification call" reads like. It was the only
`runCompletion` caller in the tree without a model. About eight
hundredths of a cent per website, and the point is that nobody chose it:
the margin guarantee is computed from the model actually served.

Named now (`const MODEL`), behaviour unchanged — whether haiku is as good
at Greek orthography is a measurement nobody has made, and a spelling note
that flags correct Greek is worse than no note. The runner makes that
measurement cost about two tenths of a cent:
`--model claude-haiku-4-5`, then again with sonnet, on the same word list.

*Held by:* `scripts/tests/check-site-spelling.test.mjs` (48 checks, 8 of 8
mutations) for the runner, and `billing-coverage.test.mjs` §1c (2 of 2
mutations) for every other call site.

*What is left:* one classification call, to see the note produced end to
end. It needs a balance, and — for the free path the owner asked for
first — the URL of a site that already exists. Both arrived empty again
on 2026-09-07, the fifth round running.

### 3. The three measurements — TWO OF THREE RAN, and the third turned out not to need a model

**2026-09-07: the structural half of the pairs question was answered for
$0.00.** `scripts/website-pairs-check.mjs` costs about $7.50 to generate
twenty sites and score them, and about $2.30 for three pairs. What it
estimates from three samples, the shipped draw computes exactly: the
section order is chosen by `lib/website-variation.ts` before a single
token is generated, so the probability that two people's sites of one
kind share a skeleton is a property of that function.

| | before | after |
|---|---|---|
| two strangers, same kind, first site each | 33.3% | **16.7%** |
| one person's sites 2..N repeat one they had | 59.9% | **0** |
| one person, five sites, all the same order | 1.0% | **0** |
| expected structural similarity, two strangers | 0.660 | **0.590** |

Measured over 20,000 pairs and 4,000 people in
`scripts/tests/section-order-space.test.mjs`, which costs nothing and
runs in the build.

**All three steps are in.** Exclusion is a per-person CYCLE rather than a
draw (`orderIndexFor`) — a fair draw could never have made the second row
zero. Three orders became six, which is the ceiling: four of the seven
archetypes have exactly three movable sections and 3! = 6. And the
produced page is now COMPARED against the person's previous one after
generation, with a `sameSkeleton` note in ten languages, because the
order is an instruction and rule 23 says an instruction a model can
ignore will be ignored.

**Two things were found on the way.** The prompt had eighteen characters
of headroom under its 30,000 ceiling, so six orders in prose did not fit
— numbering each shape's sections once made room and left the prompt 330
characters smaller than it started. And three shapes listed an order that
contradicted their own FIRST line; the contradiction is resolved in the
prompt now, in the direction that keeps the opening varying.

*What is left, and it still needs the key:* whether the MODEL obeys the
letter it is given, and what the pages look like. That is what
`website-pairs-check.mjs --pairs 3` measures, and it has never run.

### The original three measurements — TWO OF THREE RAN
**~2 hours left.** Blocked on: an API balance. Spent so far: **$0.53**,
then the account ran dry mid-round.

**`agent-tier-compare.mjs` — RAN, twice, and found a live defect.** The
first task was badly chosen by me: with `--no-search` and no account data
all three tiers correctly refused, which measured nothing. The second was
self-contained and produced the comparison:

| tier | model | words | $ | credits | seconds |
|---|---|---:|---:|---:|---:|
| simple | Haiku 4.5 | 276 | 0.0069 | 2 | 13.4 |
| standard | Sonnet 4.6 | 328 | 0.0244 | 5 | 27.3 |
| deep | Opus 4.5 | 357 | 0.0258 | 5 | 30.9 |

Haiku closed its **Greek** answer with *"I'm not an accountant — for your
specific business situation, consult a professional."* Sonnet and Opus
wrote it in Greek. `agent-runner.ts` says "write the entire result in
Greek" and then appends a conduct block ending in a literal English
sentence to close with. Fixed in both directions; before 1/5 English and
1/5 with no disclaimer at all, after 0/5 and 5/5.

**The negative-instruction site — RAN.** 45,818 chars, 255s, $0.4070. The
model obeyed both prohibitions on its own and
`enforceNegativeInstructions` removed nothing — so it was separately
handed the markup it exists to remove (booking ×2, newsletter ×1 stripped,
the products section untouched). The belt worked; the braces are proven
live but were not exercised by the real run.

**`website-pairs-check.mjs` — NEVER RAN.** It is the expensive one: ten
pairs is twenty site generations. The owner asked to start at `--pairs 3`
and stop for a cost report; the balance never arrived.

*A caveat that outlived the run:* the tier comparison above was made with
`--no-search`, which switches off most of what separates the tiers. At
their declared capacities the estimator prices them 4/14/46 without search
and 6/22/64 with. The picker now shows both figures, so a reader can see
that the search budget is the difference — see `depth-picker.tsx`.


---

## Tier 2 — a user meets these

*Done: 4, 6b, 7, 7b, and two of item 6's three parts.*
*Left in this tier: **5** (translations nobody has read), the **measurement**
half of **6** (needs API balance), and **8** (learning from use).*

### 4. `dir="rtl"` for Arabic — DONE (2026-09-07)

Was ~2 days; took one round. Shipped on
`claude/v4-6-sidebar-chat-issues-b2eixz`.

**What it was.** `src/i18n/constants.ts` said, correctly and honestly, that
Arabic shipped text-only with no RTL layout. Measured before the change
with `scripts/tests/rtl-layout.prodtest.mjs` — a real Chromium, a real
production build, six routes at 390 and 1440:

| | before | after |
|---|---|---|
| `dir` on `<html>` in Arabic | `null`, every route, both widths | `rtl`, every route, both widths |
| horizontal scroll, both directions | 0px | 0px |
| off-screen elements, `/dashboard` @ 1440 | 3 — the same 3 as English, because the layout WAS English | 3, matching English |
| off-screen elements, `/dashboard` @ 390 | 113 — identical to English | 113, matching English |

The identical censuses are the finding: nothing was mirrored, so Arabic and
English measured the same. A defect invisible to every instrument that was
not asked the question in the right language.

**The critical constraint, and it was the owner's.**
`lib/website-builder.ts` already carried a WRITING DIRECTION section
imposing all of this on every model the product calls. The app asked of
others what it did not do itself — now catalogued in `docs/shapes.md`. So
there is one catalogue, not two: `scripts/tests/rtl.test.mjs` PARSES that
section out of the prompt and checks the app against it, deriving even the
four right-to-left languages from the prompt's own prose.

**What shipped.**
- `src/lib/text-direction.ts` — `RTL_LANGUAGES`, `directionOf`,
  `dirAttribute`. Returns `undefined` rather than `"ltr"`, because the
  prompt says "if it is not, do not set dir at all".
- `src/app/layout.tsx` — `<html lang={locale} dir={dirAttribute(locale)}>`.
- Physical reading-order utilities in `src/**/*.tsx` went from **191 to
  10** (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `border-s`/`border-e`,
  `text-start`/`text-end`). Every conversion is a no-op in the nine
  left-to-right locales, which is what made a sweep of that size safe.
  The 10 survivors are the 8 centring pairs and `ambient-dots`' two
  decorative orbs, both carved out by the prompt's own rule and both
  excluded by name in the gate.
- The mobile drawer, which was the honeypot's own shape inside the app:
  `fixed inset-y-0 left-0` + `-translate-x-full`, unreachable in LTR and
  256px of sideways scroll in RTL.
- `GlowOrb`'s two call sites, whose parents lacked the `overflow-hidden`
  the component's own doc requires, leaving a negative physical offset
  that becomes reachable when mirrored.
- 37 pointing icons mirrored by lucide class name; `trending-up`,
  `phone`, `mail`, `clock`, `chevron-up`/`-down` and `external-link`
  deliberately NOT, each with its reason in `globals.css`.
- The active-nav rail and the row-collapse animation, both of which had to
  move two halves rather than one.

**Three defects the browser found that no source review did.**
1. `rtl:translate-x-full` outranks `md:translate-x-0`, so fixing the phone
   pushed the whole desktop sidebar off-screen at 1440 in Arabic — 114
   elements out of view against 3 in English. Needed
   `md:rtl:translate-x-0`.
2. `left-1/2 -translate-x-1/2` is the CENTRING idiom, not a reading-order
   offset. Converted to `start-1/2` it lands off-centre by the element's
   own width in Arabic. Eight sites; all reverted to physical, which is
   what the prompt's own carve-out prescribes.
3. The gate's own icon check knew one of the two class names lucide emits
   per icon (`lucide-undo2` AND `lucide-undo-2`), and its CSS parser read
   an explanatory COMMENT as a rule.

*Proven by:* `scripts/tests/rtl.test.mjs` (42 checks) ·
`scripts/tests/rtl.mutation.mjs` (17/17) ·
`scripts/tests/rtl-layout.prodtest.mjs` (90 checks green in Chromium at
390 and 1440, both locales, six routes) · before/after screenshots.

*Not done:* Hebrew, Persian and Urdu are named in `RTL_LANGUAGES` and have
no message catalogue, so nothing renders in them. Only `ar` was measured.

### 5. Translations no native speaker has read — THE FIRST STEP IS DONE, THE READING IS NOT (2026-09-07)

**~1 week of somebody else's time, and it is now an hour of it per
language.** Still not a coding task.

**2,933** keys × 9 locales, 0 untranslated — and **every non-English
string in this app was written by a model.** (This entry said 2,868 until
2026-09-07; the counted figure is 2,933, and the smaller number was
never sourced.) The Greek has an owner who reads it. Japanese, Chinese
and Arabic have nobody.

The gates check that a string *exists*, that it is *not identical to
English*, that its plurals cover the locale's categories, and that its ICU
renders. **None of them can check that it is good Japanese.** That is a
category no instrument reaches, and pretending otherwise is the thing this
project keeps refusing to do.

**THE SET IS COUNTED NOW, and it is the reason this was never started.**
`scripts/first-run-strings.mjs` walks every component reachable from the
signup form to the first thing the product says about a person's own
data:

| | |
|---|---|
| the whole product | 2,933 strings |
| on the first-run path | **598** |
| on the first screens AND prose rather than a label | **44** |

Forty-four sentences is an hour. 2,933 is why nobody ever started: a
backlog too long to begin has the same value as an empty one.

`docs/first-run/first-run.<locale>.md` is one file per language, tiered,
with the English beside every translation and a short note on what to look
for. `scripts/tests/first-run-strings.test.mjs` regenerates the pack and
compares it byte for byte, so what a reviewer is sent can never be last
week's wording. Rebuild with `npm run i18n:first-run`.

**AND THE FIRST 44 ALREADY FOUND SOMETHING.** Two sentences three lines
apart on the signup screen addressed the Greek reader differently — one
εσύ, one εσείς. Measured across the whole file: 473 informal, 15 polite
plural, 2 mixing both inside one sentence. All 17 read by hand, all 17
real, all 17 fixed, and `scripts/tests/address-register.test.mjs` holds
the count at zero. That is the one thing about a translation a machine
genuinely can check: not whether a sentence is good, but whether the file
agrees with itself about who it is talking to.

*Done means:* one reader per script — ja, zh, ar — through
`docs/first-run/`, tier 1 first.

*What is left, and it is not code:* three readers.

### 6. Chat that asks instead of guessing — WIRED AND MEASURABLE; the number needs traffic (2026-09-07)

**The classifier and the one-question cap shipped. The measured rate needs
API balance.**

**What the item asked, and what was already there.** `lib/clarification.ts`
has decided ambiguity since V4 — and it is a **Sonnet call**. A paid model
call, made in order to decide whether to make a paid model call. No amount
of prompt tuning makes that "decides before spending", and it reaches none
of the chat surfaces, which are exactly where somebody types three words
and expects the product to guess.

**□ → ☑ A classifier that decides before spending.** `src/lib/ai/ambiguity.ts`
is free, synchronous and needs no key. It answers **three** ways, and that
is the design rather than a detail:

| | |
|---|---|
| `clear` | act now — no clarification call, paid or otherwise |
| `vague` | ask now — the evidence is conclusive, paying a model to agree is waste |
| `unsure` | the middle, and the **only** case that reaches the paid check |

A binary detector needs a threshold, and every threshold on evidence this
weak is wrong for somebody: strict enough to catch «κάν' το» is strict
enough to interrogate a good one-line brief.

Measured over a 50-item labelled corpus, ten languages, both classes:

| | |
|---|---|
| clear requests wrongly called vague | **0 of 30** |
| vague requests decided with no model call | **20 of 20** |
| clear requests that pass merely by being long | 0 — every clear example is 3-6 words |

The two errors are not equal and the gate treats them differently:
interrogating somebody who was already clear is held at **zero**; deferring
a vague request costs one small call, which is what the product does today
on *every* request, so that is a ratchet rather than a zero.

**□ → ☑ At most one question — PER SURFACE, since 2026-09-07.** It was a
single 3, and one number for five surfaces was wrong in both directions.

| surface | cap | why |
|---|---|---|
| Website Builder | **2** | four unknowns no default covers — what the business is, which pages, whether it takes form submissions, whether there are photographs. Guessing produces a whole wrong site, not one wrong paragraph. |
| chat · agents · automations · mission · create | **1** | one dominant unknown and a cheap failure: one artefact to redo. |
| anything new | **1** | an unargued surface should have to argue for a second question, not inherit it. |

Each number carries its reason in `CLARIFICATION_QUESTION_CAP`, and the
gate checks the reasons are there — not only the numbers.

**And the budget reaches the model.** The tool used to say "1-3 questions"
to every surface while the parser trimmed afterwards. That is worse than it
sounds: a model asked for three writes three of equal weight and we keep
whichever came first, which is not the most important one. Told it has ONE,
it has to decide which unknown changes the outcome.

**□ The measured rate — BLOCKED, and this is what it needs.**

1. **API balance on the key's own account.** The rate that matters is how
   often the *paid* classifier asks when the free one said `unsure`, and
   that is a number only real calls can produce.
2. **A held-out set this repository does not own.** The 50 items above were
   written alongside the detector, so they measure the detector against its
   author. A real false-question rate needs requests nobody wrote for the
   test — the honest source is the product's own logs once it has been
   running, not another hand-made list.
3. **Somewhere to report it.** `narrated` already rides in the settlement
   metadata; `clarification_verdict` would go beside it, which is a code
   change and not a migration.

Roughly $2-4 of Sonnet calls for a first pass over a few hundred requests.
Until then the free detector's own numbers are real and the paid one's are
not measured — stated here rather than implied.

*Still not wired into chat itself.* The short-circuit lives in
`checkNeedsClarification`, so the five surfaces that already call it get
the saving today. Chat does not call clarification at all, and giving it
one means the streaming route has to be able to pause and ask — a
different piece of work from the classifier, and the classifier was what
was asked for.

*Proven by:* `scripts/tests/ambiguity.test.mjs` (47 checks, the full 10 x 2
cross-product) · `scripts/tests/ambiguity.mutation.mjs` (10/10, including
both degenerate classifiers — always-unsure and always-vague).


**THE THIRD PART IS BUILT. WHAT IT NEEDS NOW IS DAYS, NOT CODE.**

The reason the rate could not be measured was one line: `assessAmbiguity`
was called inside `checkNeedsClarification`, its verdict decided whether
to spend, and then it was thrown away. Every request that left a row in
`ai_cost_log` was therefore one the free reader had FAILED to decide — so
the only rate anybody could have computed was 100%.

Every surface that runs the check now writes three keys into its
settlement, through one builder (`clarificationMetadata`):

| key | what it says |
|---|---|
| `clarification_verdict` | `clear` / `vague` / `unsure` — the free reader's answer |
| `clarification_paid` | whether a model call was made to reach it |
| `clarification_asked` | whether the person was actually asked something |

`asked` is deliberately not the same as `paid`: a paid check that
concluded "no question needed" is a call that cost money and interrupted
nobody, and conflating them would report the product as ruder than it is.

**The denominator needed one exception.** A `clear` verdict spends
nothing, and `settlePrechecks` returns early on nothing spent — so the
cheap path, which is the common one, left no trace at all.
`api/websites/generate` now settles a zero-cost row when there is a
verdict, under its own feature name (`clarification_free`), the way
`ABSORBED_REFUSAL_FEATURE` does.

`scripts/db/clarification-rate.mjs` is the per-day query — `--sql` prints
it for the SQL editor. Proven against a real Postgres in
`scripts/tests/clarification-rate.dbtest.mjs` (17 checks), including that
a row from another feature is not counted and that an empty window
returns null rather than 0%.

**AND CHAT ASKS NOW.** It was the only surface that never ran the check —
the one place a person actually talks to the product was the one place it
always guessed. The check sits ABOVE the reservation, so a message that
becomes a question never takes a hold; it runs only on the OPENING
message of a conversation, because interrupting the fourth message of a
thread is worse than a slightly generic answer; and a `clarify` frame
carries the question to the same component the other four surfaces use.

*What is left, and no code produces it:* **traffic.** The keys are
written from this deploy onward, so the window has to start after it. A
week of ordinary use answers "how often does it ask", and the query says
so. What it still cannot say is whether the questions were the RIGHT
ones — that needs the held-out set, and it is not built.
### 6b. Ten copies of every help article competed for the same query — DONE (2026-09-07)

**Was an active bug: a Greek user could be handed the Portuguese answer.**

`help_articles` is one row per (slug, locale) — 27 articles x ten
languages, and that decision was right: `triggers` are the phrasings a
user types and a French user does not type Greek. What nobody joined up is
that `search_index_sync()` indexes every one of those rows, `search_index`
had no locale column, and `search_all` had nothing to filter on. All ten
translations sat in the index ranked against each other by `ts_rank`.

**What shipped** — `20260914000000_search_index_locale.sql`:
- `locale` and `group_key` on `search_index`, populated by the trigger
  **generically** through `to_jsonb(NEW)`, so a table without those columns
  yields null and needs no argument. Backfilled for rows already there.
- `search_all_localized(..., p_locale)` filters three ways: a null locale
  (the user's own rows) always passes, the reader's language passes, and
  English passes **only when that article has no copy in the reader's
  language** — scoped by `group_key`, so it fills a genuine gap rather than
  shadowing a translation that exists.
- The old five-argument `search_all` survives as a one-line forwarder.

**Three attempts, and the first two are worth recording.**
1. *Add `p_locale` with a default and drop the old function.* Breaks a
   property this repo already protects: `unified-search.dbtest.mjs`
   RE-RUNS the 20260824 migration to prove a migration is safe to apply
   twice, and that file re-creates the five-argument `search_all`. With a
   defaulted sixth argument a five-argument call then matches both —
   *"function is not unique"*, a search box that breaks the second time
   somebody pastes an old file.
2. *No default on `p_locale`.* Postgres refuses: "input parameters after
   one with a default value must also have defaults".
3. *A different name.* No signature overlaps, nothing can be ambiguous,
   and re-running any old migration is safe forever.

**And a finding about the process itself.** Re-running 20260824 also
reverts `search_index_sync()` to the version that knows nothing about
locale — everything indexed afterwards is written with null columns and
the filter passes everything. That is not a test artefact: it is what
happens the day somebody re-pastes an old file into the SQL editor, and
this repo applies migrations by hand with no ledger. The property worth
having is that re-applying the NEWER file repairs it, and section 11 of
`unified-search.dbtest.mjs` proves exactly that.

*Proven by:* 11 new checks in `unified-search.dbtest.mjs`, run against a
real Postgres with every migration applied — a Greek reader gets the Greek
copy and neither the Portuguese nor the English one; a French reader with
no French copy falls back to English and still never sees Portuguese; an
article with no translation stays reachable in every language; a user's own
row returns identically whatever locale is passed.

### 7. Greeklish — DONE (2026-09-06)

Shipped. `greekSkeleton` / `greeklishSkeletons` / `textHasGreeklishTerm` /
`textHasGreeklishStem` live in `src/lib/text/unicode-patterns.ts` where the
rest of the matching lives, and five surfaces call the one implementation:
⌘K search, the canned answers, the module vocabulary, the trading rule
parser and the website negative instructions. The sixth on the owner's
list, the classifier, is a model call with no pattern to teach — listed in
the gate WITH that reason, so an unexplained absence cannot be mistaken for
an oversight.

Nothing transliterates. Both sides reduce to a skeleton, one token per
Greek phoneme, the Greek side deterministic and only the Latin side
branching (capped at 16). `thelo`, `thelw`, `8elw` and `θέλω` all reduce to
`8elo`, which is how the ambiguous letters — `x` is both χ and ξ, `h` is
both η and χ — stop being a problem: nothing has to pick one.

*Proven by:* `greeklish.test.mjs` (25 checks) · `greeklish.mutation.mjs`
(15/15) · a 90x186 collision measurement over 16,740 pairs finding exactly
one (`idea ~ ιδέα`), allowed by name with a staleness check.

### 7b. The vocabulary has no verbs — DONE (2026-09-07)

**Found by the owner's own question**, which was the right one: "πόσο
ξόδεψα" scored zero on Finance in Greek, in Greek letters, on the module
whose whole subject is money — so was that one gap, or the shape of the
list?

It was the shape of the list. `src/lib/ai/module-vocabulary.ts` harvests
each module's terms from its slug, its title in all ten catalogues and its
field labels in all ten. Every one of those is a NOUN, because that is how
an interface is named. Measured across the full cross-product — 13 modules
x 10 languages, one verb-led question each, through the real scoring path:

| | before | after |
|---|---|---|
| questions reaching their own module | **12 of 130** | **128 of 130** |
| en | 2/13 | 12/13 |
| el | 3/13 | 12/13 |
| es · de · it · pt · ar | **0/13 each** | 13/13 each |
| fr | 3/13 | 13/13 |
| zh · ja | 2/13 each | 13/13 each |

*What shipped:* a third field, `verbs`, on every module in all ten
languages, scored at `primary` weight because "ξόδεψα" is exactly as strong
a claim about Finance as "έξοδα".

*The two that remain zero, and why they are not fixed:* `ideas/en` and
`ideas/el`. The verb an English or Greek speaker reaches for is "think" /
"σκέφτηκα", which is true of every module — "what do you think about my
sales" is not a question about Ideas. Adding it would make everything
score, which is a slower way of selecting nothing. Both are allowed BY NAME
in the gate, with a staleness check, rather than hidden under a floor.

*Proven by:* `scripts/tests/module-verbs.test.mjs` — the full 13x10
cross-product, 13 checks, no sampling.

### 8. Learning from use
**~1 week, and the riskiest item here.**

The intent is that the product gets better the more somebody uses it. The
danger is that "learning" becomes a feature nobody can audit: a model that
adapts is a model whose output stopped being reproducible.

*Before any of it is built, three questions need answers:*
- What exactly is remembered — corrections, preferences, vocabulary?
- Can the user see it, and delete it? (GDPR erasure already covers rows;
  it does not cover a preference baked into a prompt.)
- What happens when the learned thing is wrong — how does a user unlearn it?

*Do not start this until 1–7 are done.* It is the item most likely to
produce something that looks like it works.

---

## Tier 3 — the instruments

### 8b. The test database is not production — THE DAY OF CODE IS SPENT; the queries are not asked
**~15 minutes of the owner's time.** The "~2 days, and the first day is
free" this entry carried was right when written and wrong by 2026-09-11.

**The day of code below was spent on 2026-09-08 and this entry never said
so.** The "sharpest of the five" divergence — grant checks naming `anon`
and `authenticated` explicitly, so a privilege held by `authenticator`,
`dashboard_user` or `supabase_storage_admin` is invisible — is what
`scripts/db/role-grants.mjs` fixed, with `role-grants.test.mjs` (93
checks), `role-grants.dbtest.mjs`, a mutation suite, and migration
20260928000000. The register records the correction as divergence #5.
This file names none of them. Two of the three queries it lists below as
"still need a query against the real database" (`pg_roles` rolname,
storage `relrowsecurity`) are already answered in §2b.

`scripts/tests/stub-vs-production.test.mjs` holds eight facts the stub
must model and five divergences that remain. Two of the eight are there
because their absence caused a real incident: no default privileges hid
**89** grants that production really held, and no row level security on
`storage.objects` left **ten** policies inert *in the fixture* — account A
read account B's private file there. Production answered
`relrowsecurity = true` on 2026-09-05, so that second one cost coverage,
not safety: the ten policies could not be exercised at all, and one of
them saying `using (true)` would have gone unnoticed.

*The sharpest of the five, and the one worth closing first:* the grant
checks name `anon` and `authenticated` explicitly, so a privilege held by
`authenticator`, `dashboard_user` or `supabase_storage_admin` is invisible
to them **both locally and in production**. Making those checks
role-agnostic — "which roles hold this, and is each on a named list" —
costs about a day and needs no production access.

*Three of them were asked on 2026-09-05 and the answers are recorded in
section 2b of that file:* `storage.objects` has RLS on; no role carries an
unexpected `rolbypassrls`; and the only grant outside
`anon`/`authenticated`/`service_role`/`postgres` is on `pg_stat_statements`
(SELECT to PUBLIC, all to `dashboard_user`) — Supabase's own diagnostics,
no table of user data. That bounds the sharpest divergence above; it does
not close it, because nothing re-asks. *The rest still need a query
against the real database:*

    select e.extname, n.nspname from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace;
    select rolname from pg_roles order by 1;
    select relname, relrowsecurity from pg_class
      where relnamespace = 'storage'::regnamespace;

*Done means:* the register's five entries each carry a measured answer
from production rather than a direction-of-failure. *Proven by:* its own
mutation suite, 10 of 10 today, plus the entries changing from "unknown"
to a value.


### 8c. The ten storage policies — THE INSTRUMENTS LOOK AT THEM NOW; production has still not been asked
**~10 minutes of the owner's time**, plus half a day if the definition
comparison below is wanted.

**Most of this entry describes the tree as it stood before 2026-09-08.**
"the corner no instrument in this repository looks at" and "both schema
tools filter their object lists to the public tables" are both false now:
`db-inventory.mjs` and `db/pending-migrations.mjs` carry the storage schema
(commit 30445b9), `user-isolation.dbtest.mjs` compares the ten against
`pg_policies`, and the prodtest this entry asks for — "uploads one object
as A and tries to read it as B through the real storage API" — is written,
at `user-isolation-live.prodtest.mjs:306-367`.

**What survives intact, and it is the narrower claim:** nothing has asked
PRODUCTION, and nothing compares the policy BODIES. A production policy
rewritten to `using (true)` under a correct name is still invisible to
every instrument here, because nothing reads `pg_policies.qual`.

`storage.objects` is the one corner where the local stub and production
were found to *disagree* (2026-09-05: RLS off in the fixture, on in
production), and it is the corner **no instrument in this repository
looks at**.

Both schema tools filter their object lists to the public tables `src/`
queries — `scripts/db-inventory.mjs` through
`policies.filter((p) => tables.includes(p.table))`, and
`scripts/db/pending-migrations.mjs` the same way. So the **ten** policies
on `storage.objects`, the **three** functions and **three** tables in
`auth.`/`storage.` are outside both by construction. That is a decision,
not an accident — but until 2026-09-06 it was an *undeclared* one.

What exists now is a count, not a comparison:
`scripts/tests/sql-spellings.test.mjs` section 3 prints the excluded set
and goes red if it reaches zero, so the exclusion is visible and cannot
silently grow. What does not exist is anything that asks production
whether those ten policies are the ten this repo defines, or whether one
of them says `using (true)`.

**What it needs:** the same two throwaway accounts as item 1, and a
prodtest that uploads one object as A and tries to read it as B through
the real storage API — the shape `user-isolation.dbtest.mjs` already uses
for public tables, pointed at the one schema it cannot reach.

**Why it is Tier 3 and not Tier 1:** production answered
`relrowsecurity = true` on 2026-09-05, so the ten policies *are* being
enforced today. What is missing is the ability to notice if that stops
being true, or if a future migration adds an eleventh that is wrong.

### 9. The gates with no mutation suite — THE INSTRUMENT SHIPPED; the sweep did not
**~3 weeks if done exhaustively. Do not do it exhaustively.**

**"Done means" below was already met on 2026-09-08 and this entry did not
say so until 2026-09-11.** `scripts/tests/mutation-coverage.test.mjs`
prints the ratio on every `npm run build`, ratcheted, with its own 6 of 6
mutation suite. The number that was asked for is a number that moves now,
which is the thing this item wanted.

**154 of 273 gates the sweep can drive = 56.4%** (measured 2026-09-12; the
figure is printed by `node scripts/tests/mutation-coverage.test.mjs`, so
re-derive it rather than trusting this line). It read *143 of 273 (52.4%)*
on 2026-09-11, and *98 of 221 (44%)* before that — the 2026-09-05 figure,
stale in BOTH directions, because the covered count rose by 45 and the gate
population rose from 221 to 273. (It said *107 of 218 (49%)* until
2026-09-05; that figure could not be re-derived under any measure and is
corrected in §1 of the closing report.)

**Category 1 is finished.** The instrument's own breakdown now prints
`money and access: 0` — the 7 bare gates this entry named are all covered,
and four more went with them. Eleven suites, 66 mutants, on 2026-09-12:
`cron-auth` (9), `credit-function-privileges` (6), `purchased-credits` (6),
`purchased-credits-marker` (5), `purchased-credits-upgrade` (5),
`pricing-margin-bug` (6), `margin-report` (6), `plan-economics` (6),
`pricing-truth` (5), `guard-witnesses` (6), `security-posture` (6).

**Eleven of those 66 first ran AMBER, and the gate was fixed rather than
the mutant weakened.** That is a fifth of them, which is the same ratio the
previous pass found (9 in 46) and the reason this item is worth the time:
the suites are not a formality over gates already known to work, they are
how it was discovered that these ones did not. The biggest was
`security-posture.test.mjs` §1, which parsed RLS out of the RAW
concatenated schema — so `-- alter table public.chat_messages enable row
level security;` matched as well as the live line, and commenting out RLS
on the chat history left the section green. Others: `pricing-truth`
matching an evidence symbol inside a comment; `plan-economics` carrying
ceilings of 37.5% and 15% against a product at 24.3% and 4.3%, loose enough
that cutting the entry plan's price by 60% stayed green; three gates
crashing instead of printing FAIL, which the runner reads as an unhelpful
"exited non-zero".

The rise before that was not a sweep of the bare list. It came from suites
written for other V5 items — presentations, posts, sidebar-structure,
producer-routes, projects, nav-freshness, step-flow, env-independence, and
on 2026-09-11 search-index-locale and rpc-canaries. So the ratio moved as a
side effect of doing the work, which is the healthy way for it to move; the
2026-09-12 rise is the first that was this item being worked on directly.

A gate without that proof might be entirely decorative — and V4 found that
exact thing four times.

**What the ratio still cannot say.** 73 of the 273 are `.dbtest.mjs` (29)
and `.prodtest.mjs` (44): no sweep on a developer machine can mutate them,
because they need a provisioned Postgres or a deployed site. They are
counted in the denominator and named in the output rather than quietly
dropped.

*The order to do them in, and it is not alphabetical:*

1. **Money and auth first** — anything in `billing-*`, `credit-*`,
   `owner-only-*`, `user-scoped-*`, `write-guards`, `rate-limits`. A
   decorative gate there costs money or data.
2. **Then anything a user meets** — the i18n, layout and interaction gates.
3. **Then the rest**, and honestly: some of the remaining gates are small
   enough that a mutation suite would be longer than the gate. Say so in
   the file rather than writing a ceremonial one.

*Done means:* ~~the ratio published in `npm run build` output~~ — DONE
2026-09-08. ~~the 7 bare money/access gates~~ — DONE 2026-09-12, and the
instrument prints `money and access: 0` rather than this line claiming it.
What remains is category 2, which the same output names on every run: 10
bare gates a person meets (`accent-search` unit and itest, `chat-favorites`,
`chat-memory`, `help-articles` unit and itest, `language-reachable`,
`layout-unification`, `locale-formatting`, `navigation-cost`), and then 109
in category 3 — where the instruction above about small gates applies, and
the exemption register is the `EXEMPT` map in
`scripts/tests/mutation-coverage.test.mjs`, checked BOTH ways in that
file's §3 so an exemption cannot outlive its gate or sit on a gate that is
not small.

### 10. The `\b` convention has no gate — DONE (2026-09-08)

**This entry said "~1 day" and described the rule as future work until
2026-09-11. The work had been done three days earlier and nothing here
said so** — the file's last commit was 9dd8c25 on 2026-09-07, one day
before `untrusted-boundaries.test.mjs` shipped in b785a50, and no round
since came back to it. That is the failure this list is supposed to be
the cure for, so it is recorded rather than quietly overwritten.

128 uses; 83 are legitimately matching a tag or attribute name (and would
be *wrong* without the boundary), 26 are genuinely ASCII domains, and the
19 that touch human text were read one by one. `ascii-boundaries.test.mjs`
catches a boundary next to a non-ASCII literal — but it cannot tell a
correct `<img\b` from a Greek word without reading intent.

**The narrower rule this entry asked for is what shipped.**
`scripts/tests/untrusted-boundaries.test.mjs` (32 checks) is exactly the
"done means" below: a regex applied to a value that reached the app from a
user or a model must be declared, and word boundaries in that set are
banned outright. `docs/shapes.md:663-689` describes the built rule and is
current.

*What is left, and it is residue rather than work:* the "untrusted"
classification is a variable-NAME heuristic, so a regex applied to a value
called `s` is invisible to it. The gate prints its own precision (163 of
382) so the miss is visible, but nothing bounds it. That is a known
limit, stated here rather than discovered later.

### 11. The margin table has never met an invoice — THE QUERIES ARE WRITTEN; the invoice is not
**~half a day, once there is an invoice.**

The headline is still true: no invoice has ever been put beside
`ai_cost_log`. The body was stale from 2026-09-08 until 2026-09-11.

**"Reconciled against nothing" describes a pre-4e85779 tree.**
`scripts/db/anthropic-reconcile.mjs` (`npm run db:invoice`) lays one month
out in the shape of the bill and prints all three queries with `--sql` for
the SQL editor. It also closed the hole that made the question
unaskable: `ai_cost_log` has no model column and an action is routinely
served by two or three models, so nothing below the monthly total could be
placed beside an invoice broken down BY MODEL. `settleReservation` now
writes `metadata.modelBreakdown` on every settlement
(`billing/reservations.ts:516`), and query 3 reports coverage first so a
month that is largely unattributable cannot be silently reconciled on its
remainder.

**The cost of that fix arriving when it did:** rows settled before
2026-09-08 carry no breakdown and are unattributable for ever. The first
reconcilable month is the first complete month after it.

`CREDIT_MARGIN_*` is internally consistent. `cost-alerts` still compares
the app's own numbers with the app's own numbers.

*Done means:* one month of a real provider invoice next to
`ai_cost_log` for the same month, and the difference explained. If they
agree to within a few percent, the whole money axis moves. If they do not,
that is the most valuable finding V5 could produce.

---

## What is NOT on this list, and why

- **Stripe end-to-end** — V8. Needs real money, deliberately deferred.
- **The five readers** — V7.5. Not a coding task and not a V5 blocker.
- **Full RTL for the generated websites** — already handled: the website
  prompt covers `dir`, mirrored motion and icon flipping, and a real
  Arabic site was measured. Item 4 was about the *app*, which did not do
  what its own prompt required of models; as of 2026-09-07 it does, and
  the gate now reads that prompt's rules rather than restating them.

---

## The rule this list is written under

Every item says what "done" means and how it would be **proven** — not
"implemented". V4's lesson, four times over, was that those are different
words. An item here that reaches V6 with a green build and no live
evidence has not moved.
