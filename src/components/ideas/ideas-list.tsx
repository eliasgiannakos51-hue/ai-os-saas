"use client";

import { useMemo, useState } from "react";
import type { Idea } from "@/types/ideas";
import { IdeaRow } from "@/components/ideas/idea-row";
import { toCSV, downloadCSV, todayForFilename } from "@/lib/csv";

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
    .join(" ")
    .toLowerCase();
}

export function IdeasList({ ideas }: { ideas: Idea[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ideas;
    return ideas.filter((idea) => searchableText(idea).includes(q));
  }, [ideas, query]);

  function handleExport() {
    const csv = toCSV(CSV_HEADERS, filtered.map(toCSVRow));
    downloadCSV(`ideas_export_${todayForFilename()}.csv`, csv);
  }

  if (ideas.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
        no ideas yet — run{" "}
        <span className="text-amber-500">ideas.insert()</span> to log your
        first one.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search.filter()..."
          className="input"
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-amber-500 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
        >
          export.csv()
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
          no matches for &apos;{query}&apos;
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  );
}
