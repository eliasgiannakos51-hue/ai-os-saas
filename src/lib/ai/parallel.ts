/**
 * Bounded-concurrency map (V3 Task 14 — parallel thinking).
 *
 * The naive fix for a sequential AI loop is Promise.all, and it is
 * wrong here: six concurrent search-enabled calls is a burst that trips
 * the provider's own rate limits on a busy account, and the failure
 * mode is a report silently missing a third of its research. A POOL
 * keeps N in flight — the latency win of parallelism without the burst.
 *
 * Results come back IN INPUT ORDER regardless of completion order, so
 * callers that build documents from the results stay deterministic. A
 * rejection carries through to the caller exactly like the sequential
 * loop's would — no silently-dropped items.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(Math.floor(limit), items.length));

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
