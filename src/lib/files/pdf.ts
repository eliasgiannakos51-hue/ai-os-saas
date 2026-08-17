import { inflateSync } from "node:zlib";
import { MAX_PDF_PAGES, MAX_UNZIPPED_BYTES } from "@/lib/files/file-types";

/**
 * PDF text extraction, page by page, with no dependencies.
 *
 * PAGE BY PAGE IS THE POINT. The feature this feeds is "answer only from
 * my documents, and cite the page". An extractor that returns one blob of
 * text can produce a citation, but only a made-up one — and a fabricated
 * page number in a grounded answer is worse than no citation at all,
 * because it looks checkable. So this walks the page tree in order and
 * keeps the pages separate all the way through.
 *
 * WHY NOT pdf-parse. It wraps pdfjs-dist: a very large amount of code
 * (including a JavaScript interpreter for embedded PDF scripts) running
 * in the same process as a service-role key, on files uploaded by
 * strangers. For "get the words out" that is a bad trade. What is
 * implemented here is the subset that actually matters — Flate-compressed
 * content streams, object streams, and ToUnicode CMaps — with hard caps
 * on every loop.
 *
 * WHAT IT DOES NOT DO, and says so instead of guessing:
 *   - encrypted PDFs (refused by name, so the user knows to unlock it)
 *   - scanned pages with no text layer (reported as "no readable text",
 *     which is the truth, rather than an empty document that looks ready)
 *   - LZW / JBIG2 / DCT-encoded content streams (skipped per page)
 */

export type PdfPage = { pageNumber: number; text: string };

export type PdfExtraction = {
  pages: PdfPage[];
  /** Pages in the document, which may exceed pages.length when the
   *  document is longer than MAX_PDF_PAGES. */
  totalPages: number;
  truncated: boolean;
};

export class PdfError extends Error {}

// Every loop below is bounded. A PDF is a graph with references, and a
// crafted one can point at itself; these are what turn that into a
// refusal rather than a hang.
const MAX_OBJECTS = 60_000;
const MAX_TREE_NODES = 20_000;

type RawObject = {
  /** The dictionary/body text, latin1-decoded. */
  body: string;
  /** Raw stream bytes, when the object has a stream. */
  stream: Buffer | null;
};

type Objects = Map<number, RawObject>;

// ---------------------------------------------------------------------
// Tokenising the file into indirect objects.
// ---------------------------------------------------------------------

/**
 * Scan the whole file for `N G obj ... endobj`.
 *
 * Deliberately NOT driven by the cross-reference table. A damaged or
 * linearised xref is common in the wild, and a scan finds the objects
 * anyway; the xref would only tell us where to look for something we can
 * already see.
 *
 * The subtlety is `endobj` appearing inside binary stream data. That is
 * why the stream length is read from the dictionary and used to jump over
 * the data rather than searching through it.
 */
function scanObjects(buf: Buffer): Objects {
  const latin = buf.toString("latin1");
  const objects: Objects = new Map();
  const header = /(\d{1,10})\s+(\d{1,5})\s+obj\b/g;

  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = header.exec(latin)) !== null) {
    if (++count > MAX_OBJECTS) break;
    const number = Number(match[1]);
    const bodyStart = match.index + match[0].length;

    const streamAt = latin.indexOf("stream", bodyStart);
    const endObjAt = latin.indexOf("endobj", bodyStart);

    // No stream before the next endobj: a plain dictionary object.
    if (streamAt === -1 || (endObjAt !== -1 && endObjAt < streamAt)) {
      const end = endObjAt === -1 ? latin.length : endObjAt;
      objects.set(number, { body: latin.slice(bodyStart, end), stream: null });
      continue;
    }

    const dict = latin.slice(bodyStart, streamAt);
    // The byte after `stream` is CR?LF per the spec.
    let dataStart = streamAt + "stream".length;
    if (latin[dataStart] === "\r") dataStart++;
    if (latin[dataStart] === "\n") dataStart++;

    let length = -1;
    const direct = /\/Length\s+(\d{1,10})(?!\s+\d+\s+R)/.exec(dict);
    if (direct) length = Number(direct[1]);

    let dataEnd: number;
    if (length >= 0 && dataStart + length <= buf.length) {
      dataEnd = dataStart + length;
    } else {
      // /Length was an indirect reference (legal, and common). Fall back
      // to the literal `endstream` marker — correct except for streams
      // that happen to contain those exact bytes, which is rare enough to
      // accept and always fails as unreadable text rather than silently
      // wrong text.
      const endStream = latin.indexOf("endstream", dataStart);
      dataEnd = endStream === -1 ? buf.length : endStream;
    }

    objects.set(number, {
      body: dict,
      stream: buf.subarray(dataStart, dataEnd),
    });

    // Resume the scan after the stream so its bytes cannot be mistaken
    // for object headers.
    header.lastIndex = Math.min(latin.length, dataEnd);
  }

  return objects;
}

/** Decompress a stream according to its /Filter, or null if we cannot. */
function decodeStream(obj: RawObject): Buffer | null {
  if (!obj.stream) return null;
  const filter = /\/Filter\s*(\/[A-Za-z0-9]+|\[[^\]]*\])/.exec(obj.body)?.[1] ?? "";

  if (!filter) return obj.stream;
  if (!filter.includes("FlateDecode")) {
    // ASCIIHex/ASCII85/LZW/DCT/JBIG2. Not text we can use; skipping is
    // honest, guessing is not.
    return null;
  }
  try {
    return inflateSync(obj.stream, { maxOutputLength: MAX_UNZIPPED_BYTES });
  } catch {
    return null;
  }
}

/**
 * Expand /Type /ObjStm containers.
 *
 * Every PDF produced in the last fifteen years puts most of its
 * dictionaries — including the page tree — inside compressed object
 * streams. An extractor that does not open these finds no pages at all on
 * a perfectly ordinary file, which is exactly the "works on my sample,
 * fails on the user's" failure this avoids.
 */
function expandObjectStreams(objects: Objects): void {
  const containers = [...objects.entries()].filter(([, o]) => /\/Type\s*\/ObjStm/.test(o.body));

  for (const [, container] of containers) {
    const decoded = decodeStream(container);
    if (!decoded) continue;

    const n = Number(/\/N\s+(\d+)/.exec(container.body)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(container.body)?.[1] ?? -1);
    if (!n || first < 0 || first > decoded.length) continue;

    const text = decoded.toString("latin1");
    const headerPart = text.slice(0, first);
    const numbers = headerPart.trim().split(/\s+/).map(Number);

    const offsets: { number: number; offset: number }[] = [];
    for (let i = 0; i < n && i * 2 + 1 < numbers.length; i++) {
      offsets.push({ number: numbers[i * 2], offset: numbers[i * 2 + 1] });
    }

    for (let i = 0; i < offsets.length; i++) {
      const start = first + offsets[i].offset;
      const end = i + 1 < offsets.length ? first + offsets[i + 1].offset : text.length;
      if (!Number.isFinite(start) || start < 0 || start >= text.length) continue;
      // An object already found by the direct scan wins: it is the
      // uncompressed, authoritative copy.
      if (objects.has(offsets[i].number)) continue;
      objects.set(offsets[i].number, { body: text.slice(start, end), stream: null });
    }
  }
}

// ---------------------------------------------------------------------
// Walking the page tree.
// ---------------------------------------------------------------------

function refsIn(value: string): number[] {
  return [...value.matchAll(/(\d{1,10})\s+\d{1,5}\s+R\b/g)].map((m) => Number(m[1]));
}

/**
 * The pages, in document order.
 *
 * Order is not cosmetic here — it IS the page number in every citation
 * the AI produces. So the tree is walked properly (Kids in order, depth
 * first) rather than taking objects in numeric order, which matches
 * document order only by coincidence.
 */
function orderedPages(objects: Objects): number[] {
  const catalog = [...objects.entries()].find(([, o]) => /\/Type\s*\/Catalog/.test(o.body));
  const rootRef = catalog ? refsIn(/\/Pages\s+([^\/>]*)/.exec(catalog[1].body)?.[1] ?? "")[0] : undefined;

  const pages: number[] = [];
  const seen = new Set<number>();

  const visit = (ref: number, depth: number): void => {
    if (pages.length >= MAX_TREE_NODES || depth > 64) return;
    if (seen.has(ref)) return; // a cycle, crafted or corrupt
    seen.add(ref);

    const node = objects.get(ref);
    if (!node) return;

    if (/\/Type\s*\/Page\b/.test(node.body) && !/\/Type\s*\/Pages\b/.test(node.body)) {
      pages.push(ref);
      return;
    }
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(node.body)?.[1];
    if (!kids) return;
    for (const kid of refsIn(kids)) visit(kid, depth + 1);
  };

  if (rootRef !== undefined) visit(rootRef, 0);

  if (pages.length === 0) {
    // No catalog, or a broken tree. Numeric order is a guess, and it is
    // labelled as one by being the fallback rather than the default.
    for (const [number, obj] of [...objects.entries()].sort((a, b) => a[0] - b[0])) {
      if (/\/Type\s*\/Page\b/.test(obj.body) && !/\/Type\s*\/Pages\b/.test(obj.body)) {
        pages.push(number);
      }
    }
  }
  return pages;
}

// ---------------------------------------------------------------------
// ToUnicode CMaps — turning font codes back into characters.
// ---------------------------------------------------------------------

type FontMap = {
  /** code -> string. Empty when the font has no ToUnicode. */
  map: Map<number, string>;
  /** Bytes per code. 2 for Identity-H and most embedded subsets. */
  codeBytes: number;
};

function parseHexString(hex: string): string {
  let out = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const unit = parseInt(hex.slice(i, i + 4), 16);
    if (Number.isFinite(unit)) out += String.fromCharCode(unit);
  }
  return out;
}

/**
 * Parse the bfchar/bfrange sections of a ToUnicode CMap.
 *
 * Without this, a PDF written by Word or LaTeX — which subset their fonts
 * and number the glyphs 1, 2, 3… — extracts as mojibake. With it, the
 * same file extracts as its actual words. It is the difference between
 * the feature working on real documents and only on ones typed into a
 * text editor.
 */
function parseToUnicode(cmap: string): FontMap {
  const map = new Map<number, string>();

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(pair[1], 16), parseHexString(pair[2]));
    }
  }

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    // <lo> <hi> <dstStart>
    for (const m of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const dst = parseInt(m[3], 16);
      // Bounded: a crafted range of 0..0xFFFFFFFF would otherwise be an
      // allocation attack dressed as a font.
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi - lo > 65_535) continue;
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(dst + (c - lo)));
    }
    // <lo> <hi> [ <d1> <d2> ... ]
    for (const m of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(m[1], 16);
      const items = [...m[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => parseHexString(x[1]));
      for (let i = 0; i < items.length && i <= 65_535; i++) map.set(lo + i, items[i]);
    }
  }

  const codespace = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(cmap)?.[1];
  const codeBytes = codespace && codespace.length >= 4 ? Math.min(2, codespace.length / 2) : 1;

  return { map, codeBytes: map.size > 0 ? Math.max(codeBytes, inferCodeBytes(map)) : codeBytes };
}

function inferCodeBytes(map: Map<number, string>): number {
  for (const code of map.keys()) if (code > 0xff) return 2;
  return 1;
}

/**
 * The dictionary that starts at `<<`, INCLUDING its nested dictionaries.
 *
 * THIS IS WHY NO REAL PDF EXTRACTED. It was
 * `/\/Resources\s*(<<[\s\S]*?>>)/` — a non-greedy match, which stops at the
 * FIRST `>>`. A PDF's Resources dictionary contains nested dictionaries:
 *
 *   /Resources <</ProcSet [/PDF /Text]
 *   /ExtGState <</G3 3 0 R>>          <- the non-greedy match ended HERE
 *   /Font <</F4 4 0 R /F5 5 0 R>>>>
 *
 * so `/Font` fell outside the captured text, no font was found, no
 * ToUnicode CMap was loaded, and every glyph of a subset font came out as
 * its raw glyph id. "Trading Strategy" extracted as
 * "\u00007\u0000U\u0000D\u0000G\u0000L\u0000Q\u0000J" — which
 * readableRatio then scored at 0.43 and the caller reported as "no
 * readable text was found in this PDF — it is probably a scan".
 *
 * It was not a scan. It was every PDF written by a browser, Word, Google
 * Docs, LaTeX or InDesign, because all of them emit at least one nested
 * dictionary before /Font.
 *
 * A regular expression cannot match balanced delimiters. This counts them.
 */
function dictAt(text: string, start: number): string | null {
  if (text[start] !== "<" || text[start + 1] !== "<") return null;
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    // A `>>` inside a literal string is not a delimiter. Strings are
    // skipped whole rather than counted, or a name like (a >> b) would
    // close the dictionary early — the same class of bug one level down.
    if (text[i] === "(") {
      let esc = false;
      for (i++; i < text.length; i++) {
        if (esc) { esc = false; continue; }
        if (text[i] === "\\") esc = true;
        else if (text[i] === ")") break;
      }
      continue;
    }
    if (text[i] === "<" && text[i + 1] === "<") { depth++; i++; continue; }
    if (text[i] === ">" && text[i + 1] === ">") {
      depth--;
      i++;
      if (depth === 0) return text.slice(start, i + 1);
      continue;
    }
  }
  return null;
}

/** `/Key << ... >>` with the nesting respected, or null. */
function dictValue(text: string, key: string): string | null {
  const at = new RegExp(`\\/${key}\\s*(?=<<)`).exec(text);
  if (!at) return null;
  return dictAt(text, at.index + at[0].length);
}

/** The fonts a page's content stream can select, keyed by resource name. */
function fontsForPage(objects: Objects, pageBody: string): Map<string, FontMap> {
  const fonts = new Map<string, FontMap>();

  // /Resources may be inline or a reference.
  let resources = dictValue(pageBody, "Resources") ?? undefined;
  if (!resources) {
    const ref = refsIn(/\/Resources\s+([^\/>]*)/.exec(pageBody)?.[1] ?? "")[0];
    if (ref !== undefined) resources = objects.get(ref)?.body ?? "";
  }
  if (!resources) return fonts;

  let fontDict = dictValue(resources, "Font") ?? undefined;
  if (!fontDict) {
    const ref = refsIn(/\/Font\s+([^\/>]*)/.exec(resources)?.[1] ?? "")[0];
    if (ref !== undefined) fontDict = objects.get(ref)?.body ?? "";
  }
  if (!fontDict) return fonts;

  for (const m of fontDict.matchAll(/\/([A-Za-z0-9#._-]+)\s+(\d{1,10})\s+\d{1,5}\s+R/g)) {
    const font = objects.get(Number(m[2]));
    if (!font) continue;

    const identity = /\/Encoding\s*\/Identity-[HV]/.test(font.body);
    const toUnicodeRef = refsIn(/\/ToUnicode\s+([^\/>]*)/.exec(font.body)?.[1] ?? "")[0];

    if (toUnicodeRef === undefined) {
      fonts.set(m[1], { map: new Map(), codeBytes: identity ? 2 : 1 });
      continue;
    }
    const stream = objects.get(toUnicodeRef);
    const decoded = stream ? decodeStream(stream) : null;
    if (!decoded) {
      fonts.set(m[1], { map: new Map(), codeBytes: identity ? 2 : 1 });
      continue;
    }
    const parsed = parseToUnicode(decoded.toString("latin1"));
    fonts.set(m[1], { map: parsed.map, codeBytes: identity ? 2 : parsed.codeBytes });
  }

  return fonts;
}

// ---------------------------------------------------------------------
// Reading text out of a content stream.
// ---------------------------------------------------------------------

/** Undo PDF literal-string escaping: \n \r \t \b \f \( \) \\ and \ddd. */
function decodeLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "\n") continue; // line continuation
    else if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && raw[i + 1] >= "0" && raw[i + 1] <= "7") octal += raw[++i];
      out += String.fromCharCode(parseInt(octal, 8));
    } else out += next;
  }
  return out;
}

function applyFont(raw: string, font: FontMap | undefined): string {
  if (!font || (font.map.size === 0 && font.codeBytes === 1)) return raw;

  let out = "";
  if (font.codeBytes === 2) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const code = (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1);
      out += font.map.get(code) ?? "";
    }
    return out;
  }
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    out += font.map.get(code) ?? raw[i];
  }
  return out;
}

/**
 * Walk a content stream, collecting only what the text operators show.
 *
 * A content stream is a program. This does not run it — it reads the four
 * operators that put glyphs on the page (Tj, TJ, ' and ") and ignores
 * everything else, which is why an embedded JavaScript action or a
 * malformed drawing operator cannot do anything here except be skipped.
 */
function textFromContent(content: string, fonts: Map<string, FontMap>): string {
  let out = "";
  let current: FontMap | undefined;
  let i = 0;
  const n = content.length;

  const readLiteral = (start: number): { text: string; next: number } => {
    let depth = 1;
    let raw = "";
    let j = start;
    while (j < n && depth > 0) {
      const c = content[j];
      if (c === "\\") {
        raw += c + (content[j + 1] ?? "");
        j += 2;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
      raw += c;
      j++;
    }
    return { text: decodeLiteral(raw), next: j };
  };

  while (i < n) {
    const c = content[i];

    if (c === "/") {
      // A font selection: `/F3 11 Tf`
      const m = /^\/([A-Za-z0-9#._-]+)\s+[\d.+-]+\s+Tf/.exec(content.slice(i, i + 64));
      if (m) {
        current = fonts.get(m[1]);
        i += m[0].length;
        continue;
      }
      i++;
      continue;
    }

    if (c === "(") {
      const { text, next } = readLiteral(i + 1);
      out += applyFont(text, current);
      i = next;
      // `'` and `"` start a new line before showing their string.
      const after = content.slice(i, i + 4);
      if (/^\s*['"]/.test(after)) out += "\n";
      continue;
    }

    if (c === "<" && content[i + 1] !== "<") {
      const close = content.indexOf(">", i);
      if (close === -1) break;
      const hex = content.slice(i + 1, close).replace(/[^0-9A-Fa-f]/g, "");
      let raw = "";
      const step = current?.codeBytes === 2 ? 4 : 2;
      for (let k = 0; k + step <= hex.length; k += step) {
        const value = parseInt(hex.slice(k, k + step), 16);
        if (step === 4) raw += String.fromCharCode(value >> 8, value & 0xff);
        else raw += String.fromCharCode(value);
      }
      out += applyFont(raw, current);
      i = close + 1;
      continue;
    }

    // End of a text object, or an explicit NEW LINE.
    //
    // `T*` always starts a line, and `ET` ends the text object. `Td`/`TD`
    // are the subtle ones: they move the text position by (tx, ty), and a
    // move with ty = 0 is HORIZONTAL — kerning, a tab stop, the gap before
    // a bold run — not a new line.
    //
    // Treating every Td as a break is why a browser-printed PDF extracted
    // "Trading Strategy" as "T\nrading Strategy": Chromium emits the first
    // glyph, a `Td` to nudge the pen, then the rest of the word. A reader
    // sees one word; a search for "Trading" found nothing.
    if (c === "E" && content.startsWith("ET", i)) {
      if (!out.endsWith("\n")) out += "\n";
      i += 2;
      continue;
    }
    if (c === "T" && content.startsWith("T*", i)) {
      if (!out.endsWith("\n")) out += "\n";
      i += 2;
      continue;
    }
    if (c === "T" && (content.startsWith("Td", i) || content.startsWith("TD", i))) {
      // The two operands sit immediately before the operator.
      const operands = /(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(content.slice(Math.max(0, i - 64), i));
      const ty = operands ? Number(operands[2]) : NaN;
      // Unreadable operands fall back to "it is a line break", which is
      // the behaviour that shipped and is the safe direction: a spurious
      // break is ugly, a missing one runs two lines together.
      if (!Number.isFinite(ty) || ty !== 0) {
        if (!out.endsWith("\n")) out += "\n";
      }
      i += 2;
      continue;
    }

    i++;
  }

  return out;
}

/**
 * How much of this looks like language?
 *
 * A scanned page with no text layer, or a font we could not map, both
 * produce output — just not output made of words. This ratio is what
 * lets the caller say "this PDF has no readable text" instead of storing
 * a page of control characters and calling the file ready.
 */
export function readableRatio(text: string): number {
  if (!text) return 0;
  let readable = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126) || code >= 0x00a0) {
      readable++;
    }
  }
  return readable / text.length;
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPdfText(buf: Buffer): PdfExtraction {
  const head = buf.subarray(0, 1024).toString("latin1");
  if (!head.startsWith("%PDF-")) throw new PdfError("this file is not a PDF");

  const objects = scanObjects(buf);
  expandObjectStreams(objects);

  // Encryption is refused by name. An encrypted PDF would otherwise
  // extract as noise and be reported as "no readable text", which sends
  // the user looking for the wrong problem.
  const latin = buf.toString("latin1");
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(latin) || [...objects.values()].some((o) => /\/Type\s*\/Encrypt/.test(o.body))) {
    throw new PdfError("this PDF is password-protected — remove the password and upload it again");
  }

  const pageRefs = orderedPages(objects);
  if (pageRefs.length === 0) throw new PdfError("this PDF has no readable pages");

  const totalPages = pageRefs.length;
  const take = pageRefs.slice(0, MAX_PDF_PAGES);
  const pages: PdfPage[] = [];

  for (let index = 0; index < take.length; index++) {
    const page = objects.get(take[index]);
    if (!page) continue;

    const fonts = fontsForPage(objects, page.body);
    const contentRefs = refsIn(/\/Contents\s*(\[[^\]]*\]|[^\/>\]]*)/.exec(page.body)?.[1] ?? "");

    let text = "";
    for (const ref of contentRefs) {
      const stream = objects.get(ref);
      if (!stream) continue;
      const decoded = decodeStream(stream);
      if (!decoded) continue;
      text += textFromContent(decoded.toString("latin1"), fonts);
    }

    pages.push({ pageNumber: index + 1, text: tidy(text) });
  }

  return { pages, totalPages, truncated: totalPages > take.length };
}
