import { descriptionFor, extractSeoFacts, keywordsFor, type SeoFacts } from "./facts";
// ONE ESCAPER — see lib/html-escape.ts. This file kept two of its own
// (escapeAttr, escapeText), each covering fewer characters than the
// shared one, and both writing into a PUBLISHED page's attributes.
import { escapeHtml } from "@/lib/html-escape";
import { buildStructuredData, serialiseJsonLd } from "./structured-data";
import { truncateAtWord } from "./html-text";

/**
 * THE <head> A PUBLISHED SITE SHOULD HAVE, made true.
 *
 * The prompt asks the model for a real title and a real description
 * (lib/seo/prompt.ts). This runs after, on the document it produced, and
 * closes the gap between "asked for" and "there" — which for anything
 * invisible is the whole gap: a missing <meta name="description"> looks
 * exactly like a present one in a browser, and the owner finds out from
 * a search result months later.
 *
 * NOTHING HERE IS INVENTED. Every value is read off the page by
 * facts.ts. Where the page says nothing, the tag is not emitted — an
 * og:description repeating the site name is not a description, and a
 * canonical URL guessed before the address exists is a canonical URL
 * pointing at the wrong site.
 *
 * TWO MOMENTS, and the split is not cosmetic:
 *
 *   GENERATION / EDIT — everything that depends only on the page:
 *     title, description, keywords, og:title, og:description,
 *     twitter:*, JSON-LD, lang. The site has no address yet.
 *   PUBLISH — everything that depends on the ADDRESS: canonical, og:url,
 *     og:site_name, the breadcrumb, and the @id fields in the schema.
 *     Re-run on every publish, so a site that changes its address does
 *     not keep pointing search engines at the old one.
 *
 * IDEMPOTENT BY CONSTRUCTION. Every tag it owns is removed before its
 * own block is inserted, so running it twice produces the same document
 * as running it once — which is exactly what publishing an already-
 * published site does.
 */

export type SeoContext = {
  /** This page's own absolute URL. Null before the site has an address. */
  canonicalUrl?: string | null;
  /** The site root, for og:url on the home page and for the WebSite node. */
  siteUrl?: string | null;
  siteName?: string | null;
  /** Home → this page, for a BreadcrumbList. Fewer than two entries
   *  emits none, because a breadcrumb of one is the page itself. */
  breadcrumb?: { name: string; url: string }[];
  /** The site-wide name/address/phone, so every page's schema agrees. */
  nap?: { name: string | null; address: string | null; phone: string | null } | null;
  /** Falls back to this when the document declares no lang. */
  locale?: string | null;
};

export type SeoHeadResult = {
  html: string;
  facts: SeoFacts;
  /** Which tags this pass put there — for logging and for tests to
   *  assert on something other than a string match. */
  emitted: string[];
  /** True when the document had no <title> worth the name and one was
   *  built from its content. Worth logging: it means the prompt was
   *  not obeyed. */
  titleWasMissing: boolean;
};

/** Google truncates around here; longer is not wrong, just unread. */
const MAX_TITLE = 60;

const OWNED_META_NAMES = ["description", "keywords", "twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"];
const OWNED_META_PROPERTIES = ["og:type", "og:title", "og:description", "og:url", "og:image", "og:image:alt", "og:site_name", "og:locale"];

export function enforceSeoHead(html: string, ctx: SeoContext = {}): SeoHeadResult {
  const facts = extractSeoFacts(html);
  const emitted: string[] = [];

  const title = titleFor(facts, ctx);
  const titleWasMissing = !facts.title || facts.title.trim().length < 3;
  const description = descriptionFor(facts);
  const keywords = keywordsFor(facts);
  const imageUrl = leadImageUrl(facts);
  const imageAlt = leadImageAlt(facts);

  let out = stripOwnedTags(html);

  const tags: string[] = [];
  if (title) {
    tags.push(`<title>${escapeHtml(title)}</title>`);
    emitted.push("title");
  }
  if (description) {
    tags.push(meta("name", "description", description));
    emitted.push("description");
  }
  if (keywords.length > 0) {
    tags.push(meta("name", "keywords", keywords.join(", ")));
    emitted.push("keywords");
  }

  // OPEN GRAPH. og:type is "article" only for a page that really is one
  // — a marketing page declaring itself an article is a lie a preview
  // card repeats.
  const ogType = facts.articleBody && facts.published ? "article" : "website";
  tags.push(metaProp("og:type", ogType));
  emitted.push("og:type");
  if (title) tags.push(metaProp("og:title", title));
  if (description) tags.push(metaProp("og:description", description));
  if (ctx.canonicalUrl) {
    tags.push(metaProp("og:url", ctx.canonicalUrl));
    emitted.push("og:url");
  }
  if (ctx.siteName) tags.push(metaProp("og:site_name", ctx.siteName));
  const lang = (facts.lang || ctx.locale || "").trim();
  if (lang) tags.push(metaProp("og:locale", lang.replace("-", "_")));
  if (imageUrl) {
    tags.push(metaProp("og:image", imageUrl));
    if (imageAlt) tags.push(metaProp("og:image:alt", imageAlt));
    emitted.push("og:image");
  }

  // TWITTER. summary_large_image only when there IS an image — the
  // large card with nothing in it renders as a broken box.
  tags.push(meta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary"));
  emitted.push("twitter:card");
  if (title) tags.push(meta("name", "twitter:title", title));
  if (description) tags.push(meta("name", "twitter:description", description));
  if (imageUrl) {
    tags.push(meta("name", "twitter:image", imageUrl));
    if (imageAlt) tags.push(meta("name", "twitter:image:alt", imageAlt));
  }

  if (ctx.canonicalUrl) {
    tags.push(`<link rel="canonical" href="${escapeHtml(ctx.canonicalUrl)}">`);
    emitted.push("canonical");
  }

  const graph = buildStructuredData(facts, {
    url: ctx.canonicalUrl ?? null,
    siteUrl: ctx.siteUrl ?? null,
    siteName: ctx.siteName ?? null,
    imageUrl,
    breadcrumb: ctx.breadcrumb ?? [],
    nap: ctx.nap ?? null,
  });
  const jsonLd = serialiseJsonLd(graph);
  if (jsonLd) {
    tags.push(jsonLd);
    emitted.push(...graph.map((node) => `jsonld:${String(node["@type"])}`));
  }

  out = ensureViewport(out, tags);
  out = ensureLang(out, lang);
  return { html: insertIntoHead(out, tags), facts, emitted, titleWasMissing };
}

// ---------------------------------------------------------------------

function titleFor(facts: SeoFacts, ctx: SeoContext): string | null {
  const own = facts.title?.trim();
  if (own && own.length >= 3) return truncateAtWord(own, MAX_TITLE);
  // Built from the page rather than left blank: a document with no title
  // shows its URL in a tab and in every search result.
  const parts = [facts.h1, ctx.siteName].filter((p): p is string => Boolean(p && p.trim()));
  if (parts.length === 0) return null;
  const unique = parts[0] === parts[1] ? [parts[0]] : parts;
  return truncateAtWord(unique.join(" — "), MAX_TITLE);
}

/**
 * The page's lead image, as an ABSOLUTE url.
 *
 * A relative src is useless in an og:image — the crawler fetching the
 * card has no page context. Resolved stock photos are already absolute,
 * which is the common case; a relative one is skipped rather than
 * guessed at.
 */
function leadImageUrl(facts: SeoFacts): string | null {
  for (const img of facts.images) {
    if (/^https?:\/\//i.test(img.src)) return img.src;
  }
  return null;
}

function leadImageAlt(facts: SeoFacts): string | null {
  for (const img of facts.images) {
    if (/^https?:\/\//i.test(img.src)) return img.alt && img.alt.trim() ? img.alt.trim() : null;
  }
  return null;
}

/**
 * Removes every tag this pass owns, so re-running replaces rather than
 * appends. The model's own description is read BEFORE this (extraction
 * runs on the original document), so removing it here loses nothing.
 */
export function stripOwnedTags(html: string): string {
  // THE WHITESPACE IN FRONT GOES WITH THE TAG.
  //
  // Leaving it behind is not cosmetic: this pass runs again on every
  // publish, so each republish removed a line and left its newline, and
  // a site's <head> grew a blank line per tag per publish, forever. It
  // showed up as "the pass is not idempotent" on a document that was
  // otherwise identical — which is exactly the shape of a bug nobody
  // reports and everybody's page carries.
  let out = html.replace(/[ \t]*\n?[ \t]*<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, "");
  out = out.replace(/[ \t]*\n?[ \t]*<link\b[^>]*\brel\s*=\s*("canonical"|'canonical')[^>]*>/gi, "");
  out = out.replace(
    /[ \t]*\n?[ \t]*<script\b[^>]*\btype\s*=\s*("application\/ld\+json"|'application\/ld\+json')[^>]*>[\s\S]*?<\/script\s*>/gi,
    ""
  );
  out = out.replace(/([ \t]*\n?[ \t]*)(<meta\b[^>]*>)/gi, (whole, lead: string, tag: string) => {
    const name = /\bname\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const prop = /\bproperty\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const nameValue = (name?.[2] ?? name?.[3] ?? "").toLowerCase();
    const propValue = (prop?.[2] ?? prop?.[3] ?? "").toLowerCase();
    if (OWNED_META_NAMES.includes(nameValue)) return "";
    if (OWNED_META_PROPERTIES.includes(propValue)) return "";
    // Some models write og:* under name= rather than property=. Those are
    // ours too, and leaving them behind means two og:titles.
    if (nameValue.startsWith("og:")) return "";
    if (propValue.startsWith("twitter:")) return "";
    return `${lead}${tag}`;
  });
  return out;
}

/** Lighthouse fails a page with no viewport, and so does a phone. */
function ensureViewport(html: string, tags: string[]): string {
  if (/<meta\b[^>]*\bname\s*=\s*("viewport"|'viewport')/i.test(html)) return html;
  tags.unshift('<meta name="viewport" content="width=device-width, initial-scale=1">');
  return html;
}

/** A document with no lang is announced in the reader's default voice,
 *  which for a Greek site read by an English screen reader is unusable. */
function ensureLang(html: string, lang: string): string {
  if (!lang) return html;
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  if (!htmlTag) return html;
  if (/\blang\s*=/i.test(htmlTag[0])) return html;
  return html.replace(/<html\b/i, `<html lang="${escapeHtml(lang)}"`);
}

function insertIntoHead(html: string, tags: string[]): string {
  if (tags.length === 0) return html;
  const block = `\n${tags.join("\n")}\n`;
  // The whitespace before </head> is consumed too: the previous run's
  // block left its own trailing newline there, and re-running would put
  // this block after it. One newline per publish is exactly the kind of
  // growth nobody notices until a document is mostly blank lines.
  if (/<\/head\s*>/i.test(html)) return html.replace(/\s*<\/head\s*>/i, `${block}</head>`);
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/(<head\b[^>]*>)/i, `$1${block}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/(<html\b[^>]*>)/i, `$1<head>${block}</head>`);
  return `<head>${block}</head>${html}`;
}

const meta = (keyAttr: string, key: string, value: string) =>
  `<meta ${keyAttr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`;
const metaProp = (key: string, value: string) => meta("property", key, value);

