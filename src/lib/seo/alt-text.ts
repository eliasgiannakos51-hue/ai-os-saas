import { attr, decodeEntities, hasAttr } from "./html-text";

/**
 * EVERY IMAGE ENDS UP WITH AN alt ATTRIBUTE.
 *
 * Two audiences, one rule. A screen reader announces "image" and moves
 * on when alt is missing; a crawler learns nothing about a photo it
 * cannot see. Both are fixed by the attribute EXISTING — and the value
 * matters as much as the presence.
 *
 * WHERE THE TEXT COMES FROM, in order, and every source is something the
 * document already says:
 *
 *   1. data-image-query — the phrase the image pipeline searched for
 *      ("wood-fired oven with bread"). It is the single best description
 *      of the photo that exists anywhere, and it is already in the tag.
 *   2. title / aria-label on the same element.
 *   3. The <figcaption> of the <figure> the image sits in.
 *   4. A filename that carries words ("stone-oven.jpg" → "stone oven").
 *
 * AND WHEN NONE OF THOSE EXIST, alt="" — not a guess.
 *
 * That is deliberate and it is the whole ethic of this pass. "Image",
 * "Photo", the business name, the page title: all of them pass an
 * automated check and all of them are noise to a person listening to the
 * page, which is worse than the empty string that at least tells the
 * screen reader to skip a decoration. We do not describe a photograph we
 * have not seen.
 */

export type AltTextResult = {
  html: string;
  /** Images that had no alt and were given one from the document. */
  filled: number;
  /** Images that had no alt and nothing to derive one from. */
  markedDecorative: number;
  /** Images that already carried one. */
  untouched: number;
};

const IMG_TAG = /<img\b[^>]*>/gi;
const FIGURE = /<figure\b[^>]*>([\s\S]*?)<\/figure\s*>/gi;

export function enforceImageAltText(html: string): AltTextResult {
  let filled = 0;
  let markedDecorative = 0;
  let untouched = 0;

  // Captions first: an <img> only knows about its <figcaption> through
  // the <figure> that contains them both, and by the time the tag is
  // being rewritten that context is gone.
  const captionFor = new Map<string, string>();
  for (const m of html.matchAll(FIGURE)) {
    const inner = m[1];
    const caption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption\s*>/i.exec(inner);
    if (!caption) continue;
    const text = decodeEntities(caption[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    for (const img of inner.match(IMG_TAG) ?? []) captionFor.set(img, text);
  }

  const out = html.replace(IMG_TAG, (tag) => {
    if (hasAttr(tag, "alt")) {
      untouched += 1;
      return tag;
    }
    const derived = deriveAlt(tag, captionFor.get(tag) ?? null);
    if (derived) filled += 1;
    else markedDecorative += 1;
    // Inserted right after "<img" so it lands before src — where a
    // person reading the file expects it, and where it cannot end up
    // inside another attribute's value.
    return tag.replace(/^<img\b/i, `<img alt="${escapeAttr(derived)}"`);
  });

  return { html: out, filled, markedDecorative, untouched };
}

function deriveAlt(tag: string, caption: string | null): string {
  const query = attr(tag, "data-image-query");
  if (query) return sentence(query);
  const label = attr(tag, "aria-label") || attr(tag, "title");
  if (label) return sentence(label);
  if (caption) return sentence(caption);
  const fromFile = filenameWords(attr(tag, "src"));
  if (fromFile) return sentence(fromFile);
  return "";
}

/** "wood-fired oven" → "Wood-fired oven". Trimmed to a length a screen
 *  reader can say in one breath. */
function sentence(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim().slice(0, 125).replace(/[\s,;:-]+$/, "");
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Words out of a filename, when there are any.
 *
 * "stone-oven.jpg" carries a description; "photo-1521302200538.jpg" (a
 * stock library id) and "IMG_4821.JPG" carry none, and turning either
 * into alt text produces a screen reader saying "photo 1521302200538".
 */
function filenameWords(src: string | null): string {
  if (!src) return "";
  const last = src.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? "";
  const base = last.replace(/\.[a-z0-9]+$/i, "");
  const words = base
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => /^[a-zA-ZÀ-ɏ]{2,}$/.test(w));
  // Two real words or it is an identifier with a stray letter in it.
  if (words.length < 2) return "";
  const generic = new Set(["img", "image", "photo", "picture", "pic", "dsc", "screenshot", "untitled"]);
  const useful = words.filter((w) => !generic.has(w.toLowerCase()));
  return useful.length >= 2 ? useful.join(" ") : "";
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
