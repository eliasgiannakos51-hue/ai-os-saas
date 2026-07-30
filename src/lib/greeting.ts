export function timeOfDayGreeting(date: Date = new Date()): { text: string; emoji: string } {
  const hour = date.getHours();
  if (hour < 12) return { text: "Good morning", emoji: "☀️" };
  if (hour < 18) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
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
