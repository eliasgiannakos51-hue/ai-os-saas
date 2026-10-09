// BOUNDARY-FORMAT: html
import { escapeHtml } from "@/lib/html-escape";
import { decodeEntities } from "@/lib/pdf/blocks";

/**
 * TRANSLATING A PAGE WITHOUT TOUCHING ITS FORM (MASTER 16, package 28) —
 * the pure half. scripts/tests/translate.test.mjs executes all of it; the
 * model call is lib/translate/translate-call.ts and the money is
 * app/api/translate/route.ts.
 *
 * THE MODEL NEVER SEES THE HTML. The page is cut into the pieces a person
 * reads — a paragraph, a heading, a button's words, an image's alt text —
 * and only those go out, as a list. What comes back is put into the same
 * places. Every tag, attribute, class, colour and link is copied from the
 * original byte for byte, so the form cannot change: not because the model
 * was asked to keep it (lib/documents/translation.ts asks, and a model can
 * ignore a request), but because the model is never given it.
 *
 * WORDS INSIDE A SENTENCE MAY MOVE. "Καλώς ήρθατε στο <strong>Camping
 * Ήλιος</strong>" goes out as "Καλώς ήρθατε στο <1>Camping Ήλιος</1>": the
 * bold part is a numbered mark, so the translation can put it where the
 * other language puts it. The mark is replaced by the ORIGINAL tag. A piece
 * whose marks do not come back exactly — one missing, one twice, one
 * closed before it opened — stays as it was, and is counted
 * (`kept` below), rather than guessed at.
 *
 * Regex-level reading, not a full parser, the same posture as
 * lib/seo/html-text.ts: what this cannot read is copied, never dropped.
 */

/** Tags that live inside a sentence: they travel with it as marks. */
const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "del", "dfn", "em", "i", "ins",
  "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "wbr", "font",
]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
/** Whose contents are not prose, or not ours to change: copied as they are. */
const SKIP = new Set(["script", "style", "code", "pre", "kbd", "samp", "svg", "math", "textarea", "template", "noscript"]);
/** Read as raw text up to their own closing tag (a `<` inside is not a tag). */
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
/** The attributes a person reads. */
const READ_ATTRS = new Set(["alt", "title", "placeholder", "aria-label"]);
const READ_META = new Set(["description", "og:title", "og:description", "twitter:title", "twitter:description"]);

/** One translatable piece, as sent: text with numbered marks. */
export type Piece = { text: string; kind: "run" | "attr" | "plain" };

type Attr = { name: string; value: string; start: number; end: number };
type Token =
  | { t: "raw"; raw: string }
  | { t: "text"; raw: string }
  | { t: "start"; raw: string; name: string; attrs: Attr[]; selfClosing: boolean }
  | { t: "end"; raw: string; name: string };

type Part =
  | { p: "raw"; raw: string }
  | { p: "run"; seg: number; lead: string; trail: string; raw: string; marks: string[]; closers: Record<number, string> }
  | { p: "tag"; raw: string; attrs: { attr: Attr; seg: number }[] }
  | { p: "plain"; seg: number; raw: string; lead: string; trail: string };

export type Plan = { parts: Part[]; lang: string | null };

const HAS_LETTER = /\p{L}/u;
const MARK = /<(\/?)(\d{1,3})(\/?)>/g;

/** The tokens of an HTML string, every character in exactly one token. */
export function tokenize(html: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", raw: text });
    text = "";
  };
  while (i < html.length) {
    const c = html[i];
    if (c !== "<") {
      text += c;
      i++;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      flush();
      const close = html.indexOf("-->", i + 4);
      const end = close === -1 ? html.length : close + 3;
      out.push({ t: "raw", raw: html.slice(i, end) });
      i = end;
      continue;
    }
    const next = html[i + 1] ?? "";
    if (next === "!" || next === "?") {
      flush();
      const close = html.indexOf(">", i);
      const end = close === -1 ? html.length : close + 1;
      out.push({ t: "raw", raw: html.slice(i, end) });
      i = end;
      continue;
    }
    if (next === "/" && /[a-zA-Z]/.test(html[i + 2] ?? "")) {
      flush();
      const close = html.indexOf(">", i);
      const end = close === -1 ? html.length : close + 1;
      const raw = html.slice(i, end);
      out.push({ t: "end", raw, name: (/^<\/([a-zA-Z][\w:-]*)/.exec(raw)?.[1] ?? "").toLowerCase() });
      i = end;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      text += c;
      i++;
      continue;
    }
    flush();
    const tag = readStartTag(html, i);
    out.push(tag.token);
    i = tag.end;
    if (RAW_TEXT.has(tag.token.name) && !tag.token.selfClosing) {
      const re = new RegExp(`</${tag.token.name}\\s*>`, "i");
      const rest = html.slice(i);
      const m = re.exec(rest);
      const bodyEnd = m ? i + m.index : html.length;
      const body = html.slice(i, bodyEnd);
      if (body) out.push(tag.token.name === "title" ? { t: "text", raw: body } : { t: "raw", raw: body });
      i = bodyEnd;
      if (m) {
        out.push({ t: "end", raw: m[0], name: tag.token.name });
        i += m[0].length;
      }
    }
  }
  flush();
  return out;
}

function readStartTag(html: string, from: number): { token: Extract<Token, { t: "start" }>; end: number } {
  let i = from + 1;
  const nameMatch = /^[a-zA-Z][\w:-]*/.exec(html.slice(i, i + 64));
  const name = (nameMatch?.[0] ?? "").toLowerCase();
  i += nameMatch?.[0].length ?? 0;
  const attrs: Attr[] = [];
  let selfClosing = false;
  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] === ">") {
      i++;
      break;
    }
    if (html[i] === "/" && html[i + 1] === ">") {
      selfClosing = true;
      i += 2;
      break;
    }
    if (html[i] === "/") {
      i++;
      continue;
    }
    const start = i - from;
    while (i < html.length && !/[\s=>]/.test(html[i]) && !(html[i] === "/" && html[i + 1] === ">")) i++;
    const attrName = html.slice(from + start, i).toLowerCase();
    let j = i;
    while (j < html.length && /\s/.test(html[j])) j++;
    let value = "";
    if (html[j] === "=") {
      j++;
      while (j < html.length && /\s/.test(html[j])) j++;
      const q = html[j];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, j + 1);
        const stop = close === -1 ? html.length : close;
        value = html.slice(j + 1, stop);
        i = Math.min(html.length, stop + 1);
      } else {
        const s = j;
        while (j < html.length && !/[\s>]/.test(html[j])) j++;
        value = html.slice(s, j);
        i = j;
      }
    }
    if (attrName) attrs.push({ name: attrName, value, start, end: i - from });
    if (i === from + start) i++; // never stand still on a character nothing reads
  }
  const raw = html.slice(from, i);
  return { token: { t: "start", raw, name, attrs, selfClosing: selfClosing || VOID.has(name) }, end: i };
}

const attrOf = (tok: { attrs: Attr[] }, name: string) => tok.attrs.find((a) => a.name === name);

/** Whether a start tag opens something not to be translated. */
function opensSkip(tok: Extract<Token, { t: "start" }>): boolean {
  if (SKIP.has(tok.name)) return true;
  if (attrOf(tok, "translate")?.value.toLowerCase() === "no") return true;
  return /(^|\s)notranslate(\s|$)/.test(attrOf(tok, "class")?.value ?? "");
}

/**
 * The page cut into pieces. `pieces` is what is sent; `plan` is how to put
 * it back. Piece numbers continue from `offset`, so several pages and the
 * names beside them can travel in one list.
 */
export function planHtml(html: string, offset = 0): { plan: Plan; pieces: Piece[] } {
  const tokens = tokenize(html);
  const parts: Part[] = [];
  const pieces: Piece[] = [];
  let lang: string | null = null;
  let skipName: string | null = null;
  let skipDepth = 0;
  let run: Token[] = [];
  let inTitle = false;

  const flushRun = () => {
    if (run.length === 0) return;
    const raw = run.map((x) => x.raw).join("");
    const hasWords = run.some((x) => x.t === "text" && HAS_LETTER.test(decodeEntities(x.raw)));
    if (!hasWords) {
      parts.push({ p: "raw", raw });
      run = [];
      return;
    }
    // Whitespace at the edges stays where it was, outside the piece.
    let first = 0;
    let last = run.length - 1;
    while (first <= last && run[first].t === "text" && !run[first].raw.trim()) first++;
    while (last >= first && run[last].t === "text" && !run[last].raw.trim()) last--;
    const lead = run.slice(0, first).map((x) => x.raw).join("");
    const trail = run.slice(last + 1).map((x) => x.raw).join("");
    const inner = run.slice(first, last + 1);
    // Mark n is marks[n - 1]: an opening tag, or a tag that stands alone.
    // A pair's closing tag is closers[n], and is written `</n>`.
    const marks: string[] = [];
    const closers: Record<number, string> = {};
    const open: number[] = [];
    const openName: string[] = [];
    let text = "";
    let leadWs = "";
    let trailWs = "";
    inner.forEach((x, k) => {
      if (x.t === "text") {
        let s = x.raw;
        if (k === 0) {
          leadWs = /^\s*/.exec(s)?.[0] ?? "";
          s = s.slice(leadWs.length);
        }
        if (k === inner.length - 1) {
          trailWs = /\s*$/.exec(s)?.[0] ?? "";
          s = s.slice(0, s.length - trailWs.length);
        }
        text += decodeEntities(s);
      } else if (x.t === "start") {
        marks.push(x.raw);
        const n = marks.length;
        if (x.selfClosing) text += `<${n}/>`;
        else {
          text += `<${n}>`;
          open.push(n);
          openName.push(x.name);
        }
      } else if (x.t === "end") {
        if (openName.length > 0 && openName[openName.length - 1] === x.name) {
          const n = open.pop()!;
          openName.pop();
          closers[n] = x.raw;
          text += `</${n}>`;
        } else {
          marks.push(x.raw);
          text += `<${marks.length}/>`;
        }
      }
    });
    // A tag opened in the piece and never closed in it travels as a single mark.
    for (const n of open) text = text.replace(`<${n}>`, `<${n}/>`);
    const seg = offset + pieces.length;
    pieces.push({ text, kind: "run" });
    parts.push({ p: "run", seg, lead: lead + leadWs, trail: trailWs + trail, raw: run.slice(first, last + 1).map((x) => x.raw).join(""), marks, closers });
    run = [];
  };

  for (const tok of tokens) {
    if (skipName !== null) {
      if (tok.t === "start" && tok.name === skipName && !tok.selfClosing) skipDepth++;
      if (tok.t === "end" && tok.name === skipName) skipDepth--;
      parts.push({ p: "raw", raw: tok.raw });
      if (skipDepth === 0) skipName = null;
      continue;
    }
    if (tok.t === "start" && opensSkip(tok)) {
      flushRun();
      parts.push({ p: "raw", raw: tok.raw });
      if (!tok.selfClosing) {
        skipName = tok.name;
        skipDepth = 1;
      }
      continue;
    }
    if (tok.t === "start" && tok.name === "title") {
      flushRun();
      inTitle = true;
      parts.push({ p: "raw", raw: tok.raw });
      continue;
    }
    if (inTitle && tok.t === "text") {
      const decoded = decodeEntities(tok.raw);
      if (HAS_LETTER.test(decoded)) {
        const lead = /^\s*/.exec(tok.raw)?.[0] ?? "";
        const trail = /\s*$/.exec(tok.raw.slice(lead.length))?.[0] ?? "";
        const seg = offset + pieces.length;
        pieces.push({ text: decoded.trim(), kind: "plain" });
        parts.push({ p: "plain", seg, raw: tok.raw, lead, trail });
      } else parts.push({ p: "raw", raw: tok.raw });
      continue;
    }
    if (tok.t === "end" && tok.name === "title") inTitle = false;
    if (tok.t === "text" || ((tok.t === "start" || tok.t === "end") && INLINE.has(tok.name))) {
      run.push(tok);
      continue;
    }
    flushRun();
    if (tok.t === "start") {
      if (tok.name === "html") lang = attrOf(tok, "lang")?.value ?? null;
      const readable = tok.attrs.filter((a) => {
        if (!a.value.trim() || !HAS_LETTER.test(a.value)) return false;
        if (READ_ATTRS.has(a.name)) return true;
        if (tok.name === "meta" && a.name === "content") {
          const key = (attrOf(tok, "name")?.value ?? attrOf(tok, "property")?.value ?? "").toLowerCase();
          return READ_META.has(key);
        }
        if (tok.name === "input" && a.name === "value") {
          return ["submit", "button", "reset"].includes((attrOf(tok, "type")?.value ?? "").toLowerCase());
        }
        return false;
      });
      if (readable.length > 0) {
        parts.push({
          p: "tag",
          raw: tok.raw,
          attrs: readable.map((attr) => {
            const seg = offset + pieces.length;
            pieces.push({ text: decodeEntities(attr.value).trim(), kind: "attr" });
            return { attr, seg };
          }),
        });
        continue;
      }
    }
    parts.push({ p: "raw", raw: tok.raw });
  }
  flushRun();
  return { plan: { parts, lang }, pieces };
}

/** Text as HTML text: the three characters that would start markup. */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A translated run back into HTML, or null when its marks did not come
 * back exactly: every mark once and in its own shape, each pair opened
 * before it closes, and closed in the order it opened.
 */
export function rebuildRun(translated: string, marks: readonly string[], closers: Readonly<Record<number, string>>, source: string): string | null {
  const sent = [...source.matchAll(MARK)].map((m) => m[0]).sort();
  const back = [...translated.matchAll(MARK)].map((m) => m[0]).sort();
  if (sent.length !== back.length || sent.some((w, k) => w !== back[k])) return null;
  const stack: number[] = [];
  let out = "";
  let last = 0;
  for (const m of translated.matchAll(MARK)) {
    out += escapeText(translated.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const n = Number(m[2]);
    if (m[1] === "/") {
      if (stack.pop() !== n || closers[n] === undefined) return null;
      out += closers[n];
    } else {
      if (marks[n - 1] === undefined) return null;
      if (m[3] !== "/") stack.push(n);
      out += marks[n - 1];
    }
  }
  if (stack.length > 0) return null;
  return out + escapeText(translated.slice(last));
}

export type Rebuilt = { html: string; kept: number };

/**
 * The page with each piece replaced by its translation. A translation that
 * is missing, empty, or whose marks do not match leaves the original piece
 * in place and is counted in `kept`. `lang`, when given, becomes the
 * page's own `<html lang>`.
 */
export function rebuildHtml(plan: Plan, translations: readonly (string | null | undefined)[], pieces: readonly Piece[], offset = 0, lang?: string): Rebuilt {
  let kept = 0;
  const out: string[] = [];
  // An answer that is the piece itself changes nothing, so the original
  // bytes stay — an entity is not rewritten as the character it stands for.
  const at = (seg: number) => {
    const v = translations[seg - offset];
    return typeof v === "string" && v.trim() ? v : null;
  };
  const same = (seg: number, v: string) => v.trim() === pieces[seg - offset]?.text;
  for (const part of plan.parts) {
    if (part.p === "raw") {
      out.push(lang && /^<html\b/i.test(part.raw) ? withLang(part.raw, lang) : part.raw);
    } else if (part.p === "plain") {
      const v = at(part.seg);
      if (v === null) {
        kept++;
        out.push(part.raw);
      } else out.push(same(part.seg, v) ? part.raw : part.lead + escapeText(v.trim()) + part.trail);
    } else if (part.p === "run") {
      const v = at(part.seg);
      const html = v === null ? null : same(part.seg, v) ? part.raw : rebuildRun(v.trim(), part.marks, part.closers, pieces[part.seg - offset].text);
      if (html === null) {
        kept++;
        out.push(part.lead + part.raw + part.trail);
      } else out.push(part.lead + html + part.trail);
    } else {
      let raw = part.raw;
      // Right to left, so earlier offsets stay valid.
      for (const { attr, seg } of [...part.attrs].sort((a, b) => b.attr.start - a.attr.start)) {
        const v = at(seg);
        if (v === null) {
          kept++;
          continue;
        }
        if (same(seg, v)) continue;
        raw = raw.slice(0, attr.start) + `${attr.name}="${escapeHtml(v.trim())}"` + raw.slice(attr.end);
      }
      out.push(lang && /^<html\b/i.test(raw) ? withLang(raw, lang) : raw);
    }
  }
  return { html: out.join(""), kept };
}

function withLang(tag: string, lang: string): string {
  const safe = lang.replace(/[^a-zA-Z-]/g, "");
  if (/\slang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(tag)) return tag.replace(/(\slang\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${safe}"`);
  return tag.replace(/^<html\b/i, `<html lang="${safe}"`);
}

/**
 * THE FORM, AS A STRING: every tag in order, with every attribute except
 * the ones a person reads (and `lang`), and every mark's position. Two
 * pages with the same skeleton look the same apart from their words — this
 * is what the gate and the browser test compare between a page and its
 * translation.
 */
export function skeletonOf(html: string): string {
  const rows: string[] = [];
  for (const tok of tokenize(html)) {
    if (tok.t === "start") {
      const kept = tok.attrs
        .filter((a) => !READ_ATTRS.has(a.name) && a.name !== "lang" && !(tok.name === "meta" && a.name === "content") && !(tok.name === "input" && a.name === "value"))
        .map((a) => `${a.name}=${a.value}`);
      rows.push(`<${tok.name}${kept.length ? " " + kept.join(" ") : ""}>`);
    } else if (tok.t === "end") rows.push(`</${tok.name}>`);
  }
  return rows.join("");
}

/** Groups of pieces for one call each: a ceiling on characters and on count. */
export function batchPieces(pieces: readonly Piece[], maxChars: number, maxCount: number): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let size = 0;
  pieces.forEach((piece, index) => {
    const len = piece.text.length;
    if (current.length > 0 && (size + len > maxChars || current.length >= maxCount)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(index);
    size += len;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * The model's list, checked: exactly as many strings as were sent. Anything
 * else is no answer at all, because a list one short has every piece after
 * the gap in the wrong place.
 */
export function readTranslations(value: unknown, expected: number): string[] | null {
  const list = (value as { translations?: unknown } | null)?.translations;
  if (!Array.isArray(list) || list.length !== expected) return null;
  return list.map((v) => (typeof v === "string" ? v : ""));
}
