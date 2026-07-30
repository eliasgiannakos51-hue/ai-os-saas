import type { SortOrder } from "@/lib/use-sort-and-paginate";

export function SortToggle({
  sortOrder,
  onChange,
}: {
  sortOrder: SortOrder;
  onChange: (order: SortOrder) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span>Sort:</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-border">
        {(["newest", "oldest"] as const).map((order) => (
          <button
            key={order}
            type="button"
            onClick={() => onChange(order)}
            aria-pressed={sortOrder === order}
            className={`min-h-[40px] px-3 py-1.5 capitalize transition-colors duration-150 sm:min-h-0 ${
              sortOrder === order
                ? "bg-orange-500/10 text-orange-400"
                : "text-muted hover:text-foreground"
            }`}
          >
            {order}
          </button>
        ))}
      </div>
    </div>
  );
}
