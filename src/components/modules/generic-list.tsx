"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, Download } from "lucide-react";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { GenericRecordRow } from "@/components/modules/generic-record-row";
import { toCSV, downloadCSV, todayForFilename } from "@/lib/csv";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState } from "@/components/empty-state";

function searchableText(module: ModuleConfig, record: ModuleRecord): string {
  return module.fields
    .filter((field) => field.type !== "number")
    .map((field) => record[field.key])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

export function GenericList({
  module,
  records,
}: {
  module: ModuleConfig;
  records: ModuleRecord[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((record) => searchableText(module, record).includes(q));
  }, [module, records, query]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, sorted, paginated } =
    useSortAndPaginate(filtered, query);

  function handleExport() {
    const headers = [...module.fields.map((f) => f.label), "created_at"];
    const rows = sorted.map((record) => [
      ...module.fields.map((f) => record[f.key]),
      record.created_at,
    ]);
    const csv = toCSV(headers, rows);
    downloadCSV(`${module.slug}_export_${todayForFilename()}.csv`, csv);
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
          <SortToggle sortOrder={sortOrder} onChange={setSortOrder} />
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <EmptyState>
          No entries yet — use the button above to log your first one.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX}>No matches for &apos;{query}&apos;</EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((record) => (
              <GenericRecordRow key={record.id} module={module} record={record} />
            ))}
          </div>
          <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
