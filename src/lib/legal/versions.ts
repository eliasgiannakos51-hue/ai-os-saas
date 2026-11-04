/**
 * Version identifiers for each legal page. These are stored in the user's
 * metadata at signup/OAuth so we know WHICH version they accepted, not
 * just WHEN (src/app/api/signup/route.ts, src/app/auth/callback/route.ts).
 *
 * Bump the version string here whenever a page's content changes
 * materially. The `updated` prop on each page's LegalLayout should match.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-07-29",
  privacy: "2026-10-07",
  cookies: "2026-08-08",
} as const;

export type LegalDocKey = keyof typeof LEGAL_VERSIONS;
