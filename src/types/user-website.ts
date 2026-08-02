export type UserWebsite = {
  id: string;
  user_id: string;
  name: string;
  html_content: string;
  // Superseded by website_reference_images (below) — no longer written by
  // the app, kept only because the column still exists on already-created
  // rows. See WebsiteReferenceImage for the current multi-image model.
  reference_image_url: string | null;
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
