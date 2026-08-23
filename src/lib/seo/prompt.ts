/**
 * WHAT THE MODEL IS ASKED FOR, and why it is this and not more.
 *
 * The rule everywhere else in this app applies here too: the prompt
 * ASKS and the code ENFORCES (lib/seo/head.ts, lib/seo/alt-text.ts).
 * What the prompt is for is the half enforcement cannot do — the
 * JUDGEMENT. Only the model knows that this bakery is a Bakery and not a
 * Restaurant, that the description should mention the neighbourhood, and
 * what the answer to "do you deliver?" actually is.
 *
 * SO IT ASKS FOR FACTS, NOT FOR TAGS. No JSON-LD, no og:*, no canonical:
 * those are built from what it writes (lib/seo/structured-data.ts),
 * because a model hand-writing JSON-LD produces plausible, invalid
 * schema that Google silently ignores — and because the core prompt
 * forbids <script> tags, and carving out an exception invites reasoning
 * about which scripts are allowed.
 *
 * THE HOOKS ARE ORDINARY HTML where ordinary HTML carries the fact —
 * <address>, tel:, mailto:, <details>/<summary>, <time> — and a small
 * number of data-seo-* attributes only where no element means it.
 *
 * LOCAL FIRST. AI Overviews have taken most of the clicks informational
 * pages used to get; "bakery near me" still walks somebody through a
 * door. So the emphasis is on the facts a local listing is built from,
 * and on their being IDENTICAL across every page (see nap.ts).
 */
export function seoInstruction(): string {
  return `
FINDABLE ON THE WEB (SEO)
- Every page gets its OWN <title> (under 60 chars: the name, then what or where it is) and its OWN <meta name="description"> (110-155 chars, written for someone reading a search result).
- One <h1> per page. EVERY <img> carries an alt, including ones that are not placeholders; a decorative shape gets alt="".
- Write NO <script>, og:/twitter: meta, canonical or JSON-LD — those are generated from what you write below.

A BUSINESS WITH A LOCATION — what actually brings customers, so be exact:
- Postal address in an <address> element. Link its social profiles if given.
- The SAME name, address and phone, character for character, on EVERY page: a footer differing by one character splits the business in two to a search engine.
- Add these ONLY where the description gives the fact, NEVER invented — a wrong address is published to a map:
  data-seo-type (schema.org kind: Bakery, CafeOrCoffeeShop, Restaurant, HairSalon, Dentist, Plumber, Hotel, Store, Attorney, AutoRepair — omit if none fits)
  data-seo-name, data-seo-address, data-seo-locality (city/area)
  data-seo-hours per hours line, exactly "Mo-Fr 09:00-17:00"; data-seo-price-range ("€€"); data-seo-geo="40.6329,22.9403"
- FAQs as <details><summary>Question?</summary><p>Answer.</p></details> — only that becomes a rich result.
- Dated writing: <article> with <time datetime="2026-03-14">. A product with a given price: <div data-seo-product="Name" data-seo-price="12.50" data-seo-currency="EUR">.`;
}
