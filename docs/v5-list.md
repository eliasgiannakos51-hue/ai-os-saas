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


### 1. The isolation test: two real accounts — HALF DONE
**~half a day left.** Blocked on: two real accounts existing.

**The database half is done.** `scripts/tests/user-isolation.dbtest.mjs`
impersonates `authenticated` the way production does and probes all 96
user-owned tables with two accounts — read, update, delete, and the
unpredicated write a predicate cannot see, plus the three storage buckets
as files rather than as rows about files. 22 checks, 9 of 9 schema
mutations caught. It is what found the 89 grants no policy covered.

*What is left, and it is the part that needs you:* the same questions
through a **real session against production** — two accounts, real JWTs,
PostgREST rather than psql. That additionally proves GoTrue issues the
claim the policies read, and that the deployed schema is this one. It is a
`.prodtest`, and it cannot be written against fixtures.

*Proven by:* the dbtest going red when a policy is loosened — already
demonstrated seven ways — plus, for the production half, the same suite
returning zero of B's rows through the API.

### 2. The spelling check — RUN AGAINST A REAL SITE, and it found a defect
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

*What is left:* one classification call, to see the note produced end to
end. It needs a balance, and — for the free path the owner asked for
first — the URL of a site that already exists.

### 3. The three measurements — TWO OF THREE RAN
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

*Items 4, 7 and 7b are done. What remains in this tier is 5, 6 and 8.*

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

### 5. Translations no native speaker has read
**~1 week of somebody else's time.** Not a coding task.

2,868 keys × 9 locales, 0 untranslated — and **every non-English string in
this app was written by a model.** The Greek has an owner who reads it.
Japanese, Chinese and Arabic have nobody.

The gates check that a string *exists*, that it is *not identical to
English*, that its plurals cover the locale's categories, and that its ICU
renders. **None of them can check that it is good Japanese.** That is a
category no instrument reaches, and pretending otherwise is the thing this
project keeps refusing to do.

*Done means:* one reader per script — ja, zh, ar — through the screens a
new user meets, not the whole catalogue. (How many that is has not been
measured; do not carry a number here that nobody counted.)

*Cheapest first step:* the signup and first-run path only — the screens a
person meets before they have decided anything. That set has not been
counted; counting it is the first ten minutes of this item, not a number to
put here in advance.

### 6. Chat that asks instead of guessing
**~3 days.**

When a request is ambiguous the model picks an interpretation and commits.
The user finds out by reading a wrong answer. A clarifying question costs
one round trip and saves a whole generation.

*Done means:* a classifier that decides "ambiguous" before spending;
at most one question; the question in the user's language; and — the part
that makes it a feature rather than an annoyance — a measured rate, so
"asks too often" is a number and not an argument.

*Proven by:* a held-out set of requests labelled ambiguous/clear, and a
false-question rate reported in the settlement metadata the way `narrated`
already is.

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

### 8b. The test database is not production, and five ways are named
**~2 days, and the first day is free.**

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


### 8c. The ten storage policies nothing compares
**~1 day.**

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

### 9. The 123 gates with no mutation suite
**~3 weeks if done exhaustively. Do not do it exhaustively.**

98 of 221 gates (44%) have been shown to go red on the defect they name.
The other 123 have not. (This paragraph said *107 of 218 (49%)* until
2026-09-05; that figure could not be re-derived under any measure and is
corrected in §1 of the closing report. The command that produces the
number above is printed there.) A gate without that proof might be entirely
decorative — and V4 found that exact thing four times.

*The order to do them in, and it is not alphabetical:*

1. **Money and auth first** — anything in `billing-*`, `credit-*`,
   `owner-only-*`, `user-scoped-*`, `write-guards`, `rate-limits`. A
   decorative gate there costs money or data.
2. **Then anything a user meets** — the i18n, layout and interaction gates.
3. **Then the rest**, and honestly: some of the remaining gates are small
   enough that a mutation suite would be longer than the gate. Say so in
   the file rather than writing a ceremonial one.

*Done means:* the ratio published in `npm run build` output, so it is a
number that moves rather than a number in a document.

### 10. The `\b` convention has no gate
**~1 day.**

128 uses; 83 are legitimately matching a tag or attribute name (and would
be *wrong* without the boundary), 26 are genuinely ASCII domains, and the
19 that touch human text were read one by one. `ascii-boundaries.test.mjs`
now catches a boundary next to a non-ASCII literal — but it cannot tell a
correct `<img\b` from a Greek word without reading intent.

*Done means:* a narrower rule that is enforceable — for example, every
regex applied to a value that reached the app from a user or a model must
be declared, and boundaries in that set are banned outright.

### 11. The margin table has never met an invoice
**~half a day, once there is an invoice.**

`CREDIT_MARGIN_*` is internally consistent and reconciled against nothing.
`cost-alerts` compares the app's own numbers with the app's own numbers.

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
