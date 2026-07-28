import { useEffect, useMemo, useState } from "react";

export type SortOrder = "newest" | "oldest";

export const PAGE_SIZE = 20;

export function useSortAndPaginate<T extends { created_at: string }>(
  items: T[],
  resetKey: unknown
) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const diff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return copy;
  }, [items, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  // Jump back to page 1 whenever the filtered set or sort order changes.
  useEffect(() => {
    setPage(1);
  }, [resetKey, sortOrder]);

  // Keep the current page in range if the set shrinks (e.g. after a delete).
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  return { sortOrder, setSortOrder, page, setPage, totalPages, sorted, paginated };
}
