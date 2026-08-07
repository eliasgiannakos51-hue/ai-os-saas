// Model identifiers for the import mapper and the insight narrator, in a
// client-safe module for the same reason lib/ai-models.ts,
// lib/agents/agent-models.ts and lib/files/file-models.ts exist: the
// credit estimate shown before the user commits runs in the browser and
// has to price the SAME model the server will call.

/** Maps spreadsheet columns onto module fields. A small, structured job
 *  — the whole file never reaches it, only a sample. */
export const IMPORT_MAPPER_MODEL = "claude-sonnet-4-6";

/** Phrases findings the detectors already computed. Also small: it is
 *  given facts and asked for grammar. */
export const INSIGHT_MODEL = "claude-sonnet-4-6";

/** Turns pasted free text into structured entries. */
export const PASTE_MODEL = "claude-sonnet-4-6";
