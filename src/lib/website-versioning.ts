// Website Builder post-generation editing — small, pure versioning helpers
// shared by api/websites/generate/route.ts (seeds version 1) and
// api/websites/edit/route.ts (appends version 2, 3, ...), so the
// numbering rule lives in one place and is unit-testable without a live
// Supabase connection.

export const FIRST_VERSION_NUMBER = 1;

// The next version to append, given how many versions already exist for
// a website — always an append (existingVersionCount + 1), never a reuse
// of an existing version_number, so website_versions stays a real,
// growing history rather than being overwritten in place.
export function nextVersionNumber(existingVersionCount: number): number {
  return existingVersionCount + 1;
}
