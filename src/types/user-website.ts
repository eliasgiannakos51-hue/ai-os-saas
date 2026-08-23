// 'pending': row just created, generation not started yet server-side.
// 'processing': the background generation call is actually running.
// 'completed': html_content holds the real, finished website.
// 'failed': generation errored — error_message holds why; html_content is
// empty and must not be rendered. Existing rows from before this column
// existed default to 'completed' (see the migration) since they already
// have real html_content.
// 'flagged': the AI Output Protection Layer (lib/website-html-security-scan.ts
// + lib/website-security-review.ts) found a real issue in the generated
// HTML — generation happened and was charged, but html_content is not
// shown/downloadable as normal; error_message holds what was flagged.
// See free_retry_used below for the one complimentary re-generation.
export type UserWebsiteStatus = "pending" | "processing" | "completed" | "failed" | "flagged";

export type UserWebsite = {
  id: string;
  user_id: string;
  name: string;
  html_content: string;
  /** Additional pages beyond the home page, which is html_content itself.
   *  Null on every site built before multi-page support and on every
   *  single-page site since — the column's absence is what makes those
   *  two indistinguishable, which is why there was no backfill. */
  pages?: unknown;
  status: UserWebsiteStatus;
  error_message: string | null;
  // Superseded by website_reference_images (below) — no longer written by
  // the app, kept only because the column still exists on already-created
  // rows. See WebsiteReferenceImage for the current multi-image model.
  reference_image_url: string | null;
  has_reference_images: boolean;
  // Computed once at creation (description length > 5000 chars, or 10+
  // reference images) — see lib/website-generation-limits.ts's
  // isLargeGenerationRequest, whose result this stores so
  // api/websites/status can apply the right stale-job grace period
  // without re-deriving it (the description/image count aren't otherwise
  // available at poll time).
  is_large_request: boolean;
  // Whether this row's one complimentary, no-extra-charge re-generation
  // (offered when status is 'flagged' — see api/websites/generate/route.ts)
  // has already been used. False for every website that was never flagged.
  free_retry_used: boolean;
  // The original generation description — null for rows created before
  // this column existed. See api/websites/[id]/regenerate/route.ts.
  description: string | null;
  created_at: string;
};

// Up to MAX_REFERENCE_IMAGES (see lib/website-builder.ts) rows per
// website — a logo, product photos, a style-reference screenshot, all
// sent together to Claude's vision input at generation time. image_url is
// a Storage path (bucket "website-references"), not a public URL — the
// bucket is private. Only informs generation style/colors; never
// embedded into html_content itself.
export type WebsiteReferenceImage = {
  id: string;
  user_id: string;
  website_id: string;
  image_url: string;
  created_at: string;
};

// One row per generate/edit, oldest to newest by version_number (see
// website_versions in supabase_schema.sql) — user_websites.html_content
// always mirrors the latest version's html_content.
export type WebsiteVersion = {
  id: string;
  user_id: string;
  website_id: string;
  version_number: number;
  html_content: string;
  /** The site's other pages AS OF THIS VERSION. Rollback restores the
   *  whole site, so a version that carried only the home page would
   *  restore a site whose navigation points at pages that are gone. */
  pages?: unknown;
  change_description: string | null;
  created_at: string;
};
