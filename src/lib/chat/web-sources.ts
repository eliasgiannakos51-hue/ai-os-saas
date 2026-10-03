/**
 * NUMBERED SOURCES FOR A CHAT ANSWER THAT SEARCHED THE WEB.
 *
 * The design the owner approved on 2026-10-02 takes its sources from
 * Perplexity: a number in the sentence, the same number on a card under
 * the answer (docs/mockups/README.md, "What it takes from where").
 *
 * WHERE THE NUMBERS COME FROM. Not from the model's prose. Anthropic's web
 * search returns `web_search_result_location` citations on the text blocks
 * of the answer — real pages the model read, attached to the span they
 * support. A model asked to "cite its sources" writes source-shaped text
 * whether or not it read anything (components/chat/provenance-line.tsx says
 * the same about the record line), so the numbers here are built only from
 * those citation blocks and never from anything the model typed.
 *
 * WHERE THEY ARE KEPT. Inside the message itself, as Markdown reference
 * definitions — `[1]: <https://…> "Title"` — appended after the answer.
 * react-markdown does not render a definition, and it turns every `[1]` in
 * the prose into a link to it, so the stored text is the whole record: a
 * reply reloaded from chat_messages shows the same numbers and the same
 * cards as the one that just streamed, with no new column and no migration.
 *
 * WHAT IS NEVER SHOWN: `cited_text`. It is the source's own words, and
 * api/chat's WEB_SEARCH_INSTRUCTION exists so the answer paraphrases
 * rather than reproduces them; a card that printed the quote would undo it.
 */

export type WebSource = { n: number; url: string; title: string };

/** More than this and a card list stops being read. */
export const MAX_WEB_SOURCES = 8;

type CitationLike = { type?: string; url?: unknown; title?: unknown };
type BlockLike = { type?: string; text?: unknown; citations?: unknown };

/** http(s) only, normalised by the URL parser so it cannot carry a space or
 *  an angle bracket out of the `<…>` it is written inside. */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const href = url.href;
    return /[\s<>]/.test(href) ? null : href;
  } catch {
    return null;
  }
}

/** A title that cannot end the definition early or run onto a second line. */
function safeTitle(raw: unknown, url: string): string {
  const text = typeof raw === "string" ? raw.replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim() : "";
  if (text) return text.slice(0, 120);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function webCitations(block: BlockLike): CitationLike[] {
  if (block.type !== "text" || !Array.isArray(block.citations)) return [];
  return (block.citations as CitationLike[]).filter((c) => c?.type === "web_search_result_location");
}

/**
 * The answer as it will be stored and shown: numbers after the spans the
 * citations support, and the definitions after the answer.
 *
 * `streamed` is the text the person already watched arrive. The numbers
 * are placed by rebuilding the FINAL round's text from its blocks — and
 * only if the streamed text ends with exactly that text. If it does not
 * (an earlier round wrote something, a stop cut it short), no number is
 * guessed into the prose; the cards are still added, because the sources
 * are still the sources.
 */
export function attachWebSources(streamed: string, blocks: readonly BlockLike[]): { text: string; sources: WebSource[] } {
  const numberOf = new Map<string, number>();
  const sources: WebSource[] = [];
  let plain = "";
  let marked = "";

  for (const block of blocks) {
    if (block.type !== "text" || typeof block.text !== "string") continue;
    const numbers: number[] = [];
    for (const c of webCitations(block)) {
      const url = safeUrl(c.url);
      if (!url) continue;
      let n = numberOf.get(url);
      if (n === undefined) {
        if (sources.length >= MAX_WEB_SOURCES) continue;
        n = sources.length + 1;
        numberOf.set(url, n);
        sources.push({ n, url, title: safeTitle(c.title, url) });
      }
      if (!numbers.includes(n)) numbers.push(n);
    }
    plain += block.text;
    if (numbers.length === 0) {
      marked += block.text;
      continue;
    }
    // After the span, before any whitespace that ends it. Separated by a
    // space: "[1][2]" is a full reference link in CommonMark — the text
    // "1" pointing at source 2 — and "[1] [2]" is two links.
    const trailing = block.text.match(/\s*$/)?.[0] ?? "";
    const body = block.text.slice(0, block.text.length - trailing.length);
    marked += `${body} ${numbers.map((n) => `[${n}]`).join(" ")}${trailing}`;
  }

  if (sources.length === 0) return { text: streamed, sources };

  const withMarkers = plain && streamed.endsWith(plain) ? streamed.slice(0, streamed.length - plain.length) + marked : streamed;
  const definitions = sources.map((s) => `[${s.n}]: <${s.url}> "${s.title}"`).join("\n");
  return { text: `${withMarkers.replace(/\s+$/, "")}\n\n${definitions}\n`, sources };
}

const DEFINITION = /^\[(\d{1,2})\]: <(https?:\/\/[^\s<>]+)>(?: "([^"\n]*)")?\s*$/gm;

/** The sources a stored answer carries, in number order — for the cards. */
export function parseWebSources(content: string): WebSource[] {
  const found: WebSource[] = [];
  const seen = new Set<number>();
  for (const m of String(content ?? "").matchAll(DEFINITION)) {
    const n = Number(m[1]);
    const url = safeUrl(m[2]);
    if (!url || seen.has(n)) continue;
    seen.add(n);
    found.push({ n, url, title: m[3]?.trim() || safeTitle("", url) });
  }
  return found.sort((a, b) => a.n - b.n);
}
