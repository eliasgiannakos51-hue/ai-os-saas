import type { AiCitation } from "@/lib/ai/providers/types";

/**
 * THE CITATION BLOCKS ANTHROPIC ATTACHES, TURNED INTO SOURCES — and this
 * is a file of its own rather than six lines inside the adapter for one
 * reason: scripts/tests/load-ts.mjs cannot load a module that imports a
 * vendor SDK, so anything living in adapters/anthropic.ts can only be
 * READ by the build gate. The mapping is where the mistakes are, so the
 * mapping lives where the gate can RUN it
 * (scripts/tests/ai-providers.test.mjs §5d). The adapter keeps only the
 * one line that calls this, and the itest drives that line end to end
 * through a stubbed fetch, which is the half this file cannot prove.
 *
 * TYPED STRUCTURALLY, NOT AGAINST THE SDK. The parameter is
 * `readonly unknown[]` and every field is checked before it is used. An
 * `Anthropic.ContentBlock[]` annotation would be a vendor import, which
 * is the thing this file exists to avoid — and it would also be a
 * promise the runtime does not keep: this is parsing a JSON body off the
 * network, where the type says nothing.
 *
 * It was `sourcesFrom` in lib/research/research.ts until 2026-10-16,
 * where it ran on `Anthropic.Message` directly. Same rules, same caps,
 * one caller fewer reaching for the SDK.
 */

/** Long enough for any real URL; short enough that a hostile page cannot
 *  push a megabyte into a report's source list. */
export const CITATION_URL_MAX = 500;
/** A title is a line, not a document. */
export const CITATION_TITLE_MAX = 200;

/**
 * Sources in the order they were first cited, one entry per URL.
 *
 * ONLY `text` BLOCKS ARE READ. Citations ride on the prose they support;
 * a `tool_use` or `web_search_tool_result` block carries the raw search
 * output, which includes pages the model looked at and did not use. A
 * source list is "what this answer rests on", not "what was fetched".
 *
 * ONLY http AND https SURVIVE. Anything else — a relative path, a
 * `javascript:` or `data:` URL, a bare string — is dropped rather than
 * rendered: report-to-html.ts turns each of these into an anchor, and an
 * anchor is the one place a URL is not just text.
 */
export function citationsFromAnthropicContent(content: readonly unknown[]): AiCitation[] {
  const seen = new Map<string, AiCitation>();

  for (const block of content) {
    const b = block as { type?: unknown; citations?: unknown };
    if (b?.type !== "text") continue;
    const cites = Array.isArray(b.citations) ? b.citations : [];
    for (const cite of cites) {
      const c = cite as { url?: unknown; title?: unknown };
      const raw = typeof c?.url === "string" ? c.url : "";
      if (!/^https?:\/\//i.test(raw)) continue;
      // CUT FIRST, THEN DEDUPE. Keying on the raw URL and storing the cut
      // one would let two URLs that differ only past the cap become two
      // entries with the SAME href — numbered [3] and [4] in a report,
      // pointing at one page.
      const url = raw.slice(0, CITATION_URL_MAX);
      if (seen.has(url)) continue;
      const title = typeof c?.title === "string" && c.title.trim() ? c.title : url;
      seen.set(url, { url, title: title.slice(0, CITATION_TITLE_MAX) });
    }
  }

  return [...seen.values()];
}

/**
 * THE SOURCES OF A RESULT, or `null` when nobody knows them — the whole
 * reason AiResult.citations distinguishes absent from empty, written
 * once so the distinction is a function rather than a `!outcome.x` that
 * every caller spells for itself.
 *
 * `[]`        the provider CAN cite and this answer had nothing to cite.
 * `null`      the provider cannot cite at all, so the answer's sources
 *             are unknown. A caller that puts a source under every claim
 *             (lib/research) must refuse this rather than render an
 *             empty list, which reads to a person as "we looked and
 *             there was nothing".
 *
 * IT CANNOT HAPPEN TODAY, and it is here anyway. Only Anthropic's models
 * carry `server_web_search` (catalog.ts), the Anthropic adapter always
 * sets the field, and the other three refuse such a request outright
 * (refuseUnsupported). So `null` is reachable only through a change to
 * one of those three facts — which is exactly the change that would
 * otherwise ship a report whose claims point nowhere, silently.
 */
export function citedSources(result: { citations?: readonly AiCitation[] }): AiCitation[] | null {
  return result.citations ? [...result.citations] : null;
}
