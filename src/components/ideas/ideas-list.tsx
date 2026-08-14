"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, Download, Lightbulb, Plus } from "lucide-react";
import type { Idea } from "@/types/ideas";
import type { LinkedEntity } from "@/lib/entity-links";
import { IdeaRow } from "@/components/ideas/idea-row";
import { toCSV, downloadCSV, todayForFilename } from "@/lib/csv";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState, GuidedEmptyState } from "@/components/empty-state";
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
  onUseExample,
}: {
  ideas: Idea[];
  linkedEntities?: Record<string, LinkedEntity[]>;
  favoritedIds?: Set<string>;
  /** Opens the add form with the advertised example already typed in. */
  onUseExample: () => void;
}) {
  const tModule = useTranslations("module");
  const tSidebar = useTranslations("sidebar.items");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return ideas;
    return ideas.filter((idea) => matchesSearch(searchableText(idea), q));
  }, [ideas, query]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, sorted, paginated, alphabetical } =
    useSortAndPaginate(filtered, query, (idea) => idea.name ?? "");

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
            placeholder="Search..."
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
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {ideas.length === 0 ? (
        // The Ideas board is where the overview's first Quick Action card
        // sends a new user, so this was the empty state most likely to be
        // the first one they ever saw — and it was still the exact "No X
        // yet — use the button above" sentence that empty-state.tsx's own
        // comment claims was eliminated. Missed because this list does not
        // go through GenericList.
        <GuidedEmptyState
          icon={Lightbulb}
          what={tModule("emptyWhat", { module: tSidebar("ideas") })}
          why={tModule("emptyWhy")}
          example={
            <button
              type="button"
              onClick={onUseExample}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-300 transition-colors duration-150 hover:border-orange-500 hover:bg-orange-500/20"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tModule("emptyExample", { example: tModule("examples.ideas") })}
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((idea) => (
              <IdeaRow
                key={idea.id}
                idea={idea}
                linkedEntities={linkedEntities[idea.id]}
                isFavorited={favoritedIds?.has(idea.id) ?? false}
              />
            ))}
          </div>
          <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
