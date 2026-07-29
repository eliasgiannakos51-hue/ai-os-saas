const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

// Supabase auth errors (and JS Error instances generally) store `message`
// as a non-enumerable property, so JSON.stringify(error) or {...error}
// silently produces "{}" — always read `.message` directly instead. This
// also guards against non-Error error shapes and empty messages, so a
// caller can pass whatever a catch block hands it and always get a
// display-safe string back, never a raw object.
export function getErrorMessage(error: unknown, fallback = DEFAULT_FALLBACK): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "string") {
    return error.trim() || fallback;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    return message.trim() || fallback;
  }

  return fallback;
}
