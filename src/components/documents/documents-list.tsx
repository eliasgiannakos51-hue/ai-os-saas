"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, SearchX } from "lucide-react";
import { EntityCard, CardGrid } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import { EmptyState } from "@/components/empty-state";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { NewDocumentButton } from "@/components/documents/new-document-button";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { DeleteButton } from "@/components/delete-button";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import type { UserDocument } from "@/types/document";
import { matchesSearch } from "@/lib/text/search-match";

export type DocumentListItem = Pick<UserDocument, "id" | "title" | "updated_at"> & {
  /** First ~200 characters of the body, for the card's description line. */
  preview?: string | null;
};

/**
 * The Documents list, on the same layout every other list uses.
 *
 * Documents are ordered by updated_at rather than created_at (the most
 * recently edited note is the one you want), so the shared
 * useSortAndPaginate — which sorts on `created_at` — is fed updated_at
 * under that name instead of being generalised: one alias here beats a
 * type parameter threaded through every list in the app.
 */
export function DocumentsList({
  documents,
  favoritedIds,
}: {
  documents: DocumentListItem[];
  favoritedIds: string[];
}) {
  const t = useTranslations("dashboard.documents");
  const tModule = useTranslations("module");
  const formatRelativeTime = useFormatRelativeTime();
  const [query, setQuery] = useState("");
  const favorited = useMemo(() => new Set(favoritedIds), [favoritedIds]);

  const sortable = useMemo(
    () => documents.map((doc) => ({ ...doc, created_at: doc.updated_at })),
    [documents]
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return sortable;
    return sortable.filter((doc) =>
      matchesSearch(`${doc.title ?? ""} ${doc.preview ?? ""}`, q)
    );
  }, [sortable, query]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, paginated, alphabetical } =
    useSortAndPaginate(filtered, query, (d) => d.title ?? "");

  return (
    <ListLayout
      newAction={<NewDocumentButton label={t("newDocument")} />}
      searchValue={query}
      onSearchChange={setQuery}
      searchPlaceholder={tModule("searchPlaceholder")}
      filters={<SortToggle sortOrder={sortOrder} onChange={setSortOrder} alphabetical={alphabetical} />}
      meta={
        <span className="text-xs text-muted">
          {tModule("resultCount", { count: filtered.length, total: documents.length })}
        </span>
      }
    >
      {documents.length === 0 ? (
        <EmptyState icon={FileText}>
          <p className="text-base font-semibold text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("emptyHint")}</p>
          <div className="mt-5 flex justify-center">
            <NewDocumentButton label={t("newDocument")} large />
          </div>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
      ) : (
        <>
          <CardGrid>
            {paginated.map((doc, i) => {
              const title = doc.title || t("untitled");
              return (
                <EntityCard
                  key={doc.id}
                  index={i}
                  icon={FileText}
                  accentSlug="documents"
                  title={title}
                  description={doc.preview || null}
                  href={`/dashboard/documents/${doc.id}`}
                  tags={[
                    {
                      key: "updated",
                      label: t("updatedAt", { when: formatRelativeTime(doc.updated_at) }),
                    },
                  ]}
                  corner={
                    <FavoriteButton
                      table="user_documents"
                      recordId={doc.id}
                      headline={title}
                      initialFavorited={favorited.has(doc.id)}
                      variant="inline"
                    />
                  }
                  menuLabel={tModule("actionsFor", { name: title })}
                  menuExtra={(close) => (
                    <DeleteButton
                      variant="menuItem"
                      onActivate={close}
                      table="user_documents"
                      id={doc.id}
                      label={t("deleteLabel")}
                      itemName={title}
                    />
                  )}
                />
              );
            })}
          </CardGrid>
          <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </ListLayout>
  );
}
