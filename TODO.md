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
