import "server-only";

type ErrorLogContext = Record<string, string | number | boolean | null | undefined>;

// Supabase (PostgREST/postgres-js) errors are plain objects — { message,
// code, details, hint } — not `instanceof Error`. Every one of this app's
// many `logApiError(endpoint, someSupabaseError, ...)` call sites used to
// fall through to `String(error)` for those, which stringifies a plain
// object to the literal, useless text "[object Object]" — so the *one*
// piece of information Vercel Runtime Logs actually needed (which
// Postgres error, what code) was silently thrown away before it ever
// reached the log. This pulls `message`/`code`/`details`/`hint` off
// anything shaped like a Postgrest error, and JSON.stringifies any other
// non-Error value instead of coercing it to a string.
function describeError(error: unknown): {
  name?: string;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
} {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") {
      return {
        message: e.message,
        code: typeof e.code === "string" ? e.code : undefined,
        details: typeof e.details === "string" ? e.details : undefined,
        hint: typeof e.hint === "string" ? e.hint : undefined,
      };
    }
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: String(error) };
    }
  }

  return { message: String(error) };
}

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
  const { name, message, code, details, hint } = describeError(error);

  console.error(
    JSON.stringify({
      level: "error",
      endpoint,
      timestamp: new Date().toISOString(),
      name,
      message,
      code,
      details,
      hint,
      ...context,
    })
  );
}
