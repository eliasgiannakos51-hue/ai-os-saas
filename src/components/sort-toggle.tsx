"use client";

import { useTranslations } from "next-intl";
import type { SortOrder } from "@/lib/use-sort-and-paginate";

export function SortToggle({
  sortOrder,
  onChange,
  /**
   * Whether the list can order itself alphabetically — true when the caller
   * gave useSortAndPaginate a label accessor. Off by default so a list that
   * has no meaningful label never shows an A–Z button that would do nothing.
   */
  alphabetical = false,
}: {
  sortOrder: SortOrder;
  onChange: (order: SortOrder) => void;
  alphabetical?: boolean;
}) {
  const t = useTranslations("module.sort");
  const orders: SortOrder[] = alphabetical
    ? ["newest", "oldest", "az", "za"]
    : ["newest", "oldest"];

  return (
    // WRAPS: in Greek on a 375px phone the label and four orders are a few
    // pixels wider than the screen (layout-stress.prodtest.mjs, 2026-10-05),
    // so the label goes above the orders rather than past the edge.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{t("label")}</span>
      <div className="inline-flex items-center gap-0.5 rounded-full border border-border p-0.5">
        {orders.map((order) => (
          <button
            key={order}
            type="button"
            onClick={() => onChange(order)}
            aria-pressed={sortOrder === order}
            className={`min-h-[44px] rounded-full px-3.5 py-1.5 font-medium transition-colors duration-150 ${
              sortOrder === order
                ? "bg-foreground text-background"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t(order)}
          </button>
        ))}
      </div>
    </div>
  );
}
