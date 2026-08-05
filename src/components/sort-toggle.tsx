"use client";

import { useTranslations } from "next-intl";
import type { SortOrder } from "@/lib/use-sort-and-paginate";

export function SortToggle({
  sortOrder,
  onChange,
}: {
  sortOrder: SortOrder;
  onChange: (order: SortOrder) => void;
}) {
  const t = useTranslations("module.sort");

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span>{t("label")}</span>
      <div className="inline-flex items-center gap-0.5 rounded-full border border-border p-0.5">
        {(["newest", "oldest"] as const).map((order) => (
          <button
            key={order}
            type="button"
            onClick={() => onChange(order)}
            aria-pressed={sortOrder === order}
            className={`min-h-[36px] rounded-full px-3.5 py-1.5 font-medium transition-colors duration-150 sm:min-h-0 ${
              sortOrder === order
                ? "bg-orange-500 text-black"
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
