/**
 * THE ONE SHAPE EVERY PDF IN THIS APP IS BUILT FROM.
 *
 * Three modules produce downloadable documents and they store their content
 * three different ways:
 *
 *   Documents        user_documents.content = { html }  — contenteditable output
 *   Research reports research_reports.sections = [{ heading, body }] + sources
 *   Mission plans    ai_missions.goal + plan_steps
 *
 * Rendering each of those straight to PDF would mean three layout
 * implementations, three sets of typography decisions, and three places for
 * the font stack to be forgotten. So each one is converted to the same list
 * of blocks first, and exactly one renderer turns blocks into a PDF.
 *
 * The block model is deliberately small. It is not a document format; it is
 * the subset that the Documents editor can actually produce (bold, italic,
 * two heading levels, bullets) plus the ordered lists the research and
 * mission builders need. Anything richer would be a layout feature nothing
 * in this app can create.
 *
 * Pure and dependency-free, so it is unit-testable without a database, a
 * browser, or the PDF engine.
 */

export type PdfRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** http(s) only; anything else is dropped and the run stays plain text. */
  href?: string;
};

export type PdfBlock =
  | { kind: "heading"; level: 1 | 2 | 3; runs: PdfRun[] }
  | { kind: "paragraph"; runs: PdfRun[] }
  | { kind: "listItem"; marker: string; runs: PdfRun[] }
  | { kind: "rule" };

/** Named entities the editor and the report builder actually emit. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#160": " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (Object.prototype.hasOwnProperty.call(ENTITIES, name)) return ENTITIES[name];
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    if (name.startsWith("#")) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

/** http/https only — the same rule report-to-html.ts applies on the way in. */
function safeHref(url: string): string | undefined {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed.slice(0, 500) : undefined;
}

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "br", "hr", "blockquote"]);

type OpenTag = { name: string; attrs: string };

function parseTag(raw: string): { name: string; attrs: string; closing: boolean } | null {
  const m = raw.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/);
  if (!m) return null;
  return { closing: m[1] === "/", name: m[2].toLowerCase(), attrs: m[3] ?? "" };
}

/**
 * Editor HTML to blocks.
 *
 * TOLERANT BY DESIGN. This reads `document.execCommand` output, which is
 * whatever the browser felt like emitting: unclosed <br>, <div> used as a
 * paragraph, <b> inside <strong>, attributes in any order. It is not a
 * validator — an unrecognised tag contributes its text and nothing else,
 * because losing a paragraph is worse than losing its styling.
 *
 * NOTHING FROM THE INPUT BECOMES MARKUP AGAIN. Blocks carry text and flags,
 * never HTML, so a document whose content is `<script>` produces a paragraph
 * that says "<script>" rather than anything that runs. That matters more
 * here than it looks: research reports are assembled from web search
 * results, i.e. from text strangers wrote.
 */
export function htmlToBlocks(html: string): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  const stack: OpenTag[] = [];
  let runs: PdfRun[] = [];
  let listDepth = 0;
  let orderedCounters: number[] = [];
  let pendingKind: PdfBlock["kind"] = "paragraph";
  let pendingLevel: 1 | 2 | 3 = 1;
  let pendingMarker = "";

  const has = (name: string) => stack.some((t) => t.name === name);
  const hrefOf = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === "a") {
        const m = stack[i].attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const raw = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
        return safeHref(decodeEntities(raw));
      }
    }
    return undefined;
  };

  const flush = () => {
    const text = runs
      .map((r) => r.text)
      .join("")
      .trim();
    if (text.length > 0) {
      // Trim only at the edges of the block, never inside a run, or
      // "**bold** text" loses the space between them.
      const trimmed = [...runs];
      while (trimmed.length && trimmed[0].text.trim() === "") trimmed.shift();
      while (trimmed.length && trimmed[trimmed.length - 1].text.trim() === "") trimmed.pop();
      if (trimmed.length) {
        trimmed[0] = { ...trimmed[0], text: trimmed[0].text.replace(/^\s+/, "") };
        const last = trimmed.length - 1;
        trimmed[last] = { ...trimmed[last], text: trimmed[last].text.replace(/\s+$/, "") };
      }
      if (pendingKind === "heading") blocks.push({ kind: "heading", level: pendingLevel, runs: trimmed });
      else if (pendingKind === "listItem") blocks.push({ kind: "listItem", marker: pendingMarker, runs: trimmed });
      else blocks.push({ kind: "paragraph", runs: trimmed });
    }
    runs = [];
    pendingKind = "paragraph";
  };

  const tokens = html.split(/(<[^>]*>)/);
  for (const token of tokens) {
    if (token === "") continue;
    if (token.startsWith("<")) {
      const tag = parseTag(token);
      if (!tag) continue;
      if (tag.name === "br") {
        flush();
        continue;
      }
      if (tag.name === "hr") {
        flush();
        blocks.push({ kind: "rule" });
        continue;
      }
      if (!tag.closing) {
        if (BLOCK_TAGS.has(tag.name)) flush();
        stack.push({ name: tag.name, attrs: tag.attrs });
        if (tag.name === "ul") {
          listDepth++;
          orderedCounters.push(0);
        } else if (tag.name === "ol") {
          listDepth++;
          orderedCounters.push(1);
        } else if (tag.name === "li") {
          pendingKind = "listItem";
          const counter = orderedCounters[orderedCounters.length - 1];
          if (counter && counter > 0) {
            pendingMarker = `${counter}.`;
            orderedCounters[orderedCounters.length - 1] = counter + 1;
          } else {
            pendingMarker = "•";
          }
        } else if (/^h[1-6]$/.test(tag.name)) {
          pendingKind = "heading";
          const n = Number(tag.name.slice(1));
          pendingLevel = n <= 1 ? 1 : n === 2 ? 2 : 3;
        }
      } else {
        if (BLOCK_TAGS.has(tag.name)) flush();
        if (tag.name === "ul" || tag.name === "ol") {
          listDepth = Math.max(0, listDepth - 1);
          orderedCounters.pop();
        }
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].name === tag.name) {
            stack.splice(i, 1);
            break;
          }
        }
      }
      continue;
    }
    const text = decodeEntities(token).replace(/\s+/g, " ");
    if (text === "") continue;
    runs.push({
      text,
      bold: has("b") || has("strong") || undefined,
      italic: has("i") || has("em") || undefined,
      href: hrefOf(),
    });
  }
  flush();
  void listDepth;
  return blocks;
}

/** A run of plain text — the common case for builders that are not parsing. */
export function text(value: string, style?: { bold?: boolean; italic?: boolean; href?: string }): PdfRun[] {
  return [{ text: value, ...style }];
}

/**
 * Markdown-ish body text to blocks.
 *
 * Research report bodies are the model's own prose: paragraphs separated by
 * blank lines, `**bold**`, `*italic*`, and `- ` bullets. Nothing else is
 * recognised, and anything unrecognised stays as the literal characters the
 * model wrote — a report that says `# heading` was written that way.
 */
export function markdownToBlocks(markdown: string): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  for (const raw of markdown.split(/\n{2,}/)) {
    const chunk = raw.trim();
    if (chunk === "") continue;
    const lines = chunk.split("\n");
    const allBullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
    if (allBullets) {
      for (const line of lines) {
        blocks.push({ kind: "listItem", marker: "•", runs: inlineRuns(line.replace(/^\s*[-*•]\s+/, "")) });
      }
      continue;
    }
    blocks.push({ kind: "paragraph", runs: inlineRuns(lines.join(" ")) });
  }
  return blocks;
}

/** `**bold**` and `*italic*` inside one line. */
export function inlineRuns(line: string): PdfRun[] {
  const runs: PdfRun[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
    else runs.push({ text: m[4], italic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.length > 0 ? runs : [{ text: line }];
}

/**
 * A filename the browser will accept and the Content-Disposition header
 * cannot be broken out of.
 *
 * The title is something the user typed. A quote or a newline in it would
 * otherwise end the header's quoted string — a header injection whose
 * payload is a field they filled in themselves.
 */
export function safeFilename(title: string, fallback: string): string {
  const cleaned = String(title ?? "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}
