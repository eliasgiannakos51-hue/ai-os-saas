// timeZone is an IANA identifier (e.g. "Europe/Athens") — when given, the
// greeting reflects the hour in THAT zone rather than wherever this code
// happens to execute. Server-rendered output has no way to know the
// visitor's zone (Node's own local time isn't it), so callers resolve
// Intl.DateTimeFormat().resolvedOptions().timeZone client-side and pass it
// in; omitting it falls back to the executing environment's local time,
// same behavior as before this existed.
export type GreetingPart = "morning" | "afternoon" | "evening";

// Returns a KEY, not English: the words live in messages/en.json and its
// nine siblings under promise.greeting, so the home page greets in the
// reader's language. It returned "Good morning" literally until 2026-10-03
// (V6 1.10a), which a Greek account read on every visit.
export function timeOfDayGreeting(
  date: Date = new Date(),
  timeZone?: string
): { part: GreetingPart; emoji: string } {
  const hour = timeZone
    ? Number(
        new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(
          date
        )
      )
    : date.getHours();
  if (hour < 12) return { part: "morning", emoji: "☀️" };
  if (hour < 18) return { part: "afternoon", emoji: "🌤️" };
  return { part: "evening", emoji: "🌙" };
}

export const MAX_DISPLAY_NAME_LENGTH = 40;

/**
 * THE NAME THE GREETING USES, OR NONE.
 *
 * In order: what the person typed under Settings → "What should we call
 * you?" (user_metadata.display_name, used exactly as written — in Greek
 * that is the vocative, "Νίκο", which no rule here could derive safely);
 * then the first name a Google sign-in supplies (given_name, or the first
 * word of full_name / name). Otherwise null, and the greeting has no name.
 *
 * NOT the email. A local part like "nikos84" became "Nikos" at best and a
 * handle at worst, which is not anybody's name; a greeting without one
 * reads better than a wrong one.
 */
export function greetingName(metadata: Record<string, unknown> | null | undefined): string | null {
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) : "");
  const chosen = text(metadata?.display_name);
  if (chosen) return chosen;
  const given = text(metadata?.given_name);
  if (given) return given;
  const full = text(metadata?.full_name) || text(metadata?.name);
  if (full) return full.split(/\s+/)[0];
  return null;
}

// Derives a display name from the account's email local-part — this app
// doesn't collect a name at signup, so the email is the only real identity
// data available. "jane.doe99" -> "Jane Doe".
export function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  const words = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return email;

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
