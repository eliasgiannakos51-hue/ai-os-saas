"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Search,
  MessageCircle,
  FileText,
  LayoutGrid,
  Globe,
  Bot,
  Microscope,
  Target,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { ALL_SIDEBAR_GROUPS, type SidebarItem } from "@/lib/sidebar-nav";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { useCommandPalette } from "@/components/dashboard/command-palette-context";
import { normalizeForSearch } from "@/lib/text/search-match";
import { MODULE_TITLE_KEYS } from "@/lib/search/module-title-keys";
import {
  DATE_RANGES,
  MIN_QUERY_LENGTH,
  SEARCH_KINDS,
  flattenGroups,
  groupResults,
  sinceForRange,
  snippetSegments,
  type DateRange,
  type SearchKind,
  type SearchResult,
} from "@/lib/search/unified-search";

// Every sidebar link is searchable here too, flattened out of its groups.
// Every item is navigable again — the coming-soon exclusion that used to
// filter this list is gone along with the greyed-out states themselves.
const PALETTE_ITEMS: SidebarItem[] = ALL_SIDEBAR_GROUPS.flatMap((group) => group.items);

// One icon per kind, so a glance down the list tells you what sort of
// thing each row is without reading the heading above it.
const KIND_ICONS: Record<SearchKind, LucideIcon> = {
  module: LayoutGrid,
  file: FileText,
  chat: MessageCircle,
  website: Globe,
  agent: Bot,
  research: Microscope,
  mission: Target,
  help: HelpCircle,
};

// One shape both page-nav items and content search results render as, so
// keyboard nav (arrow up/down, enter) walks a single flat list regardless
// of which section an entry came from.
type PaletteEntry = {
  key: string;
  href: string;
  label: string;
  /** Set on the FIRST row of each kind, so the heading is rendered from
   *  the same list the arrow keys walk rather than from a parallel one
   *  that could disagree with it about where a group starts. */
  groupHeading?: string | null;
  render: (active: boolean) => React.ReactNode;
};

// Which facets to offer, taken from an ACTUAL unfiltered response for
// this query — never a fixed list of all eight kinds and all twenty-one
// modules. A chip that returns nothing is a chip that lies.
type Facets = { kinds: SearchKind[]; modules: string[] };
const NO_FACETS: Facets = { kinds: [], modules: [] };

function facetsOf(results: SearchResult[]): Facets {
  const kinds = SEARCH_KINDS.filter((kind) => results.some((r) => r.kind === kind));
  const modules: string[] = [];
  for (const result of results) {
    if (result.moduleSlug && !modules.includes(result.moduleSlug)) modules.push(result.moduleSlug);
  }
  modules.sort();
  return { kinds, modules };
}

// Subsequence match — every character of the query appears in the target,
// in order, not necessarily contiguous. A plain substring match is just a
// contiguous special case of this, so "fin" matches "Finance" either way.
function isFuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

function filterAndRankItems(items: SidebarItem[], rawQuery: string): SidebarItem[] {
  // normalizeForSearch, not toLowerCase(): the command palette is the
  // main way to jump anywhere in the app, and toLowerCase() alone leaves
  // accents untouched — a Greek user typing "καφε" got no match for a
  // sidebar item titled "Καφές". Same fold as every list search (see
  // lib/text/search-match.ts's header for why toLowerCase is not enough),
  // applied here to both the substring pass and the fuzzy pass below, so
  // neither reintroduces the gap the other one closed.
  const query = normalizeForSearch(rawQuery).trim();
  if (!query) return items;

  const substringMatches: { item: SidebarItem; index: number }[] = [];
  const fuzzyOnlyMatches: SidebarItem[] = [];

  for (const item of items) {
    const label = normalizeForSearch(item.label);
    const index = label.indexOf(query);
    if (index !== -1) {
      substringMatches.push({ item, index });
    } else if (isFuzzyMatch(query, label)) {
      fuzzyOnlyMatches.push(item);
    }
  }

  substringMatches.sort((a, b) => a.index - b.index);
  return [...substringMatches.map((m) => m.item), ...fuzzyOnlyMatches];
}

// True when the keystroke landed somewhere the user is composing text, in
// which case a printable shortcut like "/" must be left alone. Covers
// <input>/<textarea>/<select>, anything with contentEditable (the
// Documents editor), and any explicit role="textbox".
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.getAttribute("role") === "textbox";
}

export function CommandPalette() {
  const router = useRouter();
  const tCommon = useTranslations("common");
  const tSidebar = useTranslations("sidebar");
  const tSearch = useTranslations("dashboard.search");
  const tKey = useTranslations();
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [contentResults, setContentResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [kindFilter, setKindFilter] = useState<SearchKind | "">("");
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<DateRange>("any");
  const [facets, setFacets] = useState<Facets>(NO_FACETS);
  const searchCacheRef = useRef(new Map<string, SearchResult[]>());
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTokenRef = useRef(0);

  function translatedLabel(label: string): string {
    if (label === "Create Studio") return tCommon("createStudio");
    const key = ITEM_LABEL_KEYS[label];
    return key ? tSidebar(`items.${key}`) : label;
  }

  function moduleLabel(slug: string): string {
    const key = MODULE_TITLE_KEYS[slug];
    return key ? tKey(key) : slug;
  }

  const pageResults = useMemo(() => filterAndRankItems(PALETTE_ITEMS, query), [query]);

  // ONE REQUEST, debounced, cached, and last-one-wins.
  //
  // Three separate things, and dropping any of them shows:
  //
  //   DEBOUNCE, or it is a request per keystroke.
  //   A CACHE keyed by the whole request, because backspacing is how
  //   people search — "invoicee" -> "invoice" should not be a round trip
  //   for something answered a moment ago.
  //   A TOKEN, because responses do not arrive in the order they were
  //   sent: without it a slow answer for "inv" can land after the answer
  //   for "invoice" and replace it with a staler list.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setContentResults([]);
      setFacets(NO_FACETS);
      setSearching(false);
      return;
    }

    const params = new URLSearchParams({ q });
    if (kindFilter) params.set("kinds", kindFilter);
    if (moduleFilter) params.set("module", moduleFilter);
    const since = sinceForRange(dateFilter, Date.now());
    // Bucketed to the hour: a since= that changes every millisecond is a
    // cache key that never repeats, which is a cache that never hits.
    if (since) params.set("since", since.slice(0, 13) + ":00:00.000Z");
    const key = params.toString();
    // The facets come from a response fetched with NEITHER narrowing
    // filter applied. Reading them off a filtered response would delete
    // the chips you would need in order to undo the filter.
    const unnarrowed = !kindFilter && !moduleFilter;

    const cached = searchCacheRef.current.get(key);
    if (cached) {
      setContentResults(cached);
      if (unnarrowed) setFacets(facetsOf(cached));
      setSearching(false);
      return;
    }

    setSearching(true);
    const token = ++searchTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?${key}`);
        const data = await res.json();
        if (token !== searchTokenRef.current) return;
        const results: SearchResult[] = res.ok && data.ok ? data.results : [];
        // Bounded: a palette left open through a long session should not
        // grow a cache of every query anybody ever typed.
        if (searchCacheRef.current.size > 40) searchCacheRef.current.clear();
        searchCacheRef.current.set(key, results);
        setContentResults(results);
        if (unnarrowed) setFacets(facetsOf(results));
      } catch {
        if (token === searchTokenRef.current) setContentResults([]);
      } finally {
        if (token === searchTokenRef.current) setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, kindFilter, moduleFilter, dateFilter]);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setContentResults([]);
    setFacets(NO_FACETS);
    setKindFilter("");
    setModuleFilter("");
    setDateFilter("any");
  }

  function goTo(href: string) {
    close();
    router.push(href);
  }

  const entries: PaletteEntry[] = useMemo(() => {
    const pageEntries: PaletteEntry[] = pageResults.map((item, index) => ({
      key: `page-${item.href}`,
      href: item.href,
      label: translatedLabel(item.label),
      groupHeading: index === 0 ? tSearch("kinds.page") : null,
      render: (active) => {
        const Icon = item.icon;
        return (
          <>
            <Icon
              className={`h-4 w-4 shrink-0 ${active ? "text-orange-400" : "text-orange-500/40"}`}
              aria-hidden="true"
            />
            {translatedLabel(item.label)}
          </>
        );
      },
    }));

    // GROUPED BY KIND, ranked within each group, groups in a fixed
    // order — so the fourth row stays the fourth row between keystrokes
    // and the arrow keys can be aimed. See lib/search/unified-search.ts.
    const contentEntries: PaletteEntry[] = flattenGroups(groupResults(contentResults)).map(
      (result, index, all) => {
        const first = index === 0 || all[index - 1].kind !== result.kind;
        return {
          key: `content-${result.sourceTable}-${result.sourceId}`,
          href: result.href,
          label: result.title,
          groupHeading: first ? tSearch(`kinds.${result.kind}`) : null,
          render: () => {
            const Icon = KIND_ICONS[result.kind] ?? FileText;
            const segments = snippetSegments(result.snippet);
            return (
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange-500/40" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{result.title}</span>
                  {/* THE PREVIEW. Rendered as text nodes and a <mark>,
                      never as HTML — ts_headline's <<…>> markers are
                      split in lib/search/unified-search.ts precisely so
                      nothing calls dangerouslySetInnerHTML on a string
                      that came out of a database. */}
                  {segments.length > 0 && (
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {segments.map((seg, i) =>
                        seg.match ? (
                          <mark key={i} className="bg-orange-500/25 text-foreground">
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        )
                      )}
                    </span>
                  )}
                </span>
              </div>
            );
          },
        };
      }
    );

    return [...pageEntries, ...contentEntries];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageResults, contentResults]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isModK) {
        e.preventDefault();
        setOpen(!open);
        return;
      }

      // "/" opens search too — the convention users bring from GitHub,
      // Slack, Linear et al. Unlike Cmd+K it's a printable character, so
      // it must be ignored whenever the user is actually typing, or it
      // would hijack every forward slash in a note, a URL, or a date.
      // That means: any field-like element, and anything contentEditable
      // (the Documents editor), plus the palette's own input when open.
      if (e.key === "/" && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
        return;
      }

      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Wait a tick for the modal to mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // The selection goes back to the top whenever the LIST changes under
  // it — a new query or a new filter. Without the filter half, clicking
  // "Files" while row 9 was selected leaves the highlight past the end
  // of a three-row list and Enter opens nothing.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, kindFilter, moduleFilter, dateFilter]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = entries[activeIndex];
      if (selected) goTo(selected.href);
    }
  }

  if (!open) return null;

  const showFilters = query.trim().length >= MIN_QUERY_LENGTH && facets.kinds.length > 0;

  // Chips must not steal focus from the input, or the arrow keys stop
  // working the moment somebody narrows the list — which is exactly when
  // they want to walk it. onMouseDown/preventDefault keeps the caret put;
  // onClick still fires.
  function chipClass(selected: boolean): string {
    return `rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150 ${
      selected
        ? "border-orange-500/40 bg-orange-500/15 text-orange-300"
        : "border-border text-muted hover:text-foreground"
    }`;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div
        onClick={close}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={tCommon("commandPalette")}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_0_0_1px_rgba(249,115,22,0.05)]"
      >
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={tCommon("jumpToPage")}
            className="w-full bg-transparent py-4 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>

        {showFilters && (
          <div className="space-y-1.5 border-b border-border px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[11px] text-muted">{tSearch("filters.type")}</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setKindFilter("");
                  setModuleFilter("");
                }}
                className={chipClass(kindFilter === "")}
              >
                {tSearch("filters.all")}
              </button>
              {facets.kinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const next = kindFilter === kind ? "" : kind;
                    setKindFilter(next);
                    // The module filter only means anything inside
                    // kind=module; leaving it set while filtering to
                    // Files gives an empty list and no way to see why.
                    if (next !== "module") setModuleFilter("");
                  }}
                  className={chipClass(kindFilter === kind)}
                >
                  {tSearch(`kinds.${kind}`)}
                </button>
              ))}
            </div>

            {/* Only where a module means anything. module_slug is null on
                every kind except "module", so offering the row beside
                "Files" or "Chats" is offering a filter that can only ever
                empty the list. */}
            {facets.modules.length > 0 && (kindFilter === "" || kindFilter === "module") && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11px] text-muted">{tSearch("filters.module")}</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setModuleFilter("")}
                  className={chipClass(moduleFilter === "")}
                >
                  {tSearch("filters.all")}
                </button>
                {facets.modules.map((slug) => (
                  <button
                    key={slug}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setModuleFilter(moduleFilter === slug ? "" : slug)}
                    className={chipClass(moduleFilter === slug)}
                  >
                    {moduleLabel(slug)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[11px] text-muted">{tSearch("filters.date")}</span>
              {DATE_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setDateFilter(range)}
                  className={chipClass(dateFilter === range)}
                >
                  {tSearch(`dates.${range}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-96 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              {searching ? tCommon("loading") : tCommon("noMatches", { query })}
            </p>
          ) : (
            entries.map((entry, index) => {
              const active = index === activeIndex;
              return (
                <div key={entry.key}>
                  {entry.groupHeading && (
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      {entry.groupHeading}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => goTo(entry.href)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                      active
                        ? "bg-orange-500/10 text-orange-400"
                        : "text-foreground hover:bg-panel-hover"
                    }`}
                  >
                    {entry.render(active)}
                  </button>
                </div>
              );
            })
          )}
          {searching && entries.length > 0 && (
            <p className="px-3 py-2 text-center text-[11px] text-muted">{tCommon("loading")}</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
