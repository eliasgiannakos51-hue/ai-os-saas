/**
 * Reading TEXT out of a generated document.
 *
 * Shared by every SEO pass, and separate from them because getting it
 * subtly wrong is how an SEO description ends up containing CSS. The
 * first version of this did exactly that: it stripped tags without
 * removing <style> first, so the "first substantial paragraph" of a site
 * was `body{margin:0;font-family:...}`.
 *
 * These are regex readers, not a parser, which is the same posture as
 * the rest of this app's HTML handling (see lib/website-link-safety.ts).
 * The limit is stated rather than hidden: an attribute value containing
 * a literal `>` will end a tag match early. Generated documents do not
 * contain those in practice, and the failure is a missed fact rather
 * than a wrong one.
 */

/** <script> and <style> bodies, which are not prose in any sense. */
const NON_PROSE = /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAG = /<[^>]+>/g;
const COMMENT = /<!--[\s\S]*?-->/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&euro;": "€",
  "&pound;": "£",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z#0-9]+;/gi, (e) => {
      const known = ENTITIES[e.toLowerCase()];
      if (known !== undefined) return known;
      const numeric = /^&#(x?)([0-9a-f]+);$/i.exec(e);
      if (numeric) {
        const code = parseInt(numeric[2], numeric[1] ? 16 : 10);
        // Only characters that are safe to place in text. A decoded
        // control character in a meta description is a corrupt tag.
        if (Number.isFinite(code) && code >= 32 && code !== 127) return String.fromCodePoint(code);
      }
      return e;
    });
}

/** All the readable text of a fragment, whitespace collapsed. */
export function textOf(htmlFragment: string): string {
  return decodeEntities(
    htmlFragment.replace(COMMENT, " ").replace(NON_PROSE, " ").replace(TAG, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** The document with <script>, <style> and comments removed. */
export function withoutNonProse(html: string): string {
  return html.replace(COMMENT, " ").replace(NON_PROSE, " ");
}

/** The inner HTML of every occurrence of one element. */
export function elements(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`, "gi");
  return [...html.matchAll(re)].map((m) => m[1]);
}

/** Every opening tag of one element, whole, so its attributes can be read. */
export function openTags(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return html.match(re) ?? [];
}

/**
 * One attribute's value off an opening tag.
 *
 * Handles all three forms a model writes — double-quoted, single-quoted
 * and unquoted — because reading only the double-quoted form means a
 * page written with single quotes silently has no alt text, no
 * data-seo-* facts and no schema, while looking perfectly fine.
 */
export function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  const raw = m[2] ?? m[3] ?? m[4] ?? "";
  return decodeEntities(raw).trim();
}

/** Does this opening tag carry the attribute at all, even empty? */
export function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*(=|[\\s/>])`, "i").test(tag);
}

/**
 * Cut to a length without cutting a word in half, and without ending on
 * a comma. A meta description truncated mid-word is what a search result
 * shows, so this is user-visible text rather than an internal detail.
 */
export function truncateAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, "");
  return `${base}…`;
}
