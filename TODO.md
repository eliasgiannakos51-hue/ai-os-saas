# TODO

Work that is known, understood and deliberately not done yet. Each entry
says what is wrong, what it costs to leave, and what fixing it involves —
so a decision to defer stays a decision rather than becoming an accident.

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
