/**
 * Human-readable relative time ("2d ago"), falling back to an absolute date
 * once it's far enough in the past that "N ago" stops being useful.
 *
 * Depends on the current time, so it can render one value on the server and
 * a very slightly different one on the client hydration pass a moment
 * later (rare, and only visible right at a minute/hour boundary) — callers
 * should render it with `suppressHydrationWarning`.
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const diffWeek = Math.floor(diffDay / 7);
  if (diffDay < 30) return `${diffWeek}w ago`;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
