/**
 * AN AUTOMATION IS A ROW OF BOXES (MASTER 16, package 30, for everybody
 * since 2026-10-23; the plan is docs/automations-plan-2026-10-04.md).
 *
 * «όταν ανεβάζω αρχείο, κάνε σύνοψη και βάλ' τη στη Βιβλιοθήκη» is four:
 * start (a file is uploaded) → read (that file) → AI (summarise it) →
 * action (save to the Library). Every box is one thing a person can point
 * at and change with words; the run goes down the row and stops at the
 * first box that says stop.
 *
 * THE SIX KINDS, from MASTER 5.18: start, read data, AI step, condition
 * (whose other branch is "stop here"), approval, action. A call to another
 * tool and a call to a connection are reads and actions here — the
 * calendar is a read through the Calendar connection (package 31), a
 * Telegram message is an action through the person's own bot.
 *
 * Client-safe and pure: the screen draws from it, the routes validate
 * with it, the runner walks it. Held by scripts/tests/automations.test.mjs.
 */

export const MAX_BOXES = 20;
export const MAX_INSTRUCTION_CHARS = 600;

/** A URL a box may carry must be https and not point anywhere private.
 *  Validated at STORE time so a malicious URL is never persisted. */
function sanitiseBoxUrl(raw: string): string | undefined {
  const url = raw.trim().slice(0, 500);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    // Block obvious private/metadata targets at store time; the runner
    // does a full SSRF check at fetch time too (lib/mcp/ssrf.ts).
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
    if (host.endsWith(".local") || host.endsWith(".internal")) return undefined;
    if (host === "169.254.169.254" || host === "metadata.google.internal") return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const; // Monday = 1, as in ISO 8601

export type StartBox =
  | { id: string; kind: "start"; when: "time"; every: "day" | "weekdays" | "week" | "month"; at: string; weekday?: number; monthDay?: number }
  | { id: string; kind: "start"; when: "file_uploaded" }
  | { id: string; kind: "start"; when: "webhook" }
  | { id: string; kind: "start"; when: "new_email" }
  | { id: string; kind: "start"; when: "rss"; url?: string }
  | { id: string; kind: "start"; when: "form_submitted" }
  | { id: string; kind: "start"; when: "chat_message" }
  | { id: string; kind: "start"; when: "app_event"; app?: string }
  | { id: string; kind: "start"; when: "manual" };

export const READ_SOURCES = [
  // Original
  "calendar_today", "calendar_tomorrow", "calendar_week",
  "finances_week", "finances_month", "uploaded_file",
  // Data sources (2026-11-21)
  "google_sheets", "website_scrape", "rss_feed",
  "last_emails", "database_query", "crm_contacts",
  "social_mentions", "analytics_report",
  // Extended data sources (2026-11-21, n8n/Zapier/Make parity)
  "notion_pages", "airtable_records", "google_drive_files",
  "jira_issues", "github_issues", "hubspot_contacts",
  "shopify_orders", "http_request", "pdf_extract",
  "weather_data", "stock_prices", "discord_messages",
  "trello_cards", "asana_tasks", "clickup_tasks",
  "stripe_payments", "typeform_responses", "google_forms",
  // n8n parity (2026-11-24): 20 more read sources
  "salesforce_records", "pipedrive_deals", "zoho_records",
  "monday_items", "linear_issues", "baserow_rows",
  "mysql_query", "postgres_query", "mongodb_query",
  "elasticsearch_query", "bigquery_query",
  "dropbox_files", "onedrive_files", "box_files",
  "zendesk_tickets", "intercom_conversations", "freshdesk_tickets",
  "google_analytics", "mixpanel_events",
  "woocommerce_orders",
] as const;
export type ReadSource = (typeof READ_SOURCES)[number];
export type ReadBox = { id: string; kind: "read"; source: ReadSource; url?: string; config?: Record<string, string> };

export type AiBox = { id: string; kind: "ai"; instruction: string };

/** The one condition: what came before is not empty. Its other branch is "stop, quietly". */
export type ConditionBox = { id: string; kind: "condition"; test: "has_content" };

export type ApprovalBox = { id: string; kind: "approval" };

/**
 * n8n CORE NODE TYPES (2026-11-24).
 *
 * These match n8n's essential utility nodes that make workflows powerful:
 * - filter: IF node — stop if a condition is not met (extends condition)
 * - code: Code node — run custom JavaScript on the data
 * - wait: Wait node — pause for a duration or until a webhook
 * - transform: Edit Fields / Set — reshape data with an instruction
 * - note: Sticky Note — visual annotation on the canvas
 */
export type FilterBox = { id: string; kind: "filter"; expression: string };
export type CodeBox = { id: string; kind: "code"; language: "javascript" | "python"; code: string };
export type WaitBox = { id: string; kind: "wait"; duration: number; unit: "seconds" | "minutes" | "hours" | "days" };
export type TransformBox = { id: string; kind: "transform"; instruction: string };
export type NoteBox = { id: string; kind: "note"; text: string };

/**
 * n8n ADVANCED NODE TYPES (2026-11-24).
 *
 * - error_handler: Try/Catch — if any downstream box fails, jump to fallback
 * - loop: Loop Over Items — repeat the next box(es) for each item
 * - split: Split In Batches — split data into smaller chunks
 * - merge: Merge — combine results from multiple paths
 * - delay: Delay — wait a fixed time between items (rate limiting)
 */
export type ErrorHandlerBox = { id: string; kind: "error_handler"; fallbackAction: "continue" | "stop" | "retry"; retryCount?: number; retryDelay?: number };
export type LoopBox = { id: string; kind: "loop"; maxIterations: number };
export type SplitBox = { id: string; kind: "split"; batchSize: number };
export type MergeBox = { id: string; kind: "merge"; mode: "append" | "combine" | "choose_branch" };
export type DelayBox = { id: string; kind: "delay"; delay: number; unit: "seconds" | "minutes" | "hours" };

/**
 * n8n DATA TRANSFORMATION + FLOW CONTROL NODES (2026-11-24, round 2).
 *
 * Data transformation (n8n core):
 * - sort: Sort — sort items by a field
 * - limit: Limit — keep only the first N items
 * - remove_duplicates: Remove Duplicates — deduplicate by field
 * - summarize: Summarize — aggregate (count, sum, avg, min, max)
 * - switch: Switch/Router — route to different branches based on value
 * - set: Set — set/rename fields (n8n's most used utility node)
 * - compare: Compare Datasets — diff two data sets
 * - date_time: Date & Time — format, parse, calculate dates
 * - html_extract: HTML — extract data from HTML
 * - xml_parse: XML — parse or build XML
 * - aggregate: Aggregate — combine items into one
 * - text_classifier: Text Classifier — classify text into categories
 * - sentiment: Sentiment Analysis — positive/negative/neutral
 * - extract_info: Information Extractor — pull structured data from text
 * - respond_webhook: Respond to Webhook — send response back to caller
 * - execute_command: Execute Command — run a shell command
 */
export type SortBox = { id: string; kind: "sort"; field: string; direction: "asc" | "desc" };
export type LimitBox = { id: string; kind: "limit"; maxItems: number };
export type RemoveDuplicatesBox = { id: string; kind: "remove_duplicates"; field: string };
export type SummarizeBox = { id: string; kind: "summarize"; operation: "count" | "sum" | "avg" | "min" | "max"; field: string };
export type SwitchBox = { id: string; kind: "switch"; field: string; rules: Array<{ value: string; output: number }> };
export type SetBox = { id: string; kind: "set"; assignments: Array<{ field: string; value: string }> };
export type CompareBox = { id: string; kind: "compare"; mode: "find_new" | "find_removed" | "find_changed" };
export type DateTimeBox = { id: string; kind: "date_time"; operation: "format" | "add" | "subtract" | "diff"; format?: string; amount?: number; unit?: "minutes" | "hours" | "days" | "weeks" | "months" };
export type HtmlExtractBox = { id: string; kind: "html_extract"; selector: string; attribute?: string };
export type TextClassifierBox = { id: string; kind: "text_classifier"; categories: string[] };
export type SentimentBox = { id: string; kind: "sentiment" };
export type ExtractInfoBox = { id: string; kind: "extract_info"; fields: string[] };
export type RespondWebhookBox = { id: string; kind: "respond_webhook"; statusCode: number; body?: string };
export type ExecuteCommandBox = { id: string; kind: "execute_command"; command: string };

export const ACTIONS = [
  // Original
  "send_telegram", "send_email", "notify", "save_to_library",
  // Communication (2026-11-21)
  "send_whatsapp", "send_slack", "send_sms",
  // Social media (2026-11-21)
  "post_instagram", "post_facebook", "post_twitter", "post_linkedin",
  // Data (2026-11-21)
  "sheets_write", "database_write", "webhook_post",
  // Productivity (2026-11-21)
  "create_task", "create_event", "create_invoice",
  // Extended actions (2026-11-21, n8n/Zapier/Make parity)
  "send_discord", "notion_write", "airtable_write",
  "google_drive_upload", "jira_create", "github_create",
  "hubspot_update", "shopify_update", "http_request",
  "generate_pdf", "translate_text", "compress_files",
  "resize_image", "convert_format", "trello_create",
  "asana_create", "clickup_create", "stripe_charge",
  "mailchimp_add", "sendgrid_send", "twilio_call",
  "zoom_create", "google_ads_update", "facebook_ads_update",
  "youtube_upload", "wordpress_post", "supabase_insert",
  "redis_set", "mqtt_publish", "s3_upload",
  // n8n parity (2026-11-24): 25 more actions
  "salesforce_create", "pipedrive_create", "zoho_create",
  "monday_create", "linear_create", "baserow_create",
  "mysql_insert", "postgres_insert", "mongodb_insert",
  "elasticsearch_index", "bigquery_insert",
  "dropbox_upload", "onedrive_upload", "box_upload",
  "zendesk_create", "intercom_send", "freshdesk_create",
  "teams_send", "google_chat_send",
  "woocommerce_update", "paypal_send",
  "quickbooks_create", "xero_create",
  "deepl_translate", "openai_generate",
] as const;
export type ActionKind = (typeof ACTIONS)[number];
export type ActionBox = { id: string; kind: "action"; do: ActionKind; url?: string; config?: Record<string, string> };

export type Box = StartBox | ReadBox | AiBox | ConditionBox | ApprovalBox | ActionBox | FilterBox | CodeBox | WaitBox | TransformBox | NoteBox | ErrorHandlerBox | LoopBox | SplitBox | MergeBox | DelayBox | SortBox | LimitBox | RemoveDuplicatesBox | SummarizeBox | SwitchBox | SetBox | CompareBox | DateTimeBox | HtmlExtractBox | TextClassifierBox | SentimentBox | ExtractInfoBox | RespondWebhookBox | ExecuteCommandBox;
export type BoxKind = Box["kind"];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const BOX_ID = /^[a-z0-9-]{1,24}$/;

function readStart(v: Record<string, unknown>, id: string): StartBox | null {
  if (v.when === "file_uploaded") return { id, kind: "start", when: "file_uploaded" };
  if (v.when === "webhook") return { id, kind: "start", when: "webhook" };
  if (v.when === "new_email") return { id, kind: "start", when: "new_email" };
  if (v.when === "rss") return { id, kind: "start", when: "rss", ...(typeof v.url === "string" ? { url: v.url.slice(0, 500) } : {}) };
  if (v.when === "form_submitted") return { id, kind: "start", when: "form_submitted" };
  if (v.when === "chat_message") return { id, kind: "start", when: "chat_message" };
  if (v.when === "app_event") return { id, kind: "start", when: "app_event", ...(typeof v.app === "string" ? { app: v.app.slice(0, 100) } : {}) };
  if (v.when === "manual") return { id, kind: "start", when: "manual" };
  if (v.when !== "time") return null;
  const every = v.every;
  if (every !== "day" && every !== "weekdays" && every !== "week" && every !== "month") return null;
  const at = typeof v.at === "string" && HHMM.test(v.at) ? v.at : null;
  if (!at) return null;
  if (every === "week") {
    const weekday = Number(v.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
    return { id, kind: "start", when: "time", every, at, weekday };
  }
  if (every === "month") {
    const monthDay = Number(v.monthDay);
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28) return null;
    return { id, kind: "start", when: "time", every, at, monthDay };
  }
  return { id, kind: "start", when: "time", every, at };
}

/** Read a config object defensively — at most 10 string→string pairs,
 *  each key ≤ 50 chars and value ≤ 2000 chars (enough for API tokens,
 *  URLs, chat IDs, subjects, templates). */
function readConfig(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || typeof v !== "string") continue;
    if (k.length > 50 || v.length > 2000) continue;
    out[k] = v;
    if (++count >= 10) break;
  }
  return count > 0 ? out : undefined;
}

/**
 * PER-TYPE CONFIGURATION FIELDS: what each action/source type lets the
 * user configure directly in the node editor, like n8n's node settings.
 * Each field has a key (stored in box.config), a label, an input type,
 * and a placeholder. Sensitive fields (type "password") are shown as
 * masked inputs. Fields are shown in order.
 */
export type ConfigField = {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url" | "textarea";
  placeholder?: string;
  required?: boolean;
};
export const ACTION_CONFIG: Partial<Record<ActionKind, ConfigField[]>> = {
  send_telegram: [
    { key: "bot_token", label: "Bot Token", type: "password", placeholder: "123456:ABC-DEF1234...", required: true },
    { key: "chat_id", label: "Chat ID", type: "text", placeholder: "-100123456789", required: true },
  ],
  send_email: [
    { key: "to", label: "To", type: "email", placeholder: "recipient@example.com" },
    { key: "subject", label: "Subject", type: "text", placeholder: "Daily Report — {date}" },
  ],
  send_slack: [
    { key: "webhook_url", label: "Webhook URL", type: "url", placeholder: "https://hooks.slack.com/services/...", required: true },
    { key: "channel", label: "Channel", type: "text", placeholder: "#general" },
  ],
  send_discord: [
    { key: "webhook_url", label: "Webhook URL", type: "url", placeholder: "https://discord.com/api/webhooks/...", required: true },
  ],
  send_whatsapp: [
    { key: "phone", label: "Phone Number", type: "text", placeholder: "+30 69..." },
  ],
  webhook_post: [
    { key: "url", label: "Webhook URL", type: "url", placeholder: "https://example.com/webhook", required: true },
    { key: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ..."}' },
  ],
  http_request: [
    { key: "url", label: "URL", type: "url", placeholder: "https://api.example.com/...", required: true },
    { key: "method", label: "Method", type: "text", placeholder: "POST" },
    { key: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Content-Type": "application/json"}' },
  ],
  notion_write: [
    { key: "api_key", label: "Notion API Key", type: "password", placeholder: "ntn_...", required: true },
    { key: "page_id", label: "Page ID", type: "text", placeholder: "abc123..." },
  ],
  google_drive_upload: [
    { key: "folder_id", label: "Folder ID", type: "text", placeholder: "1abc..." },
  ],
  github_create: [
    { key: "token", label: "GitHub Token", type: "password", placeholder: "ghp_...", required: true },
    { key: "repo", label: "Repository", type: "text", placeholder: "owner/repo", required: true },
  ],
  sheets_write: [
    { key: "spreadsheet_id", label: "Spreadsheet ID", type: "text", placeholder: "1BxiM...", required: true },
    { key: "range", label: "Range", type: "text", placeholder: "Sheet1!A1" },
  ],
};

export const SOURCE_CONFIG: Partial<Record<ReadSource, ConfigField[]>> = {
  http_request: [
    { key: "url", label: "URL", type: "url", placeholder: "https://api.example.com/data", required: true },
    { key: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ..."}' },
  ],
  website_scrape: [
    { key: "url", label: "URL to scrape", type: "url", placeholder: "https://example.com/page", required: true },
  ],
  rss_feed: [
    { key: "url", label: "RSS Feed URL", type: "url", placeholder: "https://example.com/feed.xml", required: true },
  ],
  google_sheets: [
    { key: "spreadsheet_id", label: "Spreadsheet ID", type: "text", placeholder: "1BxiM...", required: true },
    { key: "range", label: "Range", type: "text", placeholder: "Sheet1!A1:D100" },
  ],
  notion_pages: [
    { key: "api_key", label: "Notion API Key", type: "password", placeholder: "ntn_...", required: true },
    { key: "database_id", label: "Database ID", type: "text", placeholder: "abc123..." },
  ],
  database_query: [
    { key: "connection_string", label: "Connection String", type: "password", placeholder: "postgresql://...", required: true },
    { key: "query", label: "SQL Query", type: "textarea", placeholder: "SELECT * FROM ...", required: true },
  ],
  discord_messages: [
    { key: "bot_token", label: "Bot Token", type: "password", placeholder: "MTIz...", required: true },
    { key: "channel_id", label: "Channel ID", type: "text", placeholder: "123456789", required: true },
  ],
  github_issues: [
    { key: "token", label: "GitHub Token", type: "password", placeholder: "ghp_...", required: true },
    { key: "repo", label: "Repository", type: "text", placeholder: "owner/repo", required: true },
  ],
  stripe_payments: [
    { key: "api_key", label: "Stripe Secret Key", type: "password", placeholder: "sk_live_...", required: true },
  ],
  // n8n parity (2026-11-24):
  salesforce_records: [
    { key: "api_key", label: "Salesforce Token", type: "password", placeholder: "00D...", required: true },
    { key: "url", label: "Instance URL", type: "url", placeholder: "https://yourorg.salesforce.com" },
  ],
  pipedrive_deals: [
    { key: "api_key", label: "Pipedrive API Token", type: "password", placeholder: "abc123...", required: true },
  ],
  zoho_records: [
    { key: "api_key", label: "Zoho API Key", type: "password", placeholder: "1000.abc...", required: true },
  ],
  monday_items: [
    { key: "api_key", label: "Monday.com API Key", type: "password", placeholder: "eyJh...", required: true },
    { key: "board_id", label: "Board ID", type: "text", placeholder: "123456789" },
  ],
  linear_issues: [
    { key: "api_key", label: "Linear API Key", type: "password", placeholder: "lin_api_...", required: true },
  ],
  baserow_rows: [
    { key: "api_key", label: "Baserow Token", type: "password", placeholder: "abc...", required: true },
    { key: "url", label: "Baserow URL", type: "url", placeholder: "https://api.baserow.io" },
  ],
  mysql_query: [
    { key: "connection_string", label: "MySQL Connection", type: "password", placeholder: "mysql://user:pass@host/db", required: true },
    { key: "query", label: "SQL Query", type: "textarea", placeholder: "SELECT * FROM ...", required: true },
  ],
  postgres_query: [
    { key: "connection_string", label: "PostgreSQL Connection", type: "password", placeholder: "postgresql://user:pass@host/db", required: true },
    { key: "query", label: "SQL Query", type: "textarea", placeholder: "SELECT * FROM ...", required: true },
  ],
  mongodb_query: [
    { key: "connection_string", label: "MongoDB URI", type: "password", placeholder: "mongodb+srv://...", required: true },
    { key: "query", label: "Collection", type: "text", placeholder: "users", required: true },
  ],
  elasticsearch_query: [
    { key: "url", label: "Elasticsearch URL", type: "url", placeholder: "https://es.example.com:9200", required: true },
    { key: "api_key", label: "API Key", type: "password", placeholder: "abc123..." },
  ],
  bigquery_query: [
    { key: "api_key", label: "Service Account JSON", type: "textarea", placeholder: '{"type":"service_account",...}', required: true },
    { key: "query", label: "SQL Query", type: "textarea", placeholder: "SELECT * FROM ...", required: true },
  ],
  dropbox_files: [
    { key: "api_key", label: "Dropbox Access Token", type: "password", placeholder: "sl.B...", required: true },
  ],
  onedrive_files: [
    { key: "api_key", label: "OneDrive Access Token", type: "password", placeholder: "EwB...", required: true },
  ],
  box_files: [
    { key: "api_key", label: "Box Access Token", type: "password", placeholder: "abc...", required: true },
  ],
  zendesk_tickets: [
    { key: "api_key", label: "Zendesk API Token", type: "password", placeholder: "abc...", required: true },
    { key: "url", label: "Zendesk URL", type: "url", placeholder: "https://yourco.zendesk.com" },
  ],
  intercom_conversations: [
    { key: "api_key", label: "Intercom Access Token", type: "password", placeholder: "dG9r...", required: true },
  ],
  freshdesk_tickets: [
    { key: "api_key", label: "Freshdesk API Key", type: "password", placeholder: "abc...", required: true },
    { key: "url", label: "Freshdesk URL", type: "url", placeholder: "https://yourco.freshdesk.com" },
  ],
  google_analytics: [
    { key: "api_key", label: "Service Account JSON", type: "textarea", placeholder: '{"type":"service_account",...}', required: true },
    { key: "property_id", label: "Property ID", type: "text", placeholder: "123456789" },
  ],
  mixpanel_events: [
    { key: "api_key", label: "Mixpanel API Secret", type: "password", placeholder: "abc...", required: true },
  ],
  woocommerce_orders: [
    { key: "url", label: "Store URL", type: "url", placeholder: "https://yourstore.com", required: true },
    { key: "api_key", label: "Consumer Key", type: "password", placeholder: "ck_...", required: true },
    { key: "secret", label: "Consumer Secret", type: "password", placeholder: "cs_..." },
  ],
};

/** One box, read defensively: anything not exactly a box is null. */
export function readBox(raw: unknown, fallbackId: string): Box | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = typeof v.id === "string" && BOX_ID.test(v.id) ? v.id : fallbackId;
  switch (v.kind) {
    case "start":
      return readStart(v, id);
    case "read": {
      if (!(READ_SOURCES as readonly unknown[]).includes(v.source)) return null;
      const readUrl = typeof v.url === "string" ? sanitiseBoxUrl(v.url) : undefined;
      const readCfg = readConfig(v.config);
      return { id, kind: "read", source: v.source as ReadSource, ...(readUrl ? { url: readUrl } : {}), ...(readCfg ? { config: readCfg } : {}) };
    }
    case "ai": {
      const instruction = typeof v.instruction === "string" ? v.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : "";
      return instruction.length >= 3 ? { id, kind: "ai", instruction } : null;
    }
    case "condition":
      return { id, kind: "condition", test: "has_content" };
    case "approval":
      return { id, kind: "approval" };
    // n8n CORE NODES
    case "filter": {
      const expr = typeof v.expression === "string" ? v.expression.trim().slice(0, MAX_INSTRUCTION_CHARS) : "data is not empty";
      return { id, kind: "filter", expression: expr };
    }
    case "code": {
      const code = typeof v.code === "string" ? v.code.trim().slice(0, 5000) : "";
      const lang = v.language === "python" ? "python" : "javascript";
      return code.length >= 1 ? { id, kind: "code", language: lang, code } : null;
    }
    case "wait": {
      const dur = Number(v.duration) || 60;
      const unit = (["seconds", "minutes", "hours", "days"] as const).includes(v.unit as never) ? (v.unit as "seconds") : "seconds";
      return { id, kind: "wait", duration: Math.min(dur, 86400), unit };
    }
    case "transform": {
      const inst = typeof v.instruction === "string" ? v.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : "";
      return inst.length >= 3 ? { id, kind: "transform", instruction: inst } : null;
    }
    case "note": {
      const text = typeof v.text === "string" ? v.text.trim().slice(0, 500) : "";
      return { id, kind: "note", text };
    }
    // n8n advanced nodes (2026-11-24):
    case "error_handler": {
      const fa = v.fallbackAction;
      if (fa !== "continue" && fa !== "stop" && fa !== "retry") return { id, kind: "error_handler", fallbackAction: "continue" };
      const rc = typeof v.retryCount === "number" ? Math.min(Math.max(Math.round(v.retryCount), 0), 5) : undefined;
      const rd = typeof v.retryDelay === "number" ? Math.min(Math.max(Math.round(v.retryDelay), 1), 300) : undefined;
      return { id, kind: "error_handler", fallbackAction: fa, ...(rc !== undefined ? { retryCount: rc } : {}), ...(rd !== undefined ? { retryDelay: rd } : {}) };
    }
    case "loop": {
      const max = typeof v.maxIterations === "number" ? Math.min(Math.max(Math.round(v.maxIterations), 1), 100) : 10;
      return { id, kind: "loop", maxIterations: max };
    }
    case "split": {
      const bs = typeof v.batchSize === "number" ? Math.min(Math.max(Math.round(v.batchSize), 1), 1000) : 10;
      return { id, kind: "split", batchSize: bs };
    }
    case "merge": {
      const mode = v.mode;
      if (mode !== "append" && mode !== "combine" && mode !== "choose_branch") return { id, kind: "merge", mode: "append" };
      return { id, kind: "merge", mode };
    }
    case "delay": {
      const d = typeof v.delay === "number" ? Math.min(Math.max(Math.round(v.delay), 1), 86400) : 5;
      const u = v.unit;
      if (u !== "seconds" && u !== "minutes" && u !== "hours") return { id, kind: "delay", delay: d, unit: "seconds" };
      return { id, kind: "delay", delay: d, unit: u };
    }
    // n8n data transformation + flow control (2026-11-24, round 2):
    case "sort": {
      const field = typeof v.field === "string" ? v.field.trim().slice(0, 100) : "name";
      const dir = v.direction === "desc" ? "desc" : "asc";
      return { id, kind: "sort", field, direction: dir };
    }
    case "limit": {
      const max = typeof v.maxItems === "number" ? Math.min(Math.max(Math.round(v.maxItems), 1), 10000) : 10;
      return { id, kind: "limit", maxItems: max };
    }
    case "remove_duplicates": {
      const field = typeof v.field === "string" ? v.field.trim().slice(0, 100) : "id";
      return { id, kind: "remove_duplicates", field };
    }
    case "summarize": {
      const op = v.operation;
      if (op !== "count" && op !== "sum" && op !== "avg" && op !== "min" && op !== "max") return { id, kind: "summarize", operation: "count", field: "id" };
      const field = typeof v.field === "string" ? v.field.trim().slice(0, 100) : "id";
      return { id, kind: "summarize", operation: op, field };
    }
    case "switch": {
      const field = typeof v.field === "string" ? v.field.trim().slice(0, 100) : "status";
      const rules = Array.isArray(v.rules) ? v.rules.slice(0, 10).filter((r: unknown): r is { value: string; output: number } =>
        Boolean(r) && typeof r === "object" && typeof (r as Record<string, unknown>).value === "string" && typeof (r as Record<string, unknown>).output === "number"
      ).map((r: { value: string; output: number }) => ({ value: String(r.value).slice(0, 200), output: Math.round(r.output) })) : [];
      return { id, kind: "switch", field, rules };
    }
    case "set": {
      const assignments = Array.isArray(v.assignments) ? v.assignments.slice(0, 20).filter((a: unknown): a is { field: string; value: string } =>
        Boolean(a) && typeof a === "object" && typeof (a as Record<string, unknown>).field === "string" && typeof (a as Record<string, unknown>).value === "string"
      ).map((a: { field: string; value: string }) => ({ field: a.field.slice(0, 100), value: a.value.slice(0, 500) })) : [];
      return { id, kind: "set", assignments };
    }
    case "compare": {
      const mode = v.mode;
      if (mode !== "find_new" && mode !== "find_removed" && mode !== "find_changed") return { id, kind: "compare", mode: "find_new" };
      return { id, kind: "compare", mode };
    }
    case "date_time": {
      const operation = v.operation;
      if (operation !== "format" && operation !== "add" && operation !== "subtract" && operation !== "diff") return { id, kind: "date_time", operation: "format" };
      return { id, kind: "date_time", operation, ...(typeof v.format === "string" ? { format: v.format.slice(0, 50) } : {}), ...(typeof v.amount === "number" ? { amount: Math.round(v.amount) } : {}), ...(typeof v.unit === "string" && ["minutes", "hours", "days", "weeks", "months"].includes(v.unit) ? { unit: v.unit as "minutes" | "hours" | "days" | "weeks" | "months" } : {}) };
    }
    case "html_extract": {
      const selector = typeof v.selector === "string" ? v.selector.trim().slice(0, 200) : "h1";
      return { id, kind: "html_extract", selector, ...(typeof v.attribute === "string" ? { attribute: v.attribute.slice(0, 50) } : {}) };
    }
    case "text_classifier": {
      const categories = Array.isArray(v.categories) ? v.categories.slice(0, 20).filter((c: unknown): c is string => typeof c === "string").map((c: string) => c.slice(0, 100)) : ["positive", "negative"];
      return { id, kind: "text_classifier", categories };
    }
    case "sentiment": {
      return { id, kind: "sentiment" };
    }
    case "extract_info": {
      const fields = Array.isArray(v.fields) ? v.fields.slice(0, 20).filter((f: unknown): f is string => typeof f === "string").map((f: string) => f.slice(0, 100)) : ["name", "email"];
      return { id, kind: "extract_info", fields };
    }
    case "respond_webhook": {
      const statusCode = typeof v.statusCode === "number" ? Math.min(Math.max(Math.round(v.statusCode), 100), 599) : 200;
      return { id, kind: "respond_webhook", statusCode, ...(typeof v.body === "string" ? { body: v.body.slice(0, 2000) } : {}) };
    }
    case "execute_command": {
      const command = typeof v.command === "string" ? v.command.trim().slice(0, 500) : "";
      return command.length >= 1 ? { id, kind: "execute_command", command } : null;
    }
    case "action": {
      if (!(ACTIONS as readonly unknown[]).includes(v.do)) return null;
      const actUrl = typeof v.url === "string" ? sanitiseBoxUrl(v.url) : undefined;
      const actCfg = readConfig(v.config);
      return { id, kind: "action", do: v.do as ActionKind, ...(actUrl ? { url: actUrl } : {}), ...(actCfg ? { config: actCfg } : {}) };
    }
    default:
      return null;
  }
}

export type FlowVerdict = { ok: true; boxes: Box[] } | { ok: false; reason: "empty" | "no_start" | "start_not_first" | "two_starts" | "no_action" | "too_many" | "bad_box" | "file_read_without_upload" | "duplicate_id" };

/**
 * A whole row, or the reason it is not one. The rules are the ones a run
 * depends on: it starts once, at the top; it does something at the end; a
 * file can only be read when a file is what started it.
 */
export function readFlow(raw: unknown): FlowVerdict {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: "empty" };
  if (raw.length > MAX_BOXES) return { ok: false, reason: "too_many" };
  const boxes: Box[] = [];
  for (const [i, item] of raw.entries()) {
    const box = readBox(item, `b${i + 1}`);
    if (!box) return { ok: false, reason: "bad_box" };
    boxes.push(box);
  }
  if (new Set(boxes.map((b) => b.id)).size !== boxes.length) return { ok: false, reason: "duplicate_id" };
  const starts = boxes.filter((b) => b.kind === "start");
  if (starts.length === 0) return { ok: false, reason: "no_start" };
  if (starts.length > 1) return { ok: false, reason: "two_starts" };
  if (boxes[0].kind !== "start") return { ok: false, reason: "start_not_first" };
  if (!boxes.some((b) => b.kind === "action")) return { ok: false, reason: "no_action" };
  const start = boxes[0] as StartBox;
  if (start.when !== "file_uploaded" && boxes.some((b) => b.kind === "read" && b.source === "uploaded_file")) {
    return { ok: false, reason: "file_read_without_upload" };
  }
  return { ok: true, boxes };
}

/** The same schedule as a cron expression, for lib/agents/cron-expression.ts's nextRunAt. */
export function cronFor(start: StartBox): string | null {
  if (start.when !== "time") return null;
  const [hour, minute] = start.at.split(":").map(Number);
  switch (start.every) {
    case "day":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "week":
      return `${minute} ${hour} * * ${(start.weekday ?? 1) % 7}`;
    case "month":
      return `${minute} ${hour} ${start.monthDay ?? 1} * *`;
  }
}

/** What a box needs connected before the automation may be switched on.
 *  Every integration that is not built into Ionexa itself is listed here;
 *  the screen says "Needs a connection: X" and links to Connect. */
export type ConnectionKey =
  | "google_calendar" | "telegram" | "whatsapp" | "slack" | "instagram"
  | "facebook" | "twitter" | "linkedin" | "google_sheets" | "sms" | "crm"
  | "webhook" | "notion" | "airtable" | "google_drive" | "jira" | "github"
  | "hubspot" | "shopify" | "discord" | "trello" | "asana" | "clickup"
  | "stripe" | "mailchimp" | "sendgrid" | "twilio" | "zoom"
  | "google_ads" | "facebook_ads" | "youtube" | "wordpress" | "supabase"
  | "redis" | "mqtt" | "s3" | "typeform" | "google_forms";

/** Source → connection key, for reads that need a connection. */
const SOURCE_CONNECTION: Partial<Record<ReadSource, ConnectionKey>> = {
  calendar_today: "google_calendar", calendar_tomorrow: "google_calendar", calendar_week: "google_calendar",
  google_sheets: "google_sheets", crm_contacts: "crm", social_mentions: "instagram",
  notion_pages: "notion", airtable_records: "airtable", google_drive_files: "google_drive",
  jira_issues: "jira", github_issues: "github", hubspot_contacts: "hubspot",
  shopify_orders: "shopify", discord_messages: "discord", trello_cards: "trello",
  asana_tasks: "asana", clickup_tasks: "clickup", stripe_payments: "stripe",
  typeform_responses: "typeform", google_forms: "google_forms",
};

/** Action → connection key, for actions that need a connection.
 *  webhook_post, http_request and generate_pdf are NOT here: they work
 *  without any connection (they just call a URL or save to the library). */
const ACTION_CONNECTION: Partial<Record<ActionKind, ConnectionKey>> = {
  send_telegram: "telegram", send_whatsapp: "whatsapp", send_slack: "slack",
  send_sms: "sms", post_instagram: "instagram", post_facebook: "facebook",
  post_twitter: "twitter", post_linkedin: "linkedin", sheets_write: "google_sheets",
  create_event: "google_calendar",
  send_discord: "discord", notion_write: "notion", airtable_write: "airtable",
  google_drive_upload: "google_drive", jira_create: "jira", github_create: "github",
  hubspot_update: "hubspot", shopify_update: "shopify",
  trello_create: "trello", asana_create: "asana", clickup_create: "clickup",
  stripe_charge: "stripe", mailchimp_add: "mailchimp", sendgrid_send: "sendgrid",
  twilio_call: "twilio", zoom_create: "zoom", google_ads_update: "google_ads",
  facebook_ads_update: "facebook_ads", youtube_upload: "youtube",
  wordpress_post: "wordpress", supabase_insert: "supabase", redis_set: "redis",
  mqtt_publish: "mqtt", s3_upload: "s3",
};

/** When a box carries inline config with the essential fields filled,
 *  it does NOT need the connection system — the runner uses the config
 *  directly (n8n-style per-node credentials). */
function hasInlineConfig(box: Box): boolean {
  if (box.kind === "action" && box.config) {
    if (box.do === "send_telegram" && box.config.bot_token && box.config.chat_id) return true;
    if (box.do === "send_slack" && box.config.webhook_url) return true;
    if (box.do === "send_discord" && box.config.webhook_url) return true;
    if (box.do === "send_email" && box.config.to) return true;
  }
  if (box.kind === "read" && box.config) {
    if (box.source === "http_request" && box.config.url) return true;
    if (box.source === "website_scrape" && box.config.url) return true;
    if (box.source === "rss_feed" && box.config.url) return true;
  }
  return false;
}

export function connectionsNeeded(boxes: Box[]): ConnectionKey[] {
  const needs = new Set<ConnectionKey>();
  for (const box of boxes) {
    // Skip connection requirement when the box has inline config.
    if (hasInlineConfig(box)) continue;
    // Webhook start does NOT need a connection — it's an incoming HTTP call.
    if (box.kind === "start" && box.when === "app_event") {
      // Generic app event — the specific connection depends on the app field
      const app = (box as { app?: string }).app;
      if (app && app in SOURCE_CONNECTION) needs.add(SOURCE_CONNECTION[app as ReadSource]!);
    }
    if (box.kind === "read") {
      const conn = SOURCE_CONNECTION[box.source];
      if (conn) needs.add(conn);
    }
    if (box.kind === "action") {
      const conn = ACTION_CONNECTION[box.do];
      if (conn) needs.add(conn);
    }
  }
  return [...needs];
}

/**
 * «ΌΤΑΝ → ΑΝ → ΚΆΝΕ» (When → If → Do): the part of the sentence each box
 * is, for Simple to say beside every step (the owner, 2026-11-05, after
 * the automation videos; behind "agents-automations-pro"). The start is
 * the WHEN; a condition and an approval are the IF — each one is a
 * "go on only if": something was found, the person said yes; reading,
 * the AI step and the action are the DO.
 *
 * A record over every kind, so a seventh kind cannot be added without
 * being given a part (the compiler refuses the missing key), and pure,
 * so scripts/tests/automations.test.mjs §10 holds it. Presentation only:
 * nothing stored changes and no box carries its part.
 */
export type SentencePart = "when" | "if" | "do";
export const SENTENCE_PART: Record<BoxKind, SentencePart> = {
  start: "when",
  condition: "if",
  approval: "if",
  filter: "if",
  read: "do",
  ai: "do",
  code: "do",
  transform: "do",
  wait: "if",
  note: "do",
  action: "do",
  // n8n advanced nodes (2026-11-24):
  error_handler: "if",
  loop: "do",
  split: "do",
  merge: "do",
  delay: "if",
  // n8n data transformation + flow control (2026-11-24, round 2):
  sort: "do",
  limit: "do",
  remove_duplicates: "do",
  summarize: "do",
  switch: "if",
  set: "do",
  compare: "do",
  date_time: "do",
  html_extract: "do",
  text_classifier: "do",
  sentiment: "do",
  extract_info: "do",
  respond_webhook: "do",
  execute_command: "do",
};
export function partOf(box: Box): SentencePart {
  return SENTENCE_PART[box.kind];
}

/** How many boxes call a model: what a run is priced on. */
export function aiBoxCount(boxes: Box[]): number {
  return boxes.filter((b) => b.kind === "ai" || b.kind === "transform").length;
}

/** Replaces one box, keeping its place and its id. */
export function replaceBox(boxes: Box[], id: string, next: Box): Box[] {
  return boxes.map((b) => (b.id === id ? { ...next, id } : b));
}

/**
 * HOW MUCH THE OWNER TRUSTS ONE AUTOMATION, ON ITS OWN (AUTOMATIONS
 * ΚΟΜΜΑΤΙ 2a, οδηγία 55, 2026-11-08). Stored on automation_flows.mode,
 * in a query of its own — never FLOW_COLUMNS, see the migration's own
 * comment (20261123000000) for why, the same reason as minutes_saved.
 *
 *   auto        σήμερα, αμετάβλητο.
 *   shadow      κάθε τρέξιμο ΑΠΟ ΤΟ ΠΡΟΓΡΑΜΜΑ Ή ΑΡΧΕΙΟ τρέχει στεγνό — ένα
 *               «Εκτέλεση τώρα» πατημένο με το χέρι παραμένει πραγματικό,
 *               γιατί εκεί είσαι ήδη εσύ, ζωντανά, αποφασίζοντας.
 *   supervised  κάθε κουτί "action" χωρίς δικό του "approval" από πριν
 *               παίρνει ένα, αυτόματα, πριν εκτελεστεί πραγματικά.
 */
export const FLOW_MODES = ["auto", "shadow", "supervised"] as const;
export type FlowMode = (typeof FLOW_MODES)[number];
export const DEFAULT_FLOW_MODE: FlowMode = "auto";
export function isFlowMode(value: unknown): value is FlowMode {
  return typeof value === "string" && (FLOW_MODES as readonly string[]).includes(value);
}

/**
 * WHETHER THIS RUN IS DRY, as the one function every call site uses —
 * not a copy of the rule in the cron route, the manual-run route, the
 * approve route and event-runs.ts each deciding it their own way, which
 * is exactly the "two lists that can silently disagree" shape this
 * codebase has already been burned by (ALLOWED_IFRAME_EMBEDS/CSP, the
 * strip/scan cinematicSitesEnabled read). {dry:true} from the "Δοκιμή"
 * button always wins; otherwise "shadow" forces it UNLESS a person
 * pressed "Εκτέλεση τώρα" themselves — manual is the one case where
 * somebody is already there, right now, choosing this to be real.
 */
export function effectiveDry(mode: FlowMode, startedBy: "time" | "event" | "manual" | "dry"): boolean {
  if (startedBy === "dry") return true;
  return mode === "shadow" && startedBy !== "manual";
}

/**
 * "SUPERVISED": an approval inserted, at RUN TIME ONLY, before every
 * action box that does not already have one directly before it. Never
 * written back — automation_flows.boxes stays exactly what the person
 * designed; MAX_BOXES (8) bounds what is STORED, not what a supervised
 * run walks through, and the inserted boxes are never counted against it.
 *
 * DETERMINISTIC FROM (boxes, mode) ALONE, on purpose: a run that stops at
 * one of these synthetic approvals and is resumed later calls this again
 * on the same stored boxes and the same mode, and must land on the exact
 * same array — same length, same box at every index — or the resume's
 * stored `at` points at the wrong box. (If the owner changes the mode
 * itself while a run is waiting, that guarantee no longer holds; runFlow
 * guards the resume index against the rebuilt array's length, so a
 * mismatch fails the run instead of running the wrong box.)
 */
export function withSupervisedApprovals(boxes: Box[]): Box[] {
  const out: Box[] = [];
  for (const box of boxes) {
    if (box.kind === "action" && out[out.length - 1]?.kind !== "approval") {
      out.push({ id: `${box.id}-auto-gate`, kind: "approval" });
    }
    out.push(box);
  }
  return out;
}
