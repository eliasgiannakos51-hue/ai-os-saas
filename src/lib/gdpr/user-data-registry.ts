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
  | "not_personal"
  /** PERSONAL DATA that is a DERIVED COPY of rows exported elsewhere
   *  under their own labels. Not exported — an export containing the
   *  same sentence twice, once as the record and once as its search
   *  entry, is a worse answer to "give me my data" than one containing
   *  it once. Erased by the same cascade as the row it copies. */
  | "derived_index";

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
  /**
   * Whether anything in the product still WRITES this table.
   *
   *   legacy       a feature that has been replaced. Nothing writes it
   *                any more; rows from before the replacement are still
   *                there, and are still that person's data.
   *   provisioned  the schema exists, the feature is not wired yet. The
   *                table is empty today.
   *
   * NOT A ROUTE OUT OF THE EXPORT, and this field was very nearly the
   * opposite of that. The instruction it was written for was to take six
   * "dead" tables OUT of this registry with a comment. Three things were
   * wrong with that:
   *
   *   1. It is not a list of what the UI uses. gdpr-coverage.test.mjs
   *      reads the SCHEMA and fails when a table with a user_id is not
   *      classified here. Removing six would turn the build red.
   *   2. ai_agents and ai_documents hold rows — the old Build-module
   *      trackers, left in place on purpose when the real Agents and
   *      Documents features replaced them. Dropping them from the
   *      registry stops those rows being exported (Art. 15) and stops
   *      them being deleted with the account (Art. 17). That is not a
   *      cleanup, it is two breaches.
   *   3. ai_coding_requests is not dead at all. The Developer workspace
   *      template writes a row into it every time somebody presses Quick
   *      Start on the home screen — /api/templates/apply, via
   *      lib/workspace-templates.ts.
   *
   * So the table stays, the export stays, the erasure stays, and what was
   * missing — which of these a reader can expect to be empty, and why —
   * is written down instead.
   */
  status?: "legacy" | "provisioned";
  /** Why it is in that state, in prose. Required when `status` is set. */
  statusNote?: string;
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
  { table: "website_form_submissions", label: "website_form_submissions", scope: "user_content" },
  { table: "website_reference_images", label: "website_reference_images", scope: "user_content" },
  { table: "user_agents", label: "agents", scope: "user_content" },
  { table: "agent_runs", label: "agent_runs", scope: "user_content" },
  { table: "scheduled_agent_runs", label: "scheduled_agent_runs", scope: "user_content" },
  {
    table: "ai_agents",
    label: "agent_tracker_entries",
    scope: "user_content",
    status: "legacy",
    statusNote:
      "The Build-module tracker /dashboard/agents used to render — rows describing an agent the user would go and set up somewhere else. Real agents live in user_agents now and this table was left untouched rather than migrated, so anybody who used the tracker still has rows in it.",
  },
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
  {
    table: "ai_data_analysis_requests",
    label: "ai_data_analysis_requests",
    scope: "user_content",
    status: "legacy",
    statusNote:
      "The old Analysis tracker. /dashboard/data-analysis still READS it so those rows stay visible and searchable, and writes go to data_analyses.",
  },
  {
    table: "ai_documents",
    label: "ai_documents",
    scope: "user_content",
    status: "legacy",
    statusNote:
      "The tracker the Documents module replaced. Research reports were once inserted here and linked from /dashboard/documents/<id>, which was a guaranteed 404 because the editor reads user_documents — see lib/research/report-to-html.ts. Nothing writes it now; the rows from before are still someone's writing.",
  },
  { table: "ai_images", label: "ai_images", scope: "user_content" },
  { table: "ai_presentations", label: "ai_presentations", scope: "user_content" },
  { table: "ai_videos", label: "ai_videos", scope: "user_content" },
  { table: "ai_websites", label: "ai_website_entries", scope: "user_content" },

  // --- Account, billing and preferences ---
  { table: "user_credits", label: "credits_balance", scope: "account" },
  { table: "credit_transactions", label: "credit_transactions", scope: "account" },
  { table: "credit_reservations", label: "credit_reservations", scope: "account" },
  { table: "ai_cost_log", label: "ai_usage_log", scope: "account" },
  // Voice minutes (V4 #19/#2). ACCOUNT scope, and it is a short row: the
  // seconds of speech in and out this month and last, and nothing else.
  // No audio, no transcript, no language, no device — the table has
  // nowhere to put them (see
  // supabase/migrations/20260827000000_voice_usage.sql), which is why
  // there is nothing here to redact. Exported because it is the user's
  // own consumption record, the same as ai_cost_log beside it; removed
  // by the auth.users cascade, so no explicit erasure.
  { table: "voice_usage", label: "voice_minutes", scope: "account" },
  // Which provider served which of this account's model calls, and why
  // (V4 #12). ACCOUNT scope: it is an operational record OF this user's
  // requests, so it is theirs, and it carries no prompt, no completion
  // and no tool arguments — nothing the model was shown or said. Removed
  // by the auth.users cascade.
  { table: "ai_provider_log", label: "ai_provider_routing", scope: "account" },
  // Which MODEL served which of this account's calls, at which tier, and
  // what it cost (V4 #34/#35). ACCOUNT scope for exactly the reason
  // ai_provider_log above is: it is an operational record OF this user's
  // requests, so it is theirs, and it carries no prompt, no completion
  // and no tool arguments — only the feature name, the rule that chose
  // the model, and money. Removed by the auth.users cascade.
  //
  // NOT non-personal, even though the ROUTER only ever reads it in
  // aggregate. The aggregate is our business; the row names a person and
  // says what they asked for and when, and that is theirs.
  { table: "routing_decisions", label: "model_routing", scope: "account" },
  // Which of the user's published sites they paid to un-badge, in which
  // month, for how many credits. ACCOUNT scope: it is a record of a
  // purchase they made, so it is theirs and it belongs in an export —
  // the same reading as credit_transactions beside it. Removed by the
  // auth.users cascade.
  { table: "site_badge_removals", label: "badge_removals", scope: "account" },
  // WHICH SCREENS THIS PERSON OPENED, and when. ACCOUNT scope, and it is
  // the entry in this registry that most needed writing down.
  //
  // Everything else here is data the user PUT somewhere. nav_events is
  // data the product collected ABOUT them without their typing anything
  // — which does not make it less theirs, it makes it more clearly a
  // subject-access matter. A person who asks what we hold on them and
  // gets back their ideas and their invoices, but not the record of
  // every screen they opened for ninety days, has been given an answer
  // that is true and incomplete.
  //
  // NOT "not_personal", even though the only readers are two aggregate
  // views. The aggregate is our business; the row names a person, says
  // where they went and what screen they came from, and that is theirs
  // — the same reading as ai_provider_log and routing_decisions above.
  //
  // It carries no query strings and no identifiers (see
  // 20260915000000_nav_events.sql), so there is nothing to redact: the
  // path is a route name from the app's own list. Removed by the
  // auth.users cascade, and by public.prune_nav_events() after 90 days
  // whether the account is deleted or not.
  { table: "nav_events", label: "navigation_history", scope: "account" },

  // --- Trading journal (V4 #14) ---
  //
  // USER_CONTENT, every one of them: a trade is something the user did
  // and recorded, a rule is something they wrote, and a violation is
  // arithmetic over the two. All of it is theirs and all of it is
  // exported in full. Removed by the auth.users cascade.
  { table: "trading_accounts", label: "trading_accounts", scope: "user_content" },
  { table: "trading_rules", label: "trading_rules", scope: "user_content" },
  { table: "rule_violations", label: "trading_rule_violations", scope: "user_content" },

  // --- Bank and crypto (V4 #15) ---
  //
  // SENSITIVE_REDACTED, and the redaction is the point:
  // access_token_encrypted is a key to a different building, and an
  // export is a file the user emails to themselves. The ciphertext is
  // stripped; everything that describes the CONNECTION — which bank,
  // when, what scopes, what state — is exported, because that is what
  // somebody asking "what do you hold about me" needs to see.
  {
    table: "bank_connections",
    label: "bank_connections",
    scope: "sensitive_redacted",
    redactColumns: ["access_token_encrypted"],
    status: "provisioned",
    statusNote:
      "V4 #15. The schema, its read-only constraints and its secret guard exist; no provider is connected, so nothing writes this yet. Classified now rather than on the day it is wired, because that is the day it would be forgotten.",
  },
  // The transactions themselves are ordinary personal data and are
  // exported whole. There is deliberately no account number or IBAN in
  // this table to redact.
  {
    table: "bank_transactions",
    label: "bank_transactions",
    scope: "user_content",
    status: "provisioned",
    statusNote: "V4 #15, same as bank_connections — schema present, nothing writes it yet.",
  },
  // A PUBLIC address. Nothing here is secret — the schema has nowhere to
  // put a private key — so there is nothing to redact, and saying so is
  // more useful than a redactColumns list that would imply there is.
  {
    table: "crypto_wallets",
    label: "crypto_wallets",
    scope: "user_content",
    status: "provisioned",
    statusNote: "V4 #15, same as the bank tables — a watch-only address list nothing writes yet.",
  },

  // --- Notifications (V4 #18) ---
  //
  // Settings and per-type preferences are the user's own choices and are
  // exported whole. notification_channels holds CIPHERTEXT — a Discord
  // webhook is a credential anybody holding it can post through — so the
  // encrypted target is stripped and everything describing the
  // connection is kept. notification_events is the record of what was
  // sent to them and whether they opened it, which is theirs to see.
  { table: "notification_settings", label: "notification_settings", scope: "account" },
  { table: "notification_preferences", label: "notification_preferences", scope: "account" },
  {
    table: "notification_channels",
    label: "notification_channels",
    scope: "sensitive_redacted",
    redactColumns: ["target_encrypted"],
  },
  { table: "notification_events", label: "notification_delivery_log", scope: "account" },
  // V4 #19 + #20. data_analyses carries the user's UPLOADED FILE, parsed
  // — the rows themselves, not a summary — so it is the single largest
  // piece of their own content in the export and the one they would most
  // want back. Exported whole for the same reason: an export that
  // returned a column profile without the data would be a description of
  // their file rather than their file.
  { table: "data_analyses", label: "data_analyses", scope: "user_content" },
  { table: "data_analysis_charts", label: "data_analysis_charts", scope: "user_content" },
  { table: "data_analysis_questions", label: "data_analysis_questions", scope: "user_content" },
  // Every coding operation, including the notes imported from the old
  // tracker (source = 'note'). ai_coding_requests stays registered too —
  // the import copied rows, it did not move them.
  { table: "code_sessions", label: "code_sessions", scope: "user_content" },
  // V4 #25. What the customer agreed to and what they were charged for
  // it. Both are theirs and both are exported: an overage bill they
  // cannot reconstruct is a bill they have to take on trust, and the
  // consent row is the record of what they agreed to and when.
  { table: "usage_overage_settings", label: "usage_overage_consent", scope: "account" },
  { table: "usage_overage_ledger", label: "usage_overage_charges", scope: "account" },
  { table: "account_addons", label: "addons", scope: "account" },
  { table: "user_onboarding", label: "onboarding", scope: "account" },
  { table: "user_email_preferences", label: "email_preferences", scope: "account" },
  { table: "email_send_log", label: "emails_sent_to_you", scope: "account" },

  // Affiliate programme.
  //
  // ONLY `affiliates` is registered, because this registry addresses
  // tables by a literal `user_id` column and the other three key off
  // `affiliate_id` instead. That is not a gap in ERASURE — affiliates
  // cascades from auth.users and the children cascade from affiliates,
  // so deleting the account removes all four — but it IS a gap in the
  // EXPORT: an affiliate's referral, commission and payout history is
  // their own data and is currently not written into their download.
  // Closing it needs the registry to grow a per-table scoping column;
  // recorded here rather than papered over with entries that would
  // export nothing while looking covered.
  { table: "affiliates", label: "affiliate_account", scope: "account" },
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
    table: "pwa_client_stats",
    label: "pwa_devices",
    // One row per browser this account has used, holding what KIND of
    // device it is — not which device. There is no user agent, no IP and
    // no fingerprint in it, and client_id is a random value minted by the
    // browser itself. It is still the user's data and is exported in full;
    // the cascade on user_id clears it on erasure.
    scope: "user_content",
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

  // --- Derived ---
  //
  // The unified search index (20260824). Every row here is a COPY of the
  // title and body of a row in one of the tables above, written by a
  // trigger, so it is unquestionably personal data — and equally
  // unquestionably already in the export, under the label of the table
  // it came from. Exporting it as well would hand the user each of their
  // own sentences twice.
  //
  // ERASURE IS THE CASCADE. search_index.user_id is
  // `references auth.users(id) on delete cascade`, so deleting the
  // account removes the index entries with it — which is why this is not
  // marked needsExplicitErasure. That is not taken on trust: section 7
  // of scripts/tests/unified-search.dbtest.mjs deletes a user against a
  // real PostgreSQL and asserts the rows are gone.
  { table: "search_index", label: "search_index", scope: "derived_index" },
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
  // V4 #26. Both carry a user_id and NEITHER is exported, which needs
  // saying rather than assuming.
  //
  // They are OUR bookkeeping about a customer, not the customer's own
  // data: what their plan change did to our revenue, and what their
  // subscription contributed to our MRR in a given month. The facts they
  // are derived from — the plan, the price, the invoices — the customer
  // already has, from Stripe and from their own account page, in the form
  // that is actually about them.
  //
  // Exporting these would hand somebody our internal revenue model of
  // them, including the euro figures we attribute to their account, which
  // is a disclosure about the BUSINESS dressed as a subject access
  // request. They are erased with the account either way: both cascade on
  // auth.users, which gdpr-coverage.test.mjs checks separately.
  "subscription_events",
  "subscriber_months",
];

/** Everything the export route reads. */
export function exportableTables(): UserDataTable[] {
  return USER_DATA_TABLES.filter(
    (t) => t.scope !== "not_personal" && t.scope !== "derived_index"
  );
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
