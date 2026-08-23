// Pure constants, deliberately NOT `server-only` — the upload panel is a
// Client Component and needs the same ceiling the route enforces, so the
// browser can refuse a 40MB file before spending a minute uploading it.
// Same split, and the same reason, as lib/email/email-types.ts.
//
// The route enforces it again. A client-side check is a courtesy, never a
// control: it is trivially bypassed and the server is where the limit
// actually lives.

/** The upload ceiling. Larger than most real business exports and small
 *  enough that the parsed rows fit comfortably in one jsonb column — see
 *  the note on data_analyses.rows in the migration. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
