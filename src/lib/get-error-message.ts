// THERE IS NO DEFAULT FALLBACK ANY MORE, and that is the point.
//
// It used to be `"Something went wrong. Please try again."` — a string
// that is English in a Greek UI, and that tells the reader nothing they
// did not already know. It was reachable from eighteen call sites that
// simply omitted the second argument, and omitting an optional argument is
// not a decision anyone makes on purpose; it is what happens when the
// parameter is optional.
//
// So `fallback` is required. A caller that has nothing translated to say
// now fails to compile instead of shipping the English sentence, and the
// choice of what the user reads is made at the call site by someone who
// knows which action just failed.
//
// For anything that came back from one of our own API routes, prefer
// lib/errors/use-error-text.ts over this: it produces the three sentences
// (what happened, what to do, whether you were charged) from the response
// status, rather than surfacing whatever prose the server happened to
// write. This function remains for the errors that are NOT ours —
// Supabase auth failures, mostly — where the message is the only
// information there is.

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

export function getErrorMessage(error: unknown, fallback: string): string {
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
