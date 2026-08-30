// Turns a finished research report into the HTML the Documents editor
// stores, safely.
//
// TWO SEPARATE PROBLEMS THIS SOLVES.
//
// 1. THE REPORT WAS SAVED WHERE NOTHING READS IT. api/research/[id]/run
//    inserted the report into `ai_documents` and then the UI linked to
//    /dashboard/documents/<that id>. `ai_documents` is the LEGACY Build-
//    module tracker; /dashboard/documents has rendered `user_documents`
//    since the Documents module replaced it (see the note in
//    dashboard/agents/page.tsx, which records the same replacement for
//    ai_agents). So "Open as a document" was a guaranteed 404 on every
//    report ever produced — the row existed, in a table no screen shows.
//
// 2. THE EDITOR RENDERS RAW HTML. document-editor.tsx assigns
//    `editorRef.current.innerHTML = doc.content?.html`. user_documents
//    stores { html }, so writing a report there means writing markup that
//    the browser will execute — and a research report is assembled from
//    web search results, i.e. from text strangers wrote. Handing that
//    through to innerHTML unescaped would be a stored XSS with an
//    attacker-controlled source and a very obvious delivery path.
//
// So this does not "convert Markdown to HTML" in the general sense. It
// escapes EVERYTHING first, then re-introduces a small, fixed set of tags
// that this function itself constructs: h2/h3, p, ul/li, ol/li, strong,
// em and anchors whose href is re-validated as http(s). Nothing from the
// input can ever become a tag, an attribute or a URL scheme.
//
// Pure and dependency-free so it is unit-testable without a database.

export type ReportSource = { title: string; url: string };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Applied to text that is ALREADY escaped, so the only < > it can produce
// are the ones written here.
function inlineMarkup(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/** http/https only. A markdown link is not allowed to introduce
 *  javascript:, data: or anything else the editor would happily run. */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return escapeHtml(trimmed.slice(0, 500));
}

/**
 * The report body plus its sources and the AI disclosure, as editor HTML.
 *
 * `markdown` is the model's own output and `sources` come from Anthropic's
 * citation blocks — both untrusted, both escaped before anything else
 * happens to them.
 */
export function researchReportToDocumentHtml(params: {
  markdown: string;
  sources: ReportSource[];
  /** The user's own entries, cited as [E1..En]. Their links are internal
   *  and relative, which is why they do not go through safeHref: that
   *  function requires http(s) and would reject every one of them. */
  entries?: readonly { title: string; headline: string; date: string; href: string }[];
  disclosure: string;
  sourcesHeading: string;
  entriesHeading?: string;
}): string {
  const out: string[] = [];
  let listItems: string[] = [];
  let listTag: "ul" | "ol" | null = null;

  function flushList() {
    if (listTag && listItems.length > 0) {
      out.push(`<${listTag}>${listItems.join("")}</${listTag}>`);
    }
    listItems = [];
    listTag = null;
  }

  for (const rawLine of params.markdown.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      flushList();
      const tag = heading[1].length === 2 ? "h2" : "h3";
      out.push(`<${tag}>${inlineMarkup(escapeHtml(heading[2].trim()))}</${tag}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (listTag !== "ul") flushList();
      listTag = "ul";
      listItems.push(`<li>${inlineMarkup(escapeHtml(bullet[1].trim()))}</li>`);
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (listTag !== "ol") flushList();
      listTag = "ol";
      listItems.push(`<li>${inlineMarkup(escapeHtml(numbered[1].trim()))}</li>`);
      continue;
    }

    flushList();
    out.push(`<p>${inlineMarkup(escapeHtml(line.trim()))}</p>`);
  }
  flushList();

  // THE ENTRY LIST, ITS OWN SECTION AND ITS OWN NUMBERING.
  //
  // Kept separate from the web sources rather than appended to them: a
  // merged list would make [7] mean a public page in one report and a
  // private note in another, and a reader could not tell which without
  // following it. The heading is what says which is which.
  //
  // EACH ONE IS A REAL LINK TO THE ROW, which is only true because
  // `?record=<id>` has a reader — components/modules/generic-list.tsx —
  // and scripts/tests/deep-links.test.mjs keeps it there. A citation
  // that cannot be followed is precisely what checkCitations exists to
  // catch, so emitting one deliberately would be worse than emitting
  // none.
  const entries = params.entries ?? [];
  if (entries.length > 0) {
    out.push(`<h2>${escapeHtml(params.entriesHeading ?? "Your entries")}</h2>`);
    const items = entries.map((entry, i) => {
      const label = escapeHtml(
        `${entry.title}${entry.date ? ` (${entry.date})` : ""} — ${entry.headline}`.slice(0, 200)
      );
      // INTERNAL, RELATIVE, AND NOT target="_blank". These open inside
      // the app, where the reader already is; a new tab for a link to
      // the page next door is the browser's way of saying "this is
      // somewhere else", and it is not.
      return `<li>[E${i + 1}] <a href="${escapeHtml(entry.href)}">${label}</a></li>`;
    });
    out.push(`<ol>${items.join("")}</ol>`);
  }

  if (params.sources.length > 0) {
    out.push(`<h2>${escapeHtml(params.sourcesHeading)}</h2>`);
    const items = params.sources.map((source, i) => {
      const href = safeHref(source.url);
      const label = escapeHtml((source.title || source.url).slice(0, 200));
      // A source whose URL did not survive validation is still listed —
      // dropping it would quietly change the report's citation numbering,
      // so [3] in the body would point at a different source than it did
      // when the model wrote it.
      return href
        ? `<li>[${i + 1}] <a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a></li>`
        : `<li>[${i + 1}] ${label}</li>`;
    });
    out.push(`<ol>${items.join("")}</ol>`);
  }

  // EU AI Act art. 50 — the notice travels with the document, because the
  // document outlives the screen that produced it.
  out.push(`<p><em>${escapeHtml(params.disclosure)}</em></p>`);

  return out.join("\n");
}
