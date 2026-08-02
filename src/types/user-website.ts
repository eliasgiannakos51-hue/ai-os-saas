export type UserWebsite = {
  id: string;
  user_id: string;
  name: string;
  html_content: string;
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
