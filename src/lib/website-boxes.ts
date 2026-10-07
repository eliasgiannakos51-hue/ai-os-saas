// BOUNDARY-FORMAT: html
import { truncate } from "@/lib/text/truncate";

/**
 * A PAGE AS BOXES (MASTER Μέρος 16, package 4): «πατάω ένα κουτί, γράφω τι
 * να αλλάξει, και αλλάζει μόνο αυτό». A box is one top-level part of the
 * page — the header, each section, the footer — the elements directly
 * under <body>, or under <main> when the page wraps its sections in one.
 *
 * ONE SCANNER FOR BOTH SIDES. The shell numbers the boxes it shows from
 * this (components/website-builder/website-shell.tsx) and the edit route
 * finds box N in the stored page with it (app/api/websites/edit/route.ts),
 * so "box 3" means the same element in both places. No DOM: the route
 * runs in Node and nothing here may differ between the two.
 *
 * THE MODEL IS NOT TRUSTED to have changed only that box. The route marks
 * the box, asks for the whole page with only it changed, takes the marked
 * element out of what came back, and puts it into the STORED page in
 * place of the old one — so every other byte of the page is the stored
 * page, whatever the model wrote. Held by scripts/tests/boxes.test.mjs.
 */

export type PageBox = {
  /** Offset of the element's "<". */
  start: number;
  /** Offset just past its closing tag. */
  end: number;
  tag: string;
  /** The text of its first h1–h3, or null. */
  heading: string | null;
};

/** The marker the route puts on the box being changed. */
export const BOX_MARK = "data-ionexa-box";

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
const NOT_A_BOX = new Set(["script", "style", "noscript", "template", "link", "meta", "base"]);

type Element = { start: number; openEnd: number; end: number; tag: string };

/** The elements directly inside [from, to), in order. Tolerant of an unclosed tag: it ends where its parent does. */
function childElements(html: string, from: number, to: number): Element[] {
  const out: Element[] = [];
  const stack: Element[] = [];
  TAG.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(html)) && match.index < to) {
    if (match[0].startsWith("<!--")) continue;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const at = match.index;
    const after = at + match[0].length;
    if (!closing) {
      const element: Element = { start: at, openEnd: after, end: after, tag };
      if (stack.length === 0) out.push(element);
      if (VOID.has(tag) || match[3].trimEnd().endsWith("/")) continue;
      if (RAW.has(tag)) {
        const closeTag = new RegExp(`</${tag}\\s*>`, "gi");
        closeTag.lastIndex = after;
        const close = closeTag.exec(html);
        const stop = close ? close.index + close[0].length : to;
        element.end = Math.min(stop, to);
        TAG.lastIndex = element.end;
        continue;
      }
      stack.push(element);
      continue;
    }
    const open = stack.map((e) => e.tag).lastIndexOf(tag);
    if (open < 0) continue;
    for (const unclosed of stack.splice(open)) unclosed.end = after;
  }
  for (const unclosed of stack) unclosed.end = to;
  return out;
}

function bodyRange(html: string): [number, number] {
  const open = /<body\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(html);
  const from = open ? open.index + open[0].length : 0;
  const close = lastMatch(html, /<\/body\s*>/gi, html.length);
  return [from, close !== null && close > from ? close : html.length];
}

function headingOf(html: string): string | null {
  const match = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/i.exec(html);
  if (!match) return null;
  const text = match[1]
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text ? truncate(text, 40) : null;
}

/** The page's boxes, in order. */
export function findPageBoxes(html: string): PageBox[] {
  const [from, to] = bodyRange(html);
  const top = childElements(html, from, to).flatMap((element) =>
    element.tag === "main" ? childElements(html, element.openEnd, closingStart(html, element)) : [element]
  );
  return top
    .filter((element) => !NOT_A_BOX.has(element.tag))
    .map((element) => ({
      start: element.start,
      end: element.end,
      tag: element.tag,
      heading: headingOf(html.slice(element.start, element.end)),
    }));
}

/** Where an element's own closing tag begins (its content ends). */
function closingStart(html: string, element: Element): number {
  const close = lastMatch(html, new RegExp(`</${element.tag}\\s*>`, "gi"), element.end);
  return close !== null && close >= element.openEnd ? close : element.end;
}

/** Where the last match of a global pattern starts, before `limit`, or null. */
function lastMatch(html: string, pattern: RegExp, limit: number): number | null {
  let last: number | null = null;
  for (const match of html.slice(0, limit).matchAll(pattern)) last = match.index ?? last;
  return last;
}

/** A box index from a request body, or null for none, or "bad" for one this page does not have. */
export function readBoxIndex(value: unknown, total: number): number | null | "bad" {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < total ? value : "bad";
}

function withAttribute(html: string, box: { start: number; tag: string }, attribute: string): string {
  const at = box.start + 1 + box.tag.length;
  return `${html.slice(0, at)} ${attribute}${html.slice(at)}`;
}

/** The page with box `index` marked for the model, or null if there is no such box. */
export function markBoxForEdit(html: string, index: number): string | null {
  const box = findPageBoxes(html)[index];
  return box ? withAttribute(html, box, `${BOX_MARK}="edit"`) : null;
}

export function scopeChangeToBox(changeRequest: string): string {
  return `Change ONLY the element marked ${BOX_MARK}="edit" and what is inside it. Keep that attribute on it. Leave every other part of the page exactly as it is, and return the whole page. The change: ${changeRequest}`;
}

const MARKED = new RegExp(`\\s${BOX_MARK}=(?:"edit"|'edit'|edit)`, "i");

/**
 * The stored page with box `index` replaced by the marked element from the
 * model's page, and nothing else changed. Null when the model's page has
 * no marked element, or the stored page has no such box.
 */
export function takeEditedBox(stored: string, edited: string, index: number): string | null {
  const box = findPageBoxes(stored)[index];
  if (!box) return null;
  const mark = MARKED.exec(edited);
  if (!mark) return null;
  const openAt = edited.lastIndexOf("<", mark.index);
  if (openAt < 0) return null;
  // The marked element's extent: the first element at the place the
  // mark's opening tag starts.
  const [element] = childElements(edited, openAt, edited.length);
  if (!element || element.start !== openAt) return null;
  const changed = edited.slice(element.start, element.end);
  const clean = changed.replace(MARKED, "");
  return `${stored.slice(0, box.start)}${clean}${stored.slice(box.end)}`;
}

/**
 * The page as the preview shows it while a box is chosen: every box
 * numbered and outlined, the chosen one in the accent. CSS only — the
 * preview stays sandbox="" with no scripts (tool-shell.mutation.mjs holds
 * that), so the boxes are pressed beside it, by number.
 */
export function outlineBoxes(html: string, selected: number | null): string {
  const boxes = findPageBoxes(html);
  let out = html;
  for (let i = boxes.length - 1; i >= 0; i--) {
    out = withAttribute(out, boxes[i], `data-ionexa-n="${i + 1}"${i === selected ? " data-ionexa-on" : ""}`);
  }
  const style =
    "<style>[data-ionexa-n]{outline:2px dashed rgba(120,120,120,.55);outline-offset:-2px}" +
    "[data-ionexa-n]::before{content:attr(data-ionexa-n);display:block;width:max-content;margin:4px;padding:1px 8px;border-radius:999px;font:600 12px/18px system-ui,sans-serif;background:#555;color:#fff}" +
    "[data-ionexa-on]{outline:3px solid #2563eb}[data-ionexa-on]::before{background:#2563eb}</style>";
  const head = /<\/head\s*>/i.exec(out);
  return head ? `${out.slice(0, head.index)}${style}${out.slice(head.index)}` : `${style}${out}`;
}
