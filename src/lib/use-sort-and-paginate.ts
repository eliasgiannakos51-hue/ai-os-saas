import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { textComparator } from "@/lib/text/search-match";

export type SortOrder = "newest" | "oldest" | "az" | "za";

export const DATE_SORT_ORDERS = ["newest", "oldest"] as const;
export const ALPHABETICAL_SORT_ORDERS = ["az", "za"] as const;

export const PAGE_SIZE = 20;

/**
 * Shared sort + pagination for every list in the app.
 *
 * ALPHABETICAL ORDERING IS LOCALE-AWARE. Passing `labelOf` turns on the A–Z
 * and Z–A orders, and they compare through Intl.Collator for the user's
 * current locale rather than through `<` or a bare `.sort()`.
 *
 * That is not a nicety. The default comparison is on UTF-16 code units, and
 * in Greek every accented vowel lives in a different block from its
 * unaccented form — so "Άλφα" sorts after "Ωμέγα", and "Καφές" separates
 * from "Καφε". German and Swedish disagree with each other about where ä
 * belongs; only a collator built for the reader's language gets any of this
 * right. Same reasoning, and the same shared helper, as the accent-folding
 * that fixed search (lib/text/search-match.ts).
 *
 * `labelOf` is optional so the existing date-only call sites keep working
 * unchanged; a list that does not supply it simply never offers the
 * alphabetical orders, and `alphabetical` below tells the toggle so.
 */
export function useSortAndPaginate<T extends { created_at: string }>(
  items: T[],
  resetKey: unknown,
  labelOf?: (item: T) => string
) {
  const locale = useLocale();
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [page, setPage] = useState(1);

  const compareText = useMemo(() => textComparator(locale), [locale]);

  const sorted = useMemo(() => {
    const copy = [...items];
    if (labelOf && (sortOrder === "az" || sortOrder === "za")) {
      copy.sort((a, b) => {
        const diff = compareText(labelOf(a), labelOf(b));
        return sortOrder === "az" ? diff : -diff;
      });
      return copy;
    }
    copy.sort((a, b) => {
      const diff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return copy;
    // labelOf is typically an inline arrow and would change identity every
    // render; the sort depends on the ORDER, the items and the collator, and
    // re-reading a label through a fresh closure over the same data cannot
    // change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortOrder, compareText]);

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

  return {
    sortOrder,
    setSortOrder,
    page,
    setPage,
    totalPages,
    sorted,
    paginated,
    /** Whether this list can offer A–Z / Z–A at all. */
    alphabetical: Boolean(labelOf),
  };
}
