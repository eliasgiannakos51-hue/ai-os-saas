// THE registry of every table that holds personal data, and what each one
// means for the two GDPR rights this app has to honour: access (Art. 15,
// the data export) and erasure (Art. 17, delete account).
//
// Why a registry rather than a list inside the export route: the export
// was built from CLASSIFIER_MODULES — the 13 tables behind "Create
// Anything". That was never a statement about personal data; it was a
// list of things the router can file an entry into. Everything else the
// user had ever created — every chat message, every mission, every
// website, every uploaded file, their whole credit history — was simply
// absent from their export, silently, with the button still saying
// "Export all". The two lists had no reason to agree and no mechanism to
// notice when they diverged.
//
// So: one list, in one place, with an explicit decision recorded per
// table, and a test that fails when a new table with a user_id appears
// and is not classified here. Adding a table to the schema now forces a
// deliberate answer to "is this personal data?" instead of defaulting to
// "not exported, nobody noticed".

/** How a table's rows are tied to a person. */
export type UserDataScope =
  /** Ordinary content the user created. Exported in full. */
  | "user_content"
  /** Account/billing records. Exported: they are the user's data too. */
  | "account"
  /** Security or operational records that ARE personal data but must be
   *  redacted rather than dumped verbatim (tokens, device fingerprints). */
  | "sensitive_redacted"
  /** Not personal data: aggregate counters with no user column. */
  | "not_personal";

export type UserDataTable = {
  table: string;
  /** Key in the export payload. Human-readable, stable across releases. */
  label: string;
  scope: UserDataScope;
  /** Columns stripped before export — secrets that belong to the account
   *  but must never be written into a file the user emails to themselves. */
  redactColumns?: string[];
  /** Set when the row is NOT removed by `auth.users` cascade and therefore
   *  needs explicit deletion. See erasureNote for why. */
  needsExplicitErasure?: boolean;
  erasureNote?: string;
};

// Every table carrying a user_id, classified. Ordered roughly as a person
// would expect to read their own life back.
export const USER_DATA_TABLES: UserDataTable[] = [
  // --- The 13 module tables (what the old export covered) ---
  { table: "ideas", label: "ideas", scope: "user_content" },
  { table: "competitors", label: "competitors", scope: "user_content" },
  { table: "research", label: "research_entries", scope: "user_content" },
  { table: "finance_entries", label: "finance", scope: "user_content" },
  { table: "learning_entries", label: "learning", scope: "user_content" },
  { table: "trades", label: "trades", scope: "user_content" },
  { table: "decisions", label: "decisions", scope: "user_content" },
  { table: "products", label: "products", scope: "user_content" },
  { table: "content", label: "content", scope: "user_content" },
  { table: "leads", label: "leads", scope: "user_content" },
  { table: "feedback", label: "feedback", scope: "user_content" },
  { table: "metrics", label: "metrics", scope: "user_content" },
  { table: "automations", label: "automations_module", scope: "user_content" },

  // --- Everything the old export silently omitted ---
  { table: "chat_conversations", label: "chat_conversations", scope: "user_content" },
  { table: "chat_messages", label: "chat_messages", scope: "user_content" },
  { table: "chat_memory", label: "chat_memory", scope: "user_content" },
  { table: "ai_missions", label: "missions", scope: "user_content" },
  { table: "user_websites", label: "websites", scope: "user_content" },
  { table: "website_versions", label: "website_versions", scope: "user_content" },
  { table: "published_sites", label: "published_sites", scope: "user_content" },
  { table: "site_versions", label: "published_site_versions", scope: "user_content" },
  { table: "site_analytics", label: "published_site_analytics", scope: "user_content" },
  // Navigation telemetry: one row per sidebar click, holding a page path
  // and a timestamp and nothing else (supabase/migrations/
  // 20260817000004_nav_events.sql spells out what is deliberately not
  // there). Exported IN FULL rather than redacted — there is nothing in
  // it to redact, and "we collected this about you" is precisely what an
  // Article 15 export is for. Cascades with auth.users like the rest, so
  // no explicit erasure; separately deleted after 90 days by
  // api/cron/prune-nav-events, and switchable off in Settings.
  { table: "nav_events", label: "navigation_history", scope: "user_content" },
  { table: "website_form_submissions", label: "website_form_submissions", scope: "user_content" },
  { table: "website_reference_images", label: "website_reference_images", scope: "user_content" },
  { table: "user_agents", label: "agents", scope: "user_content" },
  { table: "agent_runs", label: "agent_runs", scope: "user_content" },
  { table: "scheduled_agent_runs", label: "scheduled_agent_runs", scope: "user_content" },
  { table: "ai_agents", label: "agent_tracker_entries", scope: "user_content" },
  { table: "user_automations", label: "automations_scheduled", scope: "user_content" },
  { table: "user_files", label: "files", scope: "user_content" },
  { table: "file_collections", label: "file_collections", scope: "user_content" },
  { table: "file_collection_items", label: "file_collection_items", scope: "user_content" },
  { table: "user_documents", label: "documents", scope: "user_content" },
  { table: "research_reports", label: "research_reports", scope: "user_content" },
  // Background job rows. `input` holds the user's own words — the agent
  // they described, the question they asked — and `result` holds what came
  // back, so a job row is user content in the ordinary sense and has to be
  // exported and erased like any other.
  { table: "ai_jobs", label: "background_jobs", scope: "user_content" },
  { table: "user_insights", label: "insights", scope: "user_content" },
  // In-app notifications. An agent delivering "in_app" writes its whole
  // result into the body, so these rows hold the same content an emailed
  // briefing would — user content in the ordinary sense.
  { table: "user_notifications", label: "notifications", scope: "user_content" },
  { table: "user_favorites", label: "favorites", scope: "user_content" },
  { table: "entity_links", label: "entity_links", scope: "user_content" },
  { table: "user_energy_checkins", label: "energy_checkins", scope: "user_content" },
  { table: "user_achievements", label: "achievements", scope: "user_content" },
  { table: "user_imports", label: "imports", scope: "user_content" },
  { table: "create_requests", label: "create_requests", scope: "user_content" },
  { table: "ai_apps", label: "ai_apps", scope: "user_content" },
  { table: "ai_campaigns", label: "ai_campaigns", scope: "user_content" },
  { table: "ai_coding_requests", label: "ai_coding_requests", scope: "user_content" },
  { table: "ai_data_analysis_requests", label: "ai_data_analysis_requests", scope: "user_content" },
  { table: "ai_documents", label: "ai_documents", scope: "user_content" },
  { table: "ai_images", label: "ai_images", scope: "user_content" },
  { table: "ai_presentations", label: "ai_presentations", scope: "user_content" },
  { table: "ai_videos", label: "ai_videos", scope: "user_content" },
  { table: "ai_websites", label: "ai_website_entries", scope: "user_content" },

  // --- Account, billing and preferences ---
  { table: "user_credits", label: "credits_balance", scope: "account" },
  { table: "credit_transactions", label: "credit_transactions", scope: "account" },
  { table: "credit_reservations", label: "credit_reservations", scope: "account" },
  { table: "ai_cost_log", label: "ai_usage_log", scope: "account" },
  { table: "user_onboarding", label: "onboarding", scope: "account" },
  { table: "user_email_preferences", label: "email_preferences", scope: "account" },
  { table: "email_send_log", label: "emails_sent_to_you", scope: "account" },
  { table: "account_deletion_requests", label: "account_deletion_requests", scope: "account" },

  // --- Sensitive: exported, but with the secret columns stripped ---
  {
    table: "user_integrations",
    label: "connected_accounts",
    scope: "sensitive_redacted",
    // OAuth material. The user is entitled to know WHICH accounts are
    // connected and when — they are not served by having a live access
    // token written into a JSON file in their Downloads folder.
    redactColumns: ["access_token_encrypted", "refresh_token_encrypted"],
  },
  { table: "integration_sync_log", label: "integration_sync_log", scope: "account" },
  {
    table: "user_delivery_channels",
    label: "delivery_channels",
    scope: "sensitive_redacted",
    // Same reasoning as the OAuth tokens above, and if anything stronger.
    // The user is entitled to know that a Telegram bot and a Discord
    // webhook are connected, when, and to which chat — they are not
    // served by a working bot token and a live webhook URL sitting in a
    // JSON file in their Downloads folder, where the webhook in
    // particular is a permanent right to post into their server that
    // nothing revokes.
    redactColumns: ["secret_encrypted"],
  },
  {
    table: "push_subscriptions",
    label: "push_subscriptions",
    scope: "sensitive_redacted",
    // The endpoint + keys are a working capability to push to the
    // device. Exporting them verbatim hands that capability to anyone
    // who later reads the file.
    redactColumns: ["endpoint", "p256dh", "auth"],
  },
  {
    table: "known_devices",
    label: "known_devices",
    scope: "sensitive_redacted",
    redactColumns: ["device_fingerprint", "ip_address"],
  },
  { table: "security_check_log", label: "security_checks", scope: "account" },

  // --- The one that does NOT cascade ---
  {
    table: "production_errors",
    label: "production_errors",
    scope: "sensitive_redacted",
    // Crash reports. Not exported as content (they are our diagnostics,
    // and one row can name several users), but they DO carry the user's
    // id and therefore have to be erased.
    redactColumns: ["stack_trace", "error_message", "affected_user_ids"],
    needsExplicitErasure: true,
    erasureNote:
      "production_errors.user_id is a bare uuid with NO foreign key to auth.users, and affected_user_ids is a uuid[] that no foreign key could cover. Neither is touched by deleteUser()'s cascade, so both are scrubbed explicitly by the forget_user_in_production_errors() RPC before the auth user is removed.",
  },
  // Exit survey answers from self-service cancellation. The note is free
  // text a person typed about their own account, so it is personal data
  // and belongs in their export — an "anonymous feedback" label on a row
  // that carries user_id would be a claim the schema contradicts. The FK
  // is on delete cascade, so erasure needs no explicit pass.
  { table: "subscription_cancellations", label: "subscription_cancellations", scope: "account" },
];

/** Tables with no user column at all — recorded so the coverage test can
 *  tell "deliberately excluded" from "forgotten". */
export const NON_PERSONAL_TABLES = [
  // Per-day aggregate spend counter, no user column.
  "daily_ai_spend_tracking",
  // Keyed by IP/route fingerprint, not by user.
  "rate_limit_log",
  // Keyed by team + invited email; rows belong to the team owner's
  // account and are covered via the team tables' own cascade.
  "team_members",
];

/** Everything the export route reads. */
export function exportableTables(): UserDataTable[] {
  return USER_DATA_TABLES.filter((t) => t.scope !== "not_personal");
}

/** Tables that deleteUser()'s cascade will NOT clear. */
export function tablesNeedingExplicitErasure(): UserDataTable[] {
  return USER_DATA_TABLES.filter((t) => t.needsExplicitErasure);
}

/** Strips the columns a table is not allowed to export verbatim. */
export function redactRow(
  row: Record<string, unknown>,
  redactColumns: string[] | undefined
): Record<string, unknown> {
  if (!redactColumns || redactColumns.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = redactColumns.includes(k) ? "[redacted]" : v;
  }
  return out;
}
