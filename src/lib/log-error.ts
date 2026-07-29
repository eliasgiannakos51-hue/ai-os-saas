import "server-only";

type ErrorLogContext = Record<string, string | number | boolean | null | undefined>;

// Structured, PII-free error log for API routes — written to stderr so it
// shows up in Vercel's deployment/function logs (Functions tab → a given
// invocation, or `vercel logs`). Callers must not pass request bodies,
// emails, or other user-supplied content as context — only safe metadata
// (status codes, counts, non-identifying flags).
export function logApiError(
  endpoint: string,
  error: unknown,
  context?: ErrorLogContext
): void {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      endpoint,
      timestamp: new Date().toISOString(),
      name,
      message,
      ...context,
    })
  );
}
