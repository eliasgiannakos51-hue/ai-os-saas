/**
 * The three settings a switch can have (MASTER Μέρος 13 Β). Kept apart from
 * src/lib/flags/flags.ts, which reads the environment and the database, so
 * the owner's panel (components/system-health/feature-flags.tsx) can name
 * the type without pulling server code into the browser.
 */
export type FlagAudience = "off" | "staff" | "everyone";

export const FLAG_AUDIENCES: readonly FlagAudience[] = ["off", "staff", "everyone"];
