import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationControls({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg border border-border px-3 transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:py-1.5"
      >
        <ChevronLeft className="h-4 w-4" /> Prev
      </button>
      <span>
        Page {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg border border-border px-3 transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:py-1.5"
      >
        Next <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
