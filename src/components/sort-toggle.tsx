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
      <span>sort:</span>
      <div className="inline-flex overflow-hidden rounded border border-border">
        {(["newest", "oldest"] as const).map((order) => (
          <button
            key={order}
            type="button"
            onClick={() => onChange(order)}
            className={`min-h-[44px] px-3 py-1.5 transition-colors sm:min-h-0 ${
              sortOrder === order
                ? "bg-amber-950/30 text-amber-400"
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
