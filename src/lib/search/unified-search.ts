/**
 * ONE SEARCH, and the shapes both halves agree on.
 *
 * Pure: the route builds a request from a URL and the palette builds one
 * from its filter chips, and neither should be the place where "what a
 * kind is" gets decided.
 */

/** Every kind the index carries. The order is the order results are
 *  GROUPED in — most likely to be what somebody meant, first. */
export const SEARCH_KINDS = [
  "module",
  "file",
  "chat",
  "website",
  "agent",
  "research",
  "mission",
  "help",
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export function isSearchKind(value: unknown): value is SearchKind {
  return typeof value === "string" && (SEARCH_KINDS as readonly string[]).includes(value);
}

export type SearchResult = {
  kind: SearchKind;
  moduleSlug: string | null;
  sourceTable: string;
  sourceId: string;
  title: string;
  /** A fragment of the body around the match, with <<…>> around the
   *  matched words — built by Postgres from the same folded text the
   *  match was made on. */
  snippet: string;
  href: string;
  occurredAt: string;
  rank: number;
};

export type SearchGroup = { kind: SearchKind; results: SearchResult[] };

/** How far back a date filter reaches. Null is "any time". */
export const DATE_RANGES = ["any", "7d", "30d", "365d"] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export function sinceForRange(range: DateRange, nowMs: number): string | null {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "365d" ? 365 : 0;
  if (days === 0) return null;
  return new Date(nowMs - days * 86_400_000).toISOString();
}

/** The shortest query worth sending. One letter matches most of a
 *  thousand rows, which is not a search result, it is a list. */
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

/**
 * Results grouped by kind, ranked within each group, groups in
 * SEARCH_KINDS order.
 *
 * NOT SORTED BY RANK ACROSS GROUPS. A file that mentions a word in
 * passing can out-rank the record actually named after it, and a list
 * that reorders its own headings between keystrokes is one nobody can
 * aim at. Rank decides the order INSIDE a group; the group order is
 * fixed, so the fourth item stays the fourth item.
 */
export function groupResults(results: SearchResult[]): SearchGroup[] {
  const byKind = new Map<SearchKind, SearchResult[]>();
  for (const result of results) {
    if (!isSearchKind(result.kind)) continue;
    const list = byKind.get(result.kind) ?? [];
    list.push(result);
    byKind.set(result.kind, list);
  }
  const groups: SearchGroup[] = [];
  for (const kind of SEARCH_KINDS) {
    const list = byKind.get(kind);
    if (!list || list.length === 0) continue;
    groups.push({ kind, results: [...list].sort((a, b) => b.rank - a.rank) });
  }
  return groups;
}

/** Every result, in the order they are displayed — what the arrow keys
 *  walk and what Enter opens. Derived from the groups rather than kept
 *  beside them, so the two cannot disagree about which row is selected. */
export function flattenGroups(groups: SearchGroup[]): SearchResult[] {
  return groups.flatMap((g) => g.results);
}

/**
 * The snippet with its match markers turned into segments.
 *
 * ts_headline returns `<<matched>>` because the alternative is HTML that
 * a component would then have to trust. Splitting it here means the
 * component renders text nodes and a <mark>, and nothing ever calls
 * dangerouslySetInnerHTML on a string that passed through a database.
 */
export function snippetSegments(snippet: string): { text: string; match: boolean }[] {
  if (!snippet) return [];
  const out: { text: string; match: boolean }[] = [];
  let rest = snippet;
  for (;;) {
    const open = rest.indexOf("<<");
    if (open === -1) break;
    const close = rest.indexOf(">>", open + 2);
    if (close === -1) break;
    if (open > 0) out.push({ text: rest.slice(0, open), match: false });
    out.push({ text: rest.slice(open + 2, close), match: true });
    rest = rest.slice(close + 2);
  }
  if (rest) out.push({ text: rest, match: false });
  return out.filter((s) => s.text.length > 0);
}
