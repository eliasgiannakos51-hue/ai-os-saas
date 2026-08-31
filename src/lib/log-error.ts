import "server-only";
import { scrubMaybe } from "@/lib/scrub-secrets";

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
type ErrorFields = {
  name?: string;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  stack?: string;
};

function readErrorFields(error: unknown): ErrorFields {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? undefined };
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

/**
 * NEVER A CREDENTIAL IN A LOG — enforced here, once, for every route.
 *
 * The three sinks below all read from this function's return value:
 * stderr (Vercel Runtime Logs), the production_errors row that
 * /dashboard/system-health renders as text, and the alert email sent to
 * the owner. Before this, none of them scrubbed, and every API route in
 * the product logs through here — so a provider message that carried a
 * token (an SDK echoing the Authorization header it just sent, a
 * Postgres error carrying a connection string, a fetch failure that
 * includes the URL) reached a log, a database row, a web page and an
 * inbox verbatim. Verified before the fix with a service-role-shaped JWT:
 * it came back out of console.error unchanged.
 *
 * SCRUBBED BY ITERATION, NOT BY LIST. Every field of the returned object
 * is passed through scrubMaybe, rather than each one being named. Naming
 * them is how the next field added — the one somebody adds in a hurry
 * while debugging — arrives unscrubbed while this comment still claims
 * otherwise.
 */
export function describeError(error: unknown): ErrorFields {
  const raw = readErrorFields(error);
  const scrubbed: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) scrubbed[key] = scrubMaybe(value);
  return scrubbed as unknown as ErrorFields;
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
  const { name, message, code, details, hint, stack } = describeError(error);

  // The context is documented as safe metadata, and it is scrubbed
  // anyway. "Callers must not pass secrets" is a rule enforced by
  // nobody across ~200 call sites; this line costs one pass over a
  // handful of short values and removes the question.
  const safeContext: ErrorLogContext = {};
  if (context) {
    for (const [key, value] of Object.entries(context)) safeContext[key] = scrubMaybe(value);
  }

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
      ...safeContext,
    })
  );

  // Persist to production_errors as well, so the owner has one place that
  // answers "is something broken right now". Fire-and-forget on purpose:
  // logging must never slow down or fail the request that is already
  // going wrong, and recordProductionError swallows its own failures.
  // Both fields come from describeError, which is where the scrubbing
  // happens. Reading error.stack directly here — which is what this
  // line used to do — puts an unscrubbed string into a database row
  // that a web page renders.
  void persistAndMaybeAlert({
    message,
    stack: stack ?? null,
    route: endpoint,
    userId: typeof safeContext.userId === "string" ? safeContext.userId : null,
  });
}

async function persistAndMaybeAlert(params: {
  message: string;
  stack: string | null;
  route: string;
  userId: string | null;
}): Promise<void> {
  try {
    const { recordProductionError } = await import("@/lib/production-errors");
    const result = await recordProductionError(params);
    if (!result?.shouldAlert) return;

    const { sendErrorAlertEmail } = await import("@/lib/email/error-alert");
    await sendErrorAlertEmail({
      message: params.message,
      route: params.route,
      occurrenceCount: result.occurrenceCount,
      affectedUsers: result.affectedUsers,
      recentCount: result.recentCount,
    });
  } catch {
    // Never rethrow: this whole path is best-effort telemetry sitting
    // inside the app's own error handler.
  }
}
