import { attr, elements, hasAttr, openTags, textOf, truncateAtWord, withoutNonProse } from "./html-text";

/**
 * WHAT A PAGE ACTUALLY SAYS, read off the page.
 *
 * Every SEO tag this app emits — the description, the Open Graph card,
 * the LocalBusiness schema — is built from this and from nothing else.
 * That is the whole design rule, and it is not an aesthetic one: an SEO
 * pass that can invent is an SEO pass that publishes a phone number
 * nobody gave to a search engine, which then shows it to somebody who
 * rings it. Every field here is nullable and stays null when the page
 * does not say.
 *
 * WHY EXTRACTION AND NOT A TEMPLATE. A template produces the same
 * description for a bakery and a law firm. These come from the page's
 * own title, its own headings, its own contact block — so two sites
 * share a tag only when they share the content.
 *
 * THE MODEL'S PART. The prompt (lib/seo/prompt.ts) asks for a real
 * <title>, a real <meta name="description">, semantic contact markup
 * (<address>, tel:, mailto:), <details>/<summary> for FAQs, and a small
 * number of explicit data-seo-* hooks for the facts no markup carries —
 * the business type, the opening hours, the price range. Everything the
 * model omits is either derived from what it did write or left out.
 */

export type SeoImage = {
  src: string;
  /** As written. "" means explicitly decorative. */
  alt: string | null;
  /** The image pipeline's own search phrase — the best description of
   *  the photo that exists anywhere in the document. */
  query: string | null;
};

export type SeoFaq = { question: string; answer: string };

export type SeoProduct = { name: string; price: string | null; currency: string | null };

export type SeoFacts = {
  lang: string | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: string[];
  paragraphs: string[];
  businessName: string | null;
  /** A schema.org type the page declared: "Restaurant", "Bakery"… */
  businessType: string | null;
  address: string | null;
  locality: string | null;
  phone: string | null;
  email: string | null;
  openingHours: string[];
  priceRange: string | null;
  geo: { lat: number; lng: number } | null;
  sameAs: string[];
  faqs: SeoFaq[];
  products: SeoProduct[];
  images: SeoImage[];
  /** An <time datetime> the page carries — an article's publication. */
  published: string | null;
  articleBody: boolean;
};

const MAX_DESCRIPTION = 160;

/** Anything shorter than this is a label, not prose. */
const MIN_PARAGRAPH = 40;

export function extractSeoFacts(html: string): SeoFacts {
  const prose = withoutNonProse(html);

  const htmlTag = (html.match(/<html\b[^>]*>/i) ?? [])[0] ?? "";
  const lang = htmlTag ? attr(htmlTag, "lang") : null;

  const title = firstText(elements(html, "title")) ?? null;
  const metaDescription = metaContent(html, "name", "description");

  const h1 = firstText(elements(prose, "h1"));
  const headings = [
    ...elements(prose, "h1"),
    ...elements(prose, "h2"),
    ...elements(prose, "h3"),
  ]
    .map(textOf)
    .filter((t) => t.length > 0);

  const paragraphs = elements(prose, "p")
    .map(textOf)
    .filter((t) => t.length >= MIN_PARAGRAPH);

  // CONTACT FACTS, from the markup that carries them rather than from a
  // regex over the page text. A phone number is what a tel: link points
  // at; a "phone-looking" run of digits in body copy is a price, a year
  // or a street number about as often as it is a phone number.
  const phone = firstHref(prose, /^tel:/i)?.replace(/^tel:/i, "").trim() ?? null;
  const email = firstHref(prose, /^mailto:/i)?.replace(/^mailto:/i, "").split("?")[0].trim() ?? null;

  const addressFromTag = firstText(elements(prose, "address"));
  const address = dataSeo(prose, "address") ?? addressFromTag;
  const locality = dataSeo(prose, "locality");

  const businessType = dataSeo(prose, "type");
  const businessName = dataSeo(prose, "name") ?? h1 ?? siteNameFromTitle(title);
  const priceRange = dataSeo(prose, "price-range");
  const openingHours = dataSeoAll(prose, "hours");
  const geo = parseGeo(dataSeo(prose, "geo"));

  return {
    lang: lang || null,
    title,
    metaDescription,
    h1,
    headings,
    paragraphs,
    businessName,
    businessType,
    address,
    locality,
    phone,
    email,
    openingHours,
    priceRange,
    geo,
    sameAs: socialLinks(prose),
    faqs: extractFaqs(prose),
    products: extractProducts(prose),
    images: extractImages(html),
    published: firstAttr(openTags(prose, "time"), "datetime"),
    articleBody: /<article\b/i.test(prose),
  };
}

/**
 * The description this page should carry.
 *
 * The model's own <meta name="description"> wins when it wrote one worth
 * having — it read the brief and this did not. Otherwise it is built
 * from the page's first substantial paragraph, which is the closest
 * thing a document has to a summary of itself.
 */
export function descriptionFor(facts: SeoFacts): string | null {
  const own = facts.metaDescription?.trim();
  if (own && own.length >= 50) return truncateAtWord(own, MAX_DESCRIPTION);
  const fromProse = facts.paragraphs[0];
  if (fromProse) return truncateAtWord(fromProse, MAX_DESCRIPTION);
  // A short own-description is better than nothing, and better than a
  // heading — it was at least written to be a description.
  if (own) return own;
  if (facts.h1) return truncateAtWord(facts.h1, MAX_DESCRIPTION);
  return null;
}

/**
 * The page's keywords, as PHRASES the page actually uses.
 *
 * Deliberately not a word-frequency count: that produces "the, and,
 * our" in English and nothing at all in Greek or Japanese, because
 * frequency analysis needs a stopword list per language and this app
 * generates sites in any of them. Headings and the declared business
 * type are already the noun phrases a keywords list wants, in whatever
 * language the site is written in.
 *
 * WORTH SAYING PLAINLY: Google has ignored <meta name="keywords"> since
 * 2009. It is emitted because it is harmless, because some other
 * engines and internal site searches still read it, and because it was
 * asked for — not because it moves a ranking.
 */
export function keywordsFor(facts: SeoFacts, max = 10): string[] {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const v = (value ?? "").trim();
    if (!v || v.length > 60) return;
    if (out.some((k) => k.toLowerCase() === v.toLowerCase())) return;
    out.push(v);
  };
  push(facts.businessType);
  push(facts.businessName);
  push(facts.locality);
  for (const h of facts.headings.slice(0, max * 2)) {
    // A heading that is a sentence is not a keyword.
    if (h.length <= 40 && !/[.!?]$/.test(h)) push(h);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

// ---------------------------------------------------------------------
// readers
// ---------------------------------------------------------------------

function firstText(fragments: string[]): string | null {
  for (const f of fragments) {
    const t = textOf(f);
    if (t) return t;
  }
  return null;
}

function firstAttr(tags: string[], name: string): string | null {
  for (const tag of tags) {
    const v = attr(tag, name);
    if (v) return v;
  }
  return null;
}

export function metaContent(html: string, keyAttr: string, keyValue: string): string | null {
  for (const tag of openTags(html, "meta")) {
    const key = attr(tag, keyAttr);
    if (key && key.toLowerCase() === keyValue.toLowerCase()) {
      const content = attr(tag, "content");
      if (content) return content;
    }
  }
  return null;
}

function firstHref(html: string, scheme: RegExp): string | null {
  for (const tag of openTags(html, "a")) {
    const href = attr(tag, "href");
    if (href && scheme.test(href)) return href;
  }
  return null;
}

/** data-seo-<key> on any element — the value, or the element's text. */
function dataSeo(html: string, key: string): string | null {
  return dataSeoAll(html, key)[0] ?? null;
}

/**
 * Every data-seo-<key> on the page, in document order.
 *
 * THE INNER TEXT IS READ IN THE SAME PASS, and that is not a style
 * choice. The first version found the opening tags, then searched the
 * document for each tag's own string to get at its contents — and two
 * identical tags (`<p data-seo-hours>` twice, which is exactly how a
 * page states weekday and weekend hours) both found the FIRST one. The
 * site's opening hours came out as Monday-to-Friday listed twice, in the
 * schema, on a live page. Matching the element and its contents together
 * makes that impossible: the iterator advances past each match.
 *
 * The limit, stated: the inner capture stops at the first closing tag of
 * the same name, so a same-tag element nested inside one of these hooks
 * would cut the value short. These hooks go on leaf elements.
 */
function dataSeoAll(html: string, key: string): string[] {
  const re = new RegExp(
    `<([a-z0-9]+)\\b[^>]*\\bdata-seo-${key}\\b[^>]*>(?:([\\s\\S]*?)<\\/\\1\\s*>)?`,
    "gi"
  );
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    const explicit = attr(openTag, `data-seo-${key}`);
    if (explicit) {
      out.push(explicit);
      continue;
    }
    // No value: the element's own text is the fact. <p data-seo-hours>Mon-Fri 9-5</p>
    const text = textOf(m[2] ?? "");
    if (text) out.push(text);
  }
  return out;
}

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
];

function socialLinks(html: string): string[] {
  const out = new Set<string>();
  for (const tag of openTags(html, "a")) {
    const href = attr(tag, "href");
    if (!href || !/^https?:\/\//i.test(href)) continue;
    try {
      const host = new URL(href).host.replace(/^www\./i, "").toLowerCase();
      if (SOCIAL_HOSTS.includes(host)) out.add(href);
    } catch {
      /* an unparseable URL is not a profile link */
    }
  }
  return [...out];
}

/**
 * FAQs, from the markup a generated page uses for them.
 *
 * <details><summary>Question</summary>Answer</details> is the accordion
 * every generated FAQ section is built from, and it is unambiguous: the
 * summary IS the question. A heading-plus-paragraph guess would turn
 * every section of every page into a fake FAQ, and a FAQPage schema
 * claiming questions the page does not ask is exactly the kind of thing
 * a manual action is for.
 */
function extractFaqs(html: string): SeoFaq[] {
  const out: SeoFaq[] = [];
  for (const m of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details\s*>/gi)) {
    const inner = m[1];
    const summary = elements(inner, "summary")[0];
    if (!summary) continue;
    const question = textOf(summary);
    const answer = textOf(inner.replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/i, ""));
    if (question && answer) out.push({ question, answer });
  }
  return out;
}

/** Products, only where the page declared them. Guessing from a card
 *  grid would turn a services list into a shop. */
function extractProducts(html: string): SeoProduct[] {
  const out: SeoProduct[] = [];
  const re = /<([a-z0-9]+)\b[^>]*\bdata-seo-product\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  for (const m of html.matchAll(re)) {
    const tag = m[0].slice(0, m[0].indexOf(">") + 1);
    const name = attr(tag, "data-seo-product") || textOf(m[2]).slice(0, 120);
    if (!name) continue;
    out.push({
      name,
      price: attr(tag, "data-seo-price"),
      currency: attr(tag, "data-seo-currency"),
    });
  }
  return out;
}

function extractImages(html: string): SeoImage[] {
  return openTags(withoutNonProse(html), "img").map((tag) => ({
    src: attr(tag, "src") ?? "",
    alt: hasAttr(tag, "alt") ? (attr(tag, "alt") ?? "") : null,
    query: attr(tag, "data-image-query"),
  }));
}

function parseGeo(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  // Out-of-range coordinates are a typo, and a schema carrying them is
  // worse than one without geo at all.
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}

/** "Acme Bakery — Fresh bread in Athens" → "Acme Bakery". */
function siteNameFromTitle(title: string | null): string | null {
  if (!title) return null;
  const head = title.split(/\s+[|—–-]\s+/)[0].trim();
  return head || title.trim() || null;
}
