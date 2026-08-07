// The paste step's limits, in a client-safe module.
//
// lib/import/paste.ts is `server-only` (it constructs an Anthropic
// client), and the textarea has to enforce the same ceiling the route
// does — a limit the UI does not know is a limit the user only meets as
// a 400 after writing 20,000 characters.

export const MAX_PASTE_CHARS = 20_000;
export const MIN_PASTE_CHARS = 30;

/** Entries one paste may produce. A cap the model cannot argue with. */
export const MAX_PASTE_ENTRIES = 40;
