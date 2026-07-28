"use client";

import { useMemo, useState } from "react";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { GenericRecordRow } from "@/components/modules/generic-record-row";

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
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search.filter()..."
        className="input mb-4"
      />

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
          no matches for &apos;{query}&apos;
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => (
            <GenericRecordRow key={record.id} module={module} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}
