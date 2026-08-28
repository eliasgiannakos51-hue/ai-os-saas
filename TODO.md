# TODO

Work that is known, understood and deliberately not done yet. Each entry
says what is wrong, what it costs to leave, and what fixing it involves —
so a decision to defer stays a decision rather than becoming an accident.

## V4: Changelog, Feature requests

Pulled out of the V3 build list on explicit instruction — not being built
in this pass. Recorded here so "not now" stays a decision on paper rather
than something that has to be re-remembered from a chat log.

Affiliate was the third name in this heading and is no longer here: it
shipped. See "Done: the affiliate programme" below. A deferral list that
still names something built two releases ago is worse than no list — it
is read as the current state of the product by whoever opens it next,
which is exactly what this file exists to prevent.

- **Changelog.** A public page (or in-app panel) listing what shipped,
  when. Nothing in the codebase produces this today — no structured
  record of releases exists to render it from; it would need one built
  first (a table, or a hand-maintained file) before any UI is worth
  writing.
- **Feature requests.** A place for users to submit and vote on what to
  build next. No submission table, no voting mechanism, no moderation
  path exist yet — this is a new subsystem, not a page.

Neither blocks anything already built or already promised on /roadmap or
/pricing — they were never listed as shipped or as "soon" there. Revisit
when V4 planning starts.

## The six ways a gate lies

Five were already named; the sixth cost the message-payload outage.

1. **A stale anchor.** A mutation whose `from` string no longer appears
   cannot re-introduce anything. Guarded by
   scripts/tests/mutation-suite-shape.test.mjs.
2. **A vacuous assertion.** `list.length === 0` over a list nothing ever
   fills. Guarded by scripts/tests/gate-vacuity.test.mjs.
3. **A runtime string the compiler never checks.** A Recharts `dataKey`,
   a `.from("table")`, an `p_*` argument to `.rpc()`, an env var named as
   a literal inside a map. Each needed its own scanner.
4. **A check that cannot go red.** Proven by mutation, per gate.
5. **An off-by-one in a positional comparison.** `-1` treated as a real
   index.
6. **Every mutation probing the same property.** THE NEW ONE.

Number six is the hardest, because a suite in that state looks its best.
marketing-messages.mutation.mjs had eleven mutations, eleven caught, and
named eight distinct checks between them — broad by any metric the
codebase could compute. All eleven asked "what do public pages need?"
None rendered a dashboard route, because the gate had no notion of one:
it scanned 15 of the app's 56 entry points and asserted nothing about the
other 41. The optimisation shipped and every dashboard page rendered raw
key names.

WHAT IS AND IS NOT CHECKABLE, since the difference matters:

- NOT checkable by shape. Counting distinct expected checks per suite
  would have called that suite healthy. The narrowness was in the GATE's
  domain, not in the suite's spread.
- CHECKABLE as a precondition: a mutation must NAME the check that
  catches it. Without that, a mutation broken by an unrelated failure
  scores as caught, and nobody can see which assertions the suite really
  exercises. Ten of forty-five suites do this today; section 4 of
  mutation-suite-shape.test.mjs holds that number as a rising floor.
- ANSWERABLE ONLY BY ASKING: what does this change do to the paths it was
  NOT written for? That is the rule above, and it is a question a person
  has to put to their own diff.

## The rule this branch paid for: prove what you do NOT remove

An optimisation that removes something must prove what it does NOT
remove, on every path — not only on the paths it was written for.

It cost one production outage. The root layout began sending public pages
five message namespaces instead of forty, on the strength of a gate that
walked 15 public entry points, 79 files and 18 client components, derived
the five namespaces rather than declaring them, and caught 11 of 11
mutations. Every one of those mutations asked the same question from a
different angle: "what do public pages need?"

None asked what the change did to the 41 dashboard entry points, their
477 files, or their 188 client components. 121 of those would have
rendered raw key names, and did: `sidebar.items.home`,
`sidebar.groups.workspace`, and eight more, on every dashboard page, for
every user. Only `common` strings survived, which is why "Make anything"
looked fine while the nav did not.

The mechanism was not the namespace list. app/layout.tsx is the ROOT
layout, and a shared layout is rendered once and reused across
client-side navigations beneath it. login-form.tsx does
`router.push("/dashboard/overview")` — a client-side navigation — so the
slice chosen for /login was still in force on the dashboard. No list
could have fixed that.

Two things follow, and both are now enforced by
scripts/tests/message-slices.test.mjs:

- A gate for a change that removes something must render EVERY route
  group, not the group the change is about.
- A group containing even one component that reaches a key unpredictably
  — useTranslations() with no namespace, useMessages(), t() with a
  computed key — can never be trimmed by a static list. The dashboard has
  sixty-one.

It is the same shape as the NaN-credits bug in the same branch: a check
that supplies its own inputs never sees what the real world supplies.

## Still unclaimed: 93% of the catalogue on public pages

The measurement stands — a Greek public page carries 159,737 characters
of message catalogue and reads 11,267 of them; the live home page is
303,706 characters in Greek against 210,565 in English. Claiming it needs
a layout per route group, each with its own NextIntlClientProvider, so
the slice is chosen where the group is. lib/i18n/message-slices.ts holds
the per-group namespace lists, derived and gated, ready for that.

## Done: the affiliate programme

Listed above as "not being built in this pass", and built. What exists:

- `/dashboard/affiliate` — the partner's own screen: their link, their
  signups, what they are owed, what has been paid.
- `/r/[code]` — the referral entry point, with attribution held in a
  cookie until the signup that claims it.
- `lib/affiliate/rules.ts` — the arithmetic and the four refusals, as
  pure functions: 25% of every payment for twelve months, a €20 payout
  floor, no self-referral, no re-referral of somebody already attributed,
  and no paying twice for one invoice (enforced here AND by a unique
  index, because a money rule enforced in one place is enforced until the
  next code path).
- Stripe Connect for payouts, and `scripts/tests/affiliate.test.mjs`
  covering the cases an affiliate would construct deliberately.

Recorded rather than deleted: the entry above was wrong for two releases
and nobody noticed, which is worth leaving a mark for.

## Done: Help Centre migration to a table with a locale column

`/help` used to show Greek to nine of the ten languages: the 27 articles
were string literals in `src/lib/support/knowledge-base.ts`, all Greek,
rendered verbatim to every visitor, with the category headings hardcoded
in the page on top of that. Nothing in the repo's i18n checks could see
it — `check-i18n.js` reads `messages/*.json` and these were never there,
and the bare-text scanner skips any string with no Latin letters.

Now: `help_articles(slug, locale, ...)`, 158 seeded rows (en=27, el=27,
13 core in the other eight), a loader that falls back to **English and
never to Greek** and says so visibly, and `matchCannedAnswer` matching a
user only against triggers in their own language. `CANNED_ANSWER_LOCALE`
is gone — it existed to refuse nine locales a canned answer rather than
give them a Greek one, and there is nothing left for it to protect
against.

**Remaining, and deliberate:** the eight non-Greek, non-English locales
carry the 13 core articles and fall back to English for the other 14.
That is a data gap, not an architectural one — adding a language is an
INSERT. The fallback is marked in the UI with a `lang` attribute rather
than served silently.

## Seeding: keep a single SQL statement small, and verify the count after

Getting 158 rows into `help_articles` took four attempts. The lesson is
worth writing down because the obvious version of it is wrong.

**What was tried, and what happened**

| shape | size | rows | result |
|---|---|---|---|
| 158 separate `insert … on conflict` statements, one file | 135 KB | 158 | 27 rows landed |
| the same, split into 10 files by locale | 10–28 KB | 13–27 | ~3 rows per file landed |
| ONE multi-row `insert` per locale | 12 KB | 27 (en) | **failed outright** |
| ONE multi-row `insert` per locale | 19 KB | 27 (el) | **passed** |
| the failing one, bisected | 6.7 KB / 6.0 KB | 14 / 13 | both passed |

**The rule that does NOT follow from this.** "Statements over ~10 KB
fail" is contradicted by row four: a 19 KB single statement went through
while a 12 KB one did not, with the same row count, the same structure
and the same generator. Whatever the real mechanism is — an editor-side
limit, a paste that was silently truncated in the browser, a timeout — it
was **not established**, and the error message was not captured. Writing
down a clean threshold nobody measured would send the next person looking
in the wrong place.

**What the evidence does support**

1. **Prefer one statement over many.** A file of many statements can stop
   part-way and leave rows behind with no error surfaced — that is how
   the first two attempts produced 27 rows and looked like success. A
   single multi-row `insert … on conflict` either lands whole or fails
   loudly. All-or-nothing beats silently-partial.
2. **Keep each statement small anyway.** ~7 KB chunks worked every time
   they were tried. It costs nothing.
3. **Count after every chunk.** `select locale, count(*) … group by
   locale` after each piece is what turned "it seemed to work" into a
   number. Neither partial run was visible any other way.
4. **Skip the editor entirely when you can.** `psql -f` or
   `supabase db push` on the file in `supabase/migrations/` has none of
   these failure modes; every problem above came from moving 135 KB of
   SQL through a browser.

**The generator already helps with (1) and (2):** the per-locale, single-
statement form is reproducible from `scripts/help-articles/`. If a chunk
is still too big, bisect it — the rows are independent and the upsert
makes any order and any number of re-runs safe.
