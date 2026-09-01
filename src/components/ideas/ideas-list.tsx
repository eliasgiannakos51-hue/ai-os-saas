"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SearchX, Download } from "lucide-react";
import { MODULE_ICONS } from "@/lib/module-icons";
import type { Idea } from "@/types/ideas";
import type { LinkedEntity } from "@/lib/entity-links";
import { IdeaRow } from "@/components/ideas/idea-row";
import { toCSV, downloadCSV, todayForFilename } from "@/lib/download/table-csv";
import { PAGE_SIZE, useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState } from "@/components/empty-state";
import { useTranslations } from "next-intl";
import { matchesSearch } from "@/lib/text/search-match";

const CSV_HEADERS = [
  "name",
  "problem",
  "customer",
  "competitors",
  "market_size",
  "mvp",
  "score",
  "verdict",
  "created_at",
];

function toCSVRow(idea: Idea) {
  return [
    idea.name,
    idea.problem,
    idea.customer,
    idea.competitors,
    idea.market_size,
    idea.mvp,
    idea.score,
    idea.verdict,
    idea.created_at,
  ];
}

function searchableText(idea: Idea): string {
  return [
    idea.name,
    idea.problem,
    idea.customer,
    idea.competitors,
    idea.market_size,
    idea.mvp,
    idea.verdict,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function IdeasList({
  ideas,
  linkedEntities = {},
  favoritedIds,
  onExample,
}: {
  ideas: Idea[];
  linkedEntities?: Record<string, LinkedEntity[]>;
  favoritedIds?: Set<string>;
  /**
   * Hands the worked example on the empty screen back up to
   * IdeasSection, which owns the form. Optional so this component still
   * renders standalone; without it the example is shown as text rather
   * than as a button that would do nothing.
   */
  onExample?: (text: string) => void;
}) {
  // The chrome (search, export, "no matches") is the same in all 14
  // modules and already lives in `module`; only the wording that is
  // actually about ideas comes from `dashboard.ideas`.
  const t = useTranslations("module");
  const tIdeas = useTranslations("dashboard.ideas");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return ideas;
    return ideas.filter((idea) => matchesSearch(searchableText(idea), q));
  }, [ideas, query]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, sorted, paginated, alphabetical } =
    useSortAndPaginate(filtered, query, (idea) => idea.name ?? "");

  // DEEP LINK FOR ?record=<id> — V4.6 #11.2.
  //
  // Ideas are the one starrable surface that lives on /dashboard rather
  // than on /dashboard/<slug> (lib/classifier-modules.ts's moduleHref
  // special-cases it), so they do not go through generic-list.tsx and did
  // not inherit its `?record=` reader. Starring an idea and pressing it
  // landed on the dashboard with the idea nowhere in particular.
  //
  // AND THE PAGE MATTERS HERE, which is what makes this more than a
  // scroll. The list paginates at PAGE_SIZE (20); a starred idea from
  // three months ago is on page 4, and scrolling to an element that is
  // not rendered scrolls to nothing. So the page is computed from the
  // id's position in the SORTED set — the same array the pagination
  // slices — and set before the scroll.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("record");
    if (requested && ideas.some((i) => i.id === requested)) setHighlightId(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!highlightId) return;
    const index = sorted.findIndex((i) => i.id === highlightId);
    if (index < 0) return;
    const target = Math.floor(index / PAGE_SIZE) + 1;
    if (target !== page) setPage(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, sorted]);
  useEffect(() => {
    if (!highlightId) return;
    highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, page]);

  function handleExport() {
    const csv = toCSV(CSV_HEADERS, sorted.map(toCSVRow));
    downloadCSV(`ideas_export_${todayForFilename()}.csv`, csv);
  }

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="input pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SortToggle sortOrder={sortOrder} onChange={setSortOrder} alphabetical={alphabetical} />
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {t("exportCsv")}
          </button>
        </div>
      </div>

      {ideas.length === 0 ? (
        <EmptyState
          icon={MODULE_ICONS.ideas}
          title={tIdeas("empty.title")}
          example={tIdeas("empty.example")}
          onExample={onExample}
        >
          {tIdeas("empty.why")}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX}>{t("noMatches", { query })}</EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((idea) => (
              /* The wrapper carries the ref and the mark rather than
                 IdeaRow, so the row keeps its own markup and nothing
                 about how an idea looks depends on how it was reached. */
              <div
                key={idea.id}
                ref={idea.id === highlightId ? highlightRef : undefined}
                className={
                  idea.id === highlightId
                    ? "rounded-2xl ring-2 ring-orange-500 ring-offset-2 ring-offset-background"
                    : undefined
                }
              >
                <IdeaRow
                  idea={idea}
                  linkedEntities={linkedEntities[idea.id]}
                  isFavorited={favoritedIds?.has(idea.id) ?? false}
                />
              </div>
            ))}
          </div>
          <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
