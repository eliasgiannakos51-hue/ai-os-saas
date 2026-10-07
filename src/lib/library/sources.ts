import { normalizeForSearch } from "@/lib/text/search-match";
import { truncate } from "@/lib/text/truncate";

/**
 * THE LIBRARY'S SOURCES (MASTER 4.1, package 5): «φτιάχνω κάτι σε τρία
 * εργαλεία και τα βρίσκω και τα τρία εκεί».
 *
 * NO NEW TABLE, AND NOTHING MOVES. Each tool keeps writing where it always
 * has; the Library reads those tables at request time, the way the
 * Timeline reads the record tables (lib/timeline.ts). So no migration has
 * to be pasted before it shows anything, nothing anybody made has to be
 * copied, and the count before and after is the same rows by
 * construction. scripts/tests/library.test.mjs holds that every table a
 * tool in the shell inserts into is listed here.
 *
 * Every link opens the thing IN THE TOOL THAT MADE IT, on that one item:
 * each parameter below has a reader in the page it points at, which
 * scripts/tests/deep-links.test.mjs walks the import graph to find.
 */

export type LibraryKind = "site" | "slides" | "posts" | "document" | "research" | "analysis" | "file";

export type LibrarySource = {
  kind: LibraryKind;
  table: string;
  /** The columns the list needs. Always includes `id` and the time column. */
  columns: string;
  /** The columns only a search reads — page text, file text, slides. */
  contentColumns: string;
  titleOf: (row: Record<string, unknown>) => string;
  timeColumn: string;
  /** A row that failed to be made is not in the Library. */
  keep: (row: Record<string, unknown>) => boolean;
  hrefFor: (id: string) => string;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export const LIBRARY_SOURCES: readonly LibrarySource[] = [
  {
    kind: "site",
    table: "user_websites",
    columns: "id, name, status, created_at",
    contentColumns: "html_content",
    titleOf: (row) => text(row.name),
    timeColumn: "created_at",
    keep: (row) => row.status !== "failed",
    // Read by WebsiteShell (initialOpenId) and by the old workspace.
    hrefFor: (id) => `/dashboard/website-builder?project=${encodeURIComponent(id)}`,
  },
  {
    kind: "slides",
    table: "ai_presentations",
    columns: "id, title, description, error, created_at",
    contentColumns: "slides",
    titleOf: (row) => text(row.title),
    timeColumn: "created_at",
    keep: (row) => !row.error,
    hrefFor: (id) => `/dashboard/presentations?record=${encodeURIComponent(id)}`,
  },
  {
    kind: "posts",
    table: "generated_posts",
    columns: "id, description, status, created_at",
    contentColumns: "posts",
    titleOf: (row) => text(row.description),
    timeColumn: "created_at",
    keep: (row) => row.status !== "failed",
    hrefFor: (id) => `/dashboard/posts?record=${encodeURIComponent(id)}`,
  },
  {
    kind: "document",
    table: "user_documents",
    columns: "id, title, created_at",
    contentColumns: "content",
    titleOf: (row) => text(row.title),
    timeColumn: "created_at",
    keep: () => true,
    hrefFor: (id) => `/dashboard/documents/${encodeURIComponent(id)}`,
  },
  {
    kind: "research",
    table: "research_reports",
    columns: "id, topic, status, created_at",
    contentColumns: "sections",
    titleOf: (row) => text(row.topic),
    timeColumn: "created_at",
    keep: (row) => row.status === "ready",
    hrefFor: (id) => `/dashboard/deep-research?record=${encodeURIComponent(id)}`,
  },
  {
    kind: "analysis",
    table: "data_analyses",
    columns: "id, title, file_name, created_at",
    contentColumns: "headers",
    titleOf: (row) => text(row.title) || text(row.file_name),
    timeColumn: "created_at",
    keep: () => true,
    hrefFor: (id) => `/dashboard/data-analysis?id=${encodeURIComponent(id)}`,
  },
  {
    kind: "file",
    table: "user_files",
    columns: "id, filename, processing_status, uploaded_at",
    contentColumns: "extracted_text",
    titleOf: (row) => text(row.filename),
    timeColumn: "uploaded_at",
    keep: (row) => row.processing_status !== "failed",
    hrefFor: (id) => `/dashboard/files?record=${encodeURIComponent(id)}`,
  },
];

export const LIBRARY_KINDS: readonly LibraryKind[] = LIBRARY_SOURCES.map((s) => s.kind);

export function isLibraryKind(value: unknown): value is LibraryKind {
  return typeof value === "string" && (LIBRARY_KINDS as readonly string[]).includes(value);
}

/** Every string inside a JSON value — a deck, a document, a list of posts — in order. */
function stringsIn(value: unknown, out: string[], depth = 0): void {
  if (depth > 12) return;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out, depth + 1);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsIn(v, out, depth + 1);
}

/** Page text without its markup: what a person reads on the page, not the tags. */
export function textOfHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a search reads for one row: its title and everything it says. */
export function searchableText(source: LibrarySource, row: Record<string, unknown>): string {
  const parts: string[] = [source.titleOf(row)];
  for (const column of source.contentColumns.split(",").map((c) => c.trim()).filter(Boolean)) {
    const value = row[column];
    if (column === "html_content") parts.push(textOfHtml(text(value)));
    else stringsIn(value, parts);
  }
  return parts.join(" \n ");
}

/**
 * The words around the first place the query is found, so a result found
 * by what it SAYS shows why it was found. Null when only the title matched.
 */
export function snippetAround(haystack: string, query: string, title: string): string | null {
  const q = normalizeForSearch(query);
  if (!q) return null;
  if (normalizeForSearch(title).includes(q)) return null;
  // Search the folded text, then cut the ORIGINAL at the same place:
  // foldForMatch is index-stable (lib/text/unicode-patterns.ts), so an
  // offset in one is the same offset in the other.
  const folded = normalizeForSearch(haystack);
  const at = folded.indexOf(q);
  if (at < 0) return null;
  const from = Math.max(0, at - 60);
  const piece = haystack.slice(from, at + q.length + 100).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${truncate(piece, 170)}`;
}
