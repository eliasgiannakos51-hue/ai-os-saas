import type { WebsiteImageReport } from "@/lib/website-image-brief";

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
  // What the photo step actually did: how many <img> tags got a real
  // library photograph and how many got a seeded placeholder instead.
  //
  // Null for every row generated before this column existed, and that is
  // meaningful rather than empty — "we did not record this" is not the same
  // claim as "every photo is real", and the interface must not make the
  // second claim on the strength of the first.
  //
  // Structured counts rather than a message on purpose: a sentence written
  // here would be an English sentence shown to a Greek user forever.
  image_report: WebsiteImageReport | null;
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
  change_description: string | null;
  created_at: string;
};
