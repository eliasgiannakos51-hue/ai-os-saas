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
        className="inline-flex min-h-[44px] items-center justify-center rounded border border-border px-3 transition-colors hover:border-amber-500 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:py-1.5"
      >
        ← prev
      </button>
      <span>
        page {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex min-h-[44px] items-center justify-center rounded border border-border px-3 transition-colors hover:border-amber-500 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:py-1.5"
      >
        next →
      </button>
    </div>
  );
}
