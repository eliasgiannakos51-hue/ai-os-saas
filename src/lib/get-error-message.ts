const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

// Supabase auth errors (and JS Error instances generally) store `message`
// as a non-enumerable property, so JSON.stringify(error) or {...error}
// silently produces "{}" — always read `.message` directly instead. This
// also guards against non-Error error shapes and empty messages, so a
// caller can pass whatever a catch block hands it and always get a
// display-safe string back, never a raw object.
//
// Some SDKs (observed from Supabase's own error wrapping when the
// underlying failure has no real message, e.g. a malformed upstream
// response) go a step further and set `.message` itself to a useless
// stringified-object value like "{}" or "[object Object]" — a plain
// `.message || fallback` check doesn't catch that, since it's a
// non-empty, truthy string. Treat those as "no message" too.
function isUselessMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed === "" || trimmed === "{}" || trimmed === "[object Object]";
}

export function getErrorMessage(error: unknown, fallback = DEFAULT_FALLBACK): string {
  if (error instanceof Error) {
    return isUselessMessage(error.message) ? fallback : error.message;
  }

  if (typeof error === "string") {
    return isUselessMessage(error) ? fallback : error.trim();
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    return isUselessMessage(message) ? fallback : message.trim();
  }

  return fallback;
}
