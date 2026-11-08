# Page counter: what the pages must say before the switch is opened

**Status, 2026-11-08: proposed wording, not reviewed by a lawyer, not on any page.**
The counter is built and sits behind the `first-party-analytics` switch at «you and the
test account». Only your own views are counted until you open it to everyone on
`/dashboard/system-health`. **Do not open it to everyone until `/cookies` and `/privacy`
say the following and a lawyer has read them.** I am not a lawyer; whether a counter
like this needs consent depends on the country and on the regulator, and I have not
checked that for the countries Ionexa sells in.

## What the counter actually does (checkable in the code)

- It counts page views: one number per day, per page, per source ("direct", the
  referring website's name, or a campaign tag such as `utm_source=newsletter`).
  Rules: `src/lib/analytics/normalize.ts`. The table: `supabase/migrations/20261108010000_page_view_counts.sql`.
- It stores no cookie, no visitor identifier, no IP address, no user agent and no
  account identifier. `scripts/tests/first-party-analytics.test.mjs` holds each of
  those, including that the table has four columns and none can hold a person.
- Addresses that could name a person are not stored as they are: an identifier in an
  address becomes `:id`, and an address with a query string, a fragment or an encoded
  character is not counted at all.
- It is silent when the browser sends Do Not Track or Global Privacy Control.
- It counts **views, not visitors**: one person reloading ten times is ten views.
- It does not exclude bots, and it misses browsers that block the call, so the
  figures are a floor and a mixture.
- It counts every page, including pages inside the signed-in product, but never which
  account viewed them.

## Proposed sentences (English; the other eight languages follow once the English is settled)

For `/cookies`: «Ionexa does not set any cookie to measure visits. We count how many
times each page is viewed per day and where the view came from (for example "direct"
or the name of the referring website), with no cookie, no identifier and no IP address
stored. We do not count visitors, and the count cannot be traced to a person.»

For `/privacy`: «To understand which pages are used, we keep a daily count of page
views per page and per source. The count contains no personal data: it stores no IP
address, no user agent, no account identifier and no cookie. We do not use it to
identify, profile or follow anyone. If your browser sends Do Not Track or Global
Privacy Control, we do not count your views.»

## What I did not check

- Whether a lawyer would call this "no personal data" in each country.
- Whether the existing cookie banner should mention it.
- The current wording of `/cookies` and `/privacy` against these sentences (the pages
  live in `src/app/cookies/page.tsx` and `src/app/privacy/page.tsx`, with their
  texts in `messages/*.json`); I have not changed either.
