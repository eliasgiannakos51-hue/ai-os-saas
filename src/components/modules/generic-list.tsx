"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { SearchX, Download } from "lucide-react";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import type { LinkedEntity } from "@/lib/entity-links";
import { MODULE_ICONS } from "@/lib/module-icons";
import { GenericAddForm } from "@/components/modules/generic-add-form";
import { GenericRecordCard } from "@/components/modules/generic-record-card";
import type { RecordDetailTab } from "@/components/modules/generic-record-detail";
// DEFERRED. The detail panel is the biggest thing in this tree — its own
// tabs, its own edit form, the linked-entities list — and it renders only
// after somebody presses a record. It was already gated on
// `selectedRecord`, so nothing about when it appears changes; what
// changes is that its code no longer arrives with the list.
//
// `type RecordDetailTab` stays a static import above: a type import emits
// no runtime code, so it cannot pull the module back into the bundle.
const GenericRecordDetail = dynamic(
  () =>
    import("@/components/modules/generic-record-detail").then(
      (m) => m.GenericRecordDetail,
    ),
  { ssr: false },
);
import { toCSV, downloadCSV, todayForFilename } from "@/lib/download/table-csv";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState } from "@/components/empty-state";
import { ListCappedNotice } from "@/components/ui/list-capped-notice";
import { isCapped } from "@/lib/record-cap";
import { ListLayout } from "@/components/ui/list-layout";
import { CardGrid } from "@/components/ui/entity-card";
import { matchesSearch } from "@/lib/text/search-match";
import { emptyStateKey, optionLabelKey } from "@/lib/modules";
import { enFieldLabel } from "@/lib/module-labels";

function searchableText(module: ModuleConfig, record: ModuleRecord): string {
  return module.fields
    .filter((field) => field.type !== "number")
    .map((field) => record[field.key])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

/**
 * The list body shared by all 18 module pages, plus the Products and
 * Trades sections of the two workflow pages.
 *
 * Layout is the app-wide one (components/ui/list-layout.tsx): "+ New",
 * then search, then sort/filter, then a grid of EntityCards — and the add
 * form now lives here rather than being rendered separately by each page,
 * because "where is the create button" has to have one answer.
 */
export function GenericList({
  module,
  records,
  linkedEntities = {},
  favoritedIds,
  cap,
}: {
  module: ModuleConfig;
  records: ModuleRecord[];
  linkedEntities?: Record<string, LinkedEntity[]>;
  favoritedIds?: Set<string>;
  /**
   * The server-side row limit this list was read with, when there was
   * one. Present so the list can SAY it may be cut off — the pagination
   * below is client-side and pages through whatever arrived, so without
   * this it would look complete at every page.
   */
  cap?: number;
}) {
  const t = useTranslations("module");
  const tKey = useTranslations();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selected, setSelected] = useState<{ id: string; tab: RecordDetailTab } | null>(null);

  // ?record=<id> OPENS THAT ENTRY — V4.6 #9.
  //
  // "Every answer that uses data: 'based on 12 entries from March', and
  // clickable — it should open the entry." There was nothing to click to.
  // Which record is open lived only in the state above, so a record had no
  // address: a chat answer could name the entry it read and then have
  // nowhere to send the reader.
  //
  // Read once per id rather than kept in sync both ways. Pushing every
  // open and close into the URL would put a history entry behind each
  // press of a card, and the back button would then walk a reader
  // backwards through rows they browsed rather than out of the page.
  const searchParams = useSearchParams();
  const requestedRecordId = searchParams.get("record");
  useEffect(() => {
    if (!requestedRecordId) return;
    // Only if it is on this page. A stale or foreign id opens nothing,
    // rather than opening a panel with no record in it.
    if (!records.some((r) => r.id === requestedRecordId)) return;
    setSelected((current) => (current?.id === requestedRecordId ? current : { id: requestedRecordId, tab: "details" }));
  }, [requestedRecordId, records]);
  // Pressing the worked example on the empty screen hands its text to the
  // add form below, which opens with the headline field already filled.
  //
  // The nonce is the whole mechanism: the form reacts to a NEW prefill,
  // and a user who dismisses the form and presses the same example again
  // is asking for it a second time. Without a nonce the second press
  // passes an identical value, React sees no change, and the button
  // silently does nothing — which is worse than not offering it.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);

  // The filter dropdown only appears for modules that actually have a
  // status-shaped field (the five Build modules, Trading's result) —
  // rendering an empty <select> on Research would be pure chrome.
  const statusField = useMemo(
    () => module.fields.find((f) => (f.key === "status" || f.key === "result") && f.options?.length),
    [module]
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    return records.filter((record) => {
      if (!matchesSearch(searchableText(module, record), q)) return false;
      if (statusFilter && String(record[statusField?.key ?? ""] ?? "") !== statusFilter) return false;
      return true;
    });
  }, [module, records, query, statusFilter, statusField]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, sorted, paginated, alphabetical } =
    useSortAndPaginate(filtered, `${query}|${statusFilter}`, (record) =>
      String(record[module.headlineKey] ?? "")
    );

  const selectedRecord = selected ? records.find((r) => r.id === selected.id) ?? null : null;

  function handleExport() {
    const headers = [...module.fields.map((f) => enFieldLabel(f)), "created_at"];
    const rows = sorted.map((record) => [
      ...module.fields.map((f) => record[f.key]),
      record.created_at,
    ]);
    const csv = toCSV(headers, rows);
    downloadCSV(`${module.slug}_export_${todayForFilename()}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      {cap !== undefined && isCapped(records, cap) && <ListCappedNotice cap={cap} />}

      {selectedRecord && (
        <GenericRecordDetail
          key={selectedRecord.id}
          module={module}
          record={selectedRecord}
          linkedEntities={linkedEntities[selectedRecord.id]}
          isFavorited={favoritedIds?.has(selectedRecord.id) ?? false}
          initialTab={selected?.tab ?? "details"}
          onClose={() => setSelected(null)}
        />
      )}

      <ListLayout
        newAction={<GenericAddForm module={module} prefill={prefill} />}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={t("searchPlaceholder")}
        filters={
          <>
            <SortToggle sortOrder={sortOrder} onChange={setSortOrder} alphabetical={alphabetical} />
            {statusField && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label={t("filterBy", { label: tKey(statusField.labelKey) })}
                className="min-h-[44px] rounded-full border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none transition-colors duration-150 focus:border-orange-500/60"
              >
                <option value="">{t("filterAll", { label: tKey(statusField.labelKey) })}</option>
                {statusField.options?.map((option) => (
                  <option key={option} value={option}>
                    {tKey(optionLabelKey(option))}
                  </option>
                ))}
              </select>
            )}
          </>
        }
        meta={
          <>
            <span className="text-xs text-muted">
              {t("resultCount", { count: filtered.length, total: records.length })}
            </span>
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> {t("exportCsv")}
            </button>
          </>
        }
      >
        {records.length === 0 ? (
          // Resolved through tKey, the root translator, for the reason
          // every other config-carried key is: a module config holds FULL
          // dotted keys, so they cannot be looked up inside the `module`
          // namespace. There is no `?? "noEntries"` behind this any more —
          // emptyKey is required, so there is no module for a fallback to
          // catch, and leaving one there would only mean the twenty-first
          // module could quietly go back to the generic sentence.
          <EmptyState
            icon={MODULE_ICONS[module.slug]}
            title={tKey(emptyStateKey(module, "title"))}
            example={tKey(emptyStateKey(module, "example"))}
            onExample={(text) =>
              setPrefill((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }))
            }
          >
            {tKey(emptyStateKey(module, "why"))}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX}>{t("noMatches", { query })}</EmptyState>
        ) : (
          <>
            <CardGrid>
              {paginated.map((record, i) => (
                <GenericRecordCard
                  key={record.id}
                  module={module}
                  record={record}
                  index={i}
                  selected={selected?.id === record.id}
                  isFavorited={favoritedIds?.has(record.id) ?? false}
                  onOpen={(tab) => setSelected({ id: record.id, tab: tab ?? "details" })}
                  onDeleted={() =>
                    setSelected((current) => (current?.id === record.id ? null : current))
                  }
                />
              ))}
            </CardGrid>
            <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </ListLayout>
    </div>
  );
}
