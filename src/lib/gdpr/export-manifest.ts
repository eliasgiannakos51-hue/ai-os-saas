// What goes into a data export, and — just as importantly — what does
// not, with the reason written next to it.
//
// GDPR Article 20 gives a person the right to receive the personal data
// they provided, in a structured, commonly used, machine-readable form.
// The failure mode is not refusing the request; it is answering it
// INCOMPLETELY, which looks exactly like answering it. An export that
// silently omits a table is a compliance failure nobody notices until
// somebody compares it against what they know they typed in.
//
// THE LIST IS THEREFORE GATED, NOT MAINTAINED BY HAND.
// scripts/tests/gdpr.test.mjs parses supabase_full_project_backup.sql for
// every table and fails the build on any that appears in neither list
// below. So adding a feature table forces a decision about whether it is
// somebody's personal data — at build time, in the pull request that adds
// it, rather than in a subject access request eighteen months later.
//
// This repo has shipped the "a list that drifts from reality" bug before
// (a SECURITY.md naming a renamed test, migrations never appended to the
// backup the RLS gate reads). This is the same class, with a legal
// consequence attached.

export type ExportTable = {
  table: string;
  /** The column holding the subject's id. Not always `user_id`: the
   *  marketplace is the one place a person appears as two different
   *  parties, and team membership as either side of an invitation. */
  column: string;
  /** Columns to select. "*" is deliberate for most: an export that
   *  cherry-picks columns re-creates the omission problem one level
   *  down. Where a narrower list appears, the reason is next to it. */
  select?: string;
};

/**
 * Everything the export includes.
 *
 * Ordered roughly as a person would look for it — their own content
 * first, then the machinery — because a 60-key JSON file is read by a
 * human before it is read by a program.
 */
export const EXPORTED_TABLES: ExportTable[] = [
  // --- the modules they typed into ---
  { table: "ideas", column: "user_id" },
  { table: "competitors", column: "user_id" },
  { table: "research", column: "user_id" },
  { table: "finance_entries", column: "user_id" },
  { table: "learning_entries", column: "user_id" },
  { table: "trades", column: "user_id" },
  { table: "decisions", column: "user_id" },
  { table: "products", column: "user_id" },
  { table: "content", column: "user_id" },
  { table: "leads", column: "user_id" },
  { table: "feedback", column: "user_id" },
  { table: "metrics", column: "user_id" },
  { table: "automations", column: "user_id" },

  // --- the AI trackers ---
  { table: "ai_agents", column: "user_id" },
  { table: "ai_apps", column: "user_id" },
  { table: "ai_campaigns", column: "user_id" },
  { table: "ai_coding_requests", column: "user_id" },
  { table: "ai_data_analysis_requests", column: "user_id" },
  { table: "ai_documents", column: "user_id" },
  { table: "ai_images", column: "user_id" },
  { table: "ai_missions", column: "user_id" },
  { table: "ai_presentations", column: "user_id" },
  { table: "ai_videos", column: "user_id" },
  { table: "ai_websites", column: "user_id" },

  // --- things they made ---
  { table: "user_websites", column: "user_id" },
  { table: "website_versions", column: "user_id" },
  { table: "website_reference_images", column: "user_id" },
  { table: "published_sites", column: "user_id" },
  { table: "site_versions", column: "user_id" },
  { table: "user_documents", column: "user_id" },
  { table: "user_presentations", column: "user_id" },
  { table: "presentation_versions", column: "user_id" },
  { table: "user_agents", column: "user_id" },
  { table: "agent_runs", column: "user_id" },
  { table: "user_automations", column: "user_id" },
  { table: "scheduled_agent_runs", column: "user_id" },
  { table: "research_reports", column: "user_id" },
  { table: "create_requests", column: "user_id" },
  { table: "entity_links", column: "user_id" },

  // --- files ---
  // The extracted TEXT is included; the bytes in the bucket are not, and
  // the export says so in its own README rather than leaving a person to
  // discover it. Streaming a private bucket into a JSON response would
  // turn a data export into an arbitrary-size download with no way to
  // resume it.
  { table: "user_files", column: "user_id" },
  { table: "file_collections", column: "user_id" },
  { table: "file_collection_items", column: "user_id" },

  // --- conversations ---
  { table: "chat_conversations", column: "user_id" },
  { table: "chat_messages", column: "user_id" },
  // What the assistant remembered about them. Arguably the single most
  // important table in this export: it is the only place the product
  // holds inferences it made rather than statements they typed.
  { table: "chat_memory", column: "user_id" },

  // --- account and wellbeing ---
  { table: "user_credits", column: "user_id" },
  { table: "credit_transactions", column: "user_id" },
  { table: "credit_reservations", column: "user_id" },
  { table: "ai_cost_log", column: "user_id" },
  { table: "user_achievements", column: "user_id" },
  { table: "user_energy_checkins", column: "user_id" },
  { table: "user_email_preferences", column: "user_id" },
  { table: "email_send_log", column: "user_id" },
  // Security metadata ABOUT them — the devices that logged in. Personal
  // data by any reading, and the sort a person is most likely to want.
  { table: "known_devices", column: "user_id" },

  // --- integrations ---
  // Selected narrowly, and this is the one narrowing that matters: the
  // token columns are AES-256-GCM ciphertext of somebody's Gmail and
  // Drive credentials. Exporting them would put live credentials into a
  // file that lands in a downloads folder, which is a worse outcome for
  // the subject than the omission — and they are not "data they
  // provided" in any useful sense, they are a key to a different
  // building.
  {
    table: "user_integrations",
    column: "user_id",
    select: "id, provider, status, scopes, connected_at, last_synced_at, external_account_label",
  },
  { table: "integration_sync_log", column: "user_id" },

  // --- marketplace ---
  // The one place a person is two different parties, so they appear
  // under two different columns and both are exported.
  { table: "seller_accounts", column: "user_id" },
  { table: "marketplace_listings", column: "seller_id" },
  { table: "marketplace_listing_payloads", column: "seller_id" },
  { table: "marketplace_purchases", column: "buyer_id" },
  { table: "marketplace_reviews", column: "buyer_id" },
  { table: "site_analytics", column: "user_id" },

  // --- affiliate ---
  { table: "affiliate_accounts", column: "user_id" },
  // Scoped to the AFFILIATE's side, and narrowed to drop
  // `referred_user_id`. The rest of the row is this subject's data — when
  // somebody signed up through their link, whether it converted, when the
  // commission window closes — but the referred person's account id is
  // somebody else's identifier, and there is no reason it needs to be in
  // a file that lands in a downloads folder.
  //
  // The referred side is deliberately not surfaced at all: "who gets paid
  // for you" is not information that person was given, and RLS does not
  // grant them the row, so this export (which reads through their own
  // client) correctly returns nothing for them.
  {
    table: "affiliate_referrals",
    column: "affiliate_user_id",
    select: "id, code, signed_up_at, first_paid_at, commission_ends_at, created_at",
  },
  { table: "affiliate_commissions", column: "affiliate_user_id" },

  // --- team ---
  // Membership is an edge between two people. Exported from the side the
  // subject is on; the other person's rows are theirs, not this
  // subject's, and are not included by exporting the whole table.
  { table: "team_members", column: "owner_id" },
];

/**
 * Tables deliberately left out.
 *
 * Every entry needs a reason, and the reasons are of exactly three
 * kinds: it is not personal data at all, it is a live credential, or
 * including it would harm the subject more than omitting it. "It did not
 * seem important" is not on that list.
 */
export const EXCLUDED_TABLES: { table: string; reason: string }[] = [
  {
    table: "daily_ai_spend_tracking",
    reason:
      "platform-wide totals across all accounts, with no user column. Not the subject's data, and exporting it would disclose other people's aggregate usage.",
  },
  {
    table: "rate_limit_log",
    reason:
      "operational counters keyed by an opaque identifier (a user id or an IP), holding no content. Retained briefly for abuse prevention; nothing in it is data the subject provided.",
  },
  {
    table: "account_deletion_requests",
    reason:
      "holds a hash of a LIVE deletion token. Putting it in a downloadable file would place a credential that erases the account into a downloads folder. The fact that a deletion was requested is already visible to the subject in their inbox.",
  },
];

/** A per-table cap. An export must not be able to hold a serverless
 *  function open until it times out, and a person with 40,000 chat
 *  messages needs the file to arrive more than they need row 40,001.
 *  The manifest reports what it truncated rather than truncating
 *  silently — an export that quietly stops is the incompleteness this
 *  whole file exists to prevent. */
export const MAX_ROWS_PER_TABLE = 5000;
