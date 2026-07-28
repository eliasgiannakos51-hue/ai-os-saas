"use client";

import { useMemo, useState } from "react";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { GenericRecordRow } from "@/components/modules/generic-record-row";
import { toCSV, downloadCSV, todayForFilename } from "@/lib/csv";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";

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

  if (records.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
        no entries yet — run{" "}
        <span className="text-amber-500">{module.table}.insert()</span> to
        log your first one.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 space-y-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search.filter()..."
          className="input"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SortToggle sortOrder={sortOrder} onChange={setSortOrder} />
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-amber-500 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
          >
            export.csv()
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
          no matches for &apos;{query}&apos;
        </div>
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
