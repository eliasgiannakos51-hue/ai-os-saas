# TODO

Work that is known, understood and deliberately not done yet. Each entry
says what is wrong, what it costs to leave, and what fixing it involves —
so a decision to defer stays a decision rather than becoming an accident.

## Help Centre migration to a table with a locale column

**The `/help` page shows Greek to nine of the ten languages.**

`src/lib/support/knowledge-base.ts` holds 27 articles whose titles and
answers are written entirely in Greek, as string literals in a TypeScript
file. `src/app/help/page.tsx` renders them verbatim to every visitor, and
its category headings (`CATEGORY_TITLES`) are hardcoded Greek too.

The chat already handles this correctly: `CANNED_ANSWER_LOCALE = "el"`
and `matchCannedAnswer` returns null for any other locale, so a
non-Greek user falls through to the model and gets a real answer in their
own language. That decision is recorded in the file and is the right
trade. `/help` never got the same treatment.

Nothing in the repo's own i18n checks catches it: `check-i18n.js` reads
`messages/*.json` and these strings are not there, and the bare-text
scanner (`scripts/jsx-text-report.mjs`) skips any string with no Latin
letters — which is every one of them.

**What fixing it involves**

- A `help_articles` table with `(slug, locale, title, body, category,
  published)`, a unique index on `(slug, locale)`, and a public read
  policy for published rows.
- A loader that resolves a locale and falls back to **English**, never to
  Greek — the fallback direction is the whole point.
- 27 articles × 10 locales to author. The Greek exists; English and the
  other eight do not.
- `/help` and `matchCannedAnswer` read from the table; `CATEGORY_TITLES`
  moves into `messages/*.json`.

**Not started.** There is no `help_articles` table, no migration for one,
and no loader — verified against every commit on every ref.

**Related, and deliberately independent:** the "?" help tips beside page
titles (`src/lib/help-tips.ts`) carry their own translated copy in all ten
locales and link to nothing. They were built that way so they would not
have to wait for this.
