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

### 1. The isolation test: two real accounts — HALF DONE
**~half a day left.** Blocked on: two real accounts existing.

**The database half is done.** `scripts/tests/user-isolation.dbtest.mjs`
impersonates `authenticated` the way production does and probes all 96
user-owned tables with two accounts — read, update, delete, and the
unpredicated write a predicate cannot see. 18 checks, 7 of 7 schema
mutations caught. It is what found the 89 grants no policy covered.

*What is left, and it is the part that needs you:* the same questions
through a **real session against production** — two accounts, real JWTs,
PostgREST rather than psql. That additionally proves GoTrue issues the
claim the policies read, and that the deployed schema is this one. It is a
`.prodtest`, and it cannot be written against fixtures.

*Proven by:* the dbtest going red when a policy is loosened — already
demonstrated seven ways — plus, for the production half, the same suite
returning zero of B's rows through the API.

### 2. The spelling check: built, never run against a real site
**~half a day.** Blocked on: an Anthropic API key.

`findGreekMisspellings` ships with 61 unit checks and 7 mutations, and has
**never seen a real generated page.** Every refusal it makes is proven
against fixtures I wrote. The reported defect — "ρεμπα" where the word is
"ρεύμα" — has never been put through it.

*Done means:* generate three Greek sites; confirm the note appears, names
words that are on the page, and names none the owner wrote in the brief.
Cost: about 200 tokens per site.

*This is the honest state of every V4.6 AI feature that could not be run.*
It is first in this tier because it is the cheapest to close and the most
embarrassing to leave.

### 3. The three measurements that never ran
**~2 hours.** Blocked on: the same key. Budget: $15, of which $0.00 spent.

- `node scripts/website-pairs-check.mjs --out ./pairs-out` — ten
  same-category pairs, structural similarity measured rather than argued
- `node scripts/agent-tier-compare.mjs` — the three depth tiers on one task
- one site generated from a brief full of negative instructions

All three scripts exist and are tested. They have produced no numbers.

---

## Tier 2 — a user meets these

### 4. `dir="rtl"` for Arabic
**~2 days.**

`src/i18n/constants.ts` says, correctly, that Arabic ships text-only with
no RTL layout: no `dir="rtl"`, no logical properties, no mirrored pass. The
Arabic text renders right-to-left by Unicode's bidi algorithm; the nav,
the icons and the alignment stay left-to-right. An Arabic reader gets a
mirror-image of a layout that was never mirrored.

**And nothing keeps that comment true.** It is accurate today by
coincidence — if somebody added `dir` tomorrow the comment would be wrong
and no gate would notice. That is the "statement nobody re-asked" shape,
sitting in the file that documents it.

*Done means:* `dir` on `<html>` from the locale; physical offsets replaced
with logical properties; pointing icons mirrored under `[dir="rtl"]` and
non-pointing ones left alone (the website generator's own prompt already
says this — `lib/website-builder.ts` — so the app is asking of models
what it does not do itself); and a gate that fails if `dir` and the
comment disagree.

*Proven by:* a screenshot pair at 390px, and `honeypot-rtl.prodtest.mjs`
extended to the app rather than to generated sites.

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

### 7. Greeklish
**~2 days.**

"thelo na ftiakso" is Greek. The app treats it as noise: it is not Greek to
`foldForMatch`, not English to the classifier, and matches no canned
answer. A Greek user typing on a phone with an English keyboard — which is
most of them, some of the time — falls through every match this app has.

*Done means:* transliteration folded into `lib/text/unicode-patterns.ts`
where the rest of the matching lives, so search, canned answers, the
classifier and the rule parser all get it at once — **not wired at the one
place somebody needed it**, which is a named V4 shape.

*Proven by:* the same test corpus as the accent fold, in both directions,
including the ambiguous digraphs (θ/th, χ/ch/x, ψ/ps).

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
mutation suite, 7 of 7 today, plus the entries changing from "unknown" to
a value.


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
  Arabic site was measured. Item 4 is about the *app*, which does not do
  what its own prompt requires of models.

---

## The rule this list is written under

Every item says what "done" means and how it would be **proven** — not
"implemented". V4's lesson, four times over, was that those are different
words. An item here that reaches V6 with a green build and no live
evidence has not moved.
