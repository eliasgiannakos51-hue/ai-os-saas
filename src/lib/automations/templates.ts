import { readFlow, type Box } from "@/lib/automations/boxes";

/**
 * READY-MADE AUTOMATIONS, ONE PRESS AWAY (the owner, 2026-11-05, after the
 * automation videos; behind the switch "automation-templates").
 *
 * A template is a row of boxes this file writes out, not a sentence a
 * model reads: pressing «Ξεκίνα από αυτό» makes an ordinary automation
 * (api/automations/templates), off, with version 1, and from then on it
 * is the person's own — every box changes with words or by hand like any
 * other, «Αναίρεση» included. So making one calls no model and costs
 * nothing; each RUN costs what its AI box costs, and the card says so
 * before the press (prices.step × aiBoxCount, the same arithmetic as
 * «Δοκιμή»).
 *
 * THE AI BOX'S WORDS ARE THE READER'S. The instruction is in the person's
 * language because the model answers in the language the step is written
 * in (lib/automations/runner.ts); the route takes it from
 * messages/<locale>.json (dashboard.automations.templates.<id>.instruction)
 * and hands it to templateBoxes below, and scripts/tests/automations.test.mjs
 * §12 runs readFlow over every template in every one of the ten languages.
 *
 * WHAT IS NOT HERE YET IS SAID, NOT FAKED. Two of the owner's four are
 * `soon`: recording an expense by writing to the Telegram bot needs
 * Telegram's incoming messages, which this product does not receive yet
 * (the webhook is TG1 Κομμάτι 2, docs/QUEUE.md); a new Instagram post
 * needs an Instagram connection, and Connect has none
 * (lib/integrations/providers.ts). Each is drawn with «Σύντομα» and its
 * reason, and none has boxes, so no press can make a half of one.
 * WhatsApp is not drawn at all: it needs Meta's WhatsApp Business API,
 * which is the owner's to obtain (docs/NEEDS-FROM-ELIAS.md).
 */
export const TEMPLATE_IDS = [
  "finance_daily", "finance_weekly",
  // New templates (2026-11-21): one per category, showing the new capabilities.
  "ecommerce_daily", "support_triage", "content_repurpose", "lead_enrich",
  // Complex n8n-style templates (2026-11-24): 8-15 steps each.
  "data_pipeline", "customer_onboarding", "social_monitor",
  "invoice_processor", "competitor_tracker", "report_generator",
  "webhook_processor", "crm_sync", "content_pipeline", "alert_system",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const SOON_TEMPLATE_IDS = ["finance_expense_telegram", "instagram_to_telegram"] as const;
export type SoonTemplateId = (typeof SOON_TEMPLATE_IDS)[number];

export type TemplateGroup = "finance" | "instagram" | "ecommerce" | "support" | "marketing" | "sales" | "data" | "operations" | "monitoring";

/** The order and grouping of the gallery. */
export const GALLERY: readonly { group: TemplateGroup; ready: readonly TemplateId[]; soon: readonly SoonTemplateId[] }[] = [
  { group: "finance", ready: ["finance_daily", "finance_weekly", "invoice_processor"], soon: ["finance_expense_telegram"] },
  { group: "ecommerce", ready: ["ecommerce_daily"], soon: [] },
  { group: "support", ready: ["support_triage", "alert_system"], soon: [] },
  { group: "marketing", ready: ["content_repurpose", "social_monitor", "content_pipeline"], soon: [] },
  { group: "sales", ready: ["lead_enrich", "crm_sync", "customer_onboarding"], soon: [] },
  { group: "data", ready: ["data_pipeline", "report_generator"], soon: [] },
  { group: "operations", ready: ["webhook_processor"], soon: [] },
  { group: "monitoring", ready: ["competitor_tracker"], soon: [] },
  { group: "instagram", ready: [], soon: ["instagram_to_telegram"] },
];

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && (TEMPLATE_IDS as readonly string[]).includes(value);
}

/**
 * The boxes of one template, with the AI box's words in the reader's
 * language. «(a) every day at 08:30: this week's finances → an AI summary
 * → Telegram»; «(b) every week: this month's finances → an AI analysis →
 * Telegram» — Monday at 08:30, the start of the week the summary is for.
 */
export function templateBoxes(id: TemplateId, instruction: string): Box[] {
  if (id === "finance_daily") {
    return [
      { id: "b1", kind: "start", when: "time", every: "day", at: "08:30" },
      { id: "b2", kind: "read", source: "finances_week" },
      { id: "b3", kind: "ai", instruction },
      { id: "b4", kind: "action", do: "send_telegram" },
    ];
  }
  if (id === "finance_weekly") {
    return [
      { id: "b1", kind: "start", when: "time", every: "week", at: "08:30", weekday: 1 },
      { id: "b2", kind: "read", source: "finances_month" },
      { id: "b3", kind: "ai", instruction },
      { id: "b4", kind: "action", do: "send_telegram" },
    ];
  }
  // E-COMMERCE DAILY: every morning, read Shopify orders → AI summarise → email report.
  if (id === "ecommerce_daily") {
    return [
      { id: "b1", kind: "start", when: "time", every: "day", at: "09:00" },
      { id: "b2", kind: "read", source: "shopify_orders" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "ai", instruction },
      { id: "b5", kind: "action", do: "send_email" },
    ];
  }
  // SUPPORT TRIAGE: when email arrives → AI classify urgency → create task.
  if (id === "support_triage") {
    return [
      { id: "b1", kind: "start", when: "new_email" },
      { id: "b2", kind: "read", source: "last_emails" },
      { id: "b3", kind: "ai", instruction },
      { id: "b4", kind: "condition", test: "has_content" },
      { id: "b5", kind: "action", do: "create_task" },
    ];
  }
  // CONTENT REPURPOSE: on file upload → AI transform → post to LinkedIn.
  if (id === "content_repurpose") {
    return [
      { id: "b1", kind: "start", when: "file_uploaded" },
      { id: "b2", kind: "read", source: "uploaded_file" },
      { id: "b3", kind: "ai", instruction },
      { id: "b4", kind: "approval" },
      { id: "b5", kind: "action", do: "post_linkedin" },
    ];
  }
  if (id === "lead_enrich") {
    // LEAD ENRICH: weekly, read CRM contacts → AI score → update HubSpot.
    return [
      { id: "b1", kind: "start", when: "time", every: "week", at: "07:00", weekday: 1 },
      { id: "b2", kind: "read", source: "hubspot_contacts" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "ai", instruction },
      { id: "b5", kind: "action", do: "hubspot_update" },
    ];
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPLEX N8N-STYLE TEMPLATES (2026-11-24): 8-15 steps each
  // ═══════════════════════════════════════════════════════════════════

  if (id === "data_pipeline") {
    // DATA PIPELINE: Scrape website → extract data → remove duplicates →
    // sort → limit → AI transform → save to Google Sheets → notify.
    return [
      { id: "b1", kind: "start", when: "time", every: "day", at: "06:00" },
      { id: "b2", kind: "read", source: "website_scrape" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "html_extract", selector: "table tr, .product-card, article" },
      { id: "b5", kind: "remove_duplicates", field: "title" },
      { id: "b6", kind: "sort", field: "date", direction: "desc" },
      { id: "b7", kind: "limit", maxItems: 50 },
      { id: "b8", kind: "ai", instruction },
      { id: "b9", kind: "action", do: "sheets_write" },
      { id: "b10", kind: "action", do: "send_slack" },
    ];
  }

  if (id === "customer_onboarding") {
    // CUSTOMER ONBOARDING: Webhook → extract info → AI welcome email →
    // create task → delay → AI follow-up → send email → update CRM.
    return [
      { id: "b1", kind: "start", when: "webhook" },
      { id: "b2", kind: "extract_info", fields: ["name", "email", "company", "plan"] },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "ai", instruction },
      { id: "b5", kind: "action", do: "send_email" },
      { id: "b6", kind: "action", do: "create_task" },
      { id: "b7", kind: "delay", delay: 3, unit: "hours" },
      { id: "b8", kind: "action", do: "send_slack" },
      { id: "b9", kind: "action", do: "hubspot_update" },
    ];
  }

  if (id === "social_monitor") {
    // SOCIAL MEDIA MONITOR: Every hour → scrape social mentions → filter →
    // sentiment analysis → AI classify → switch (positive→save, negative→alert) → notify.
    return [
      { id: "b1", kind: "start", when: "time", every: "day", at: "09:00" },
      { id: "b2", kind: "read", source: "social_mentions" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "sentiment" },
      { id: "b5", kind: "ai", instruction },
      { id: "b6", kind: "text_classifier", categories: ["positive_review", "complaint", "feature_request", "question", "spam"] },
      { id: "b7", kind: "filter", expression: "not spam" },
      { id: "b8", kind: "action", do: "sheets_write" },
      { id: "b9", kind: "action", do: "send_slack" },
    ];
  }

  if (id === "invoice_processor") {
    // INVOICE PROCESSOR: Email arrives → read PDF → AI extract fields →
    // validate → transform → save to accounting → notify.
    return [
      { id: "b1", kind: "start", when: "new_email" },
      { id: "b2", kind: "read", source: "last_emails" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "extract_info", fields: ["vendor", "amount", "currency", "date", "invoice_number", "due_date"] },
      { id: "b5", kind: "ai", instruction },
      { id: "b6", kind: "date_time", operation: "format", format: "YYYY-MM-DD" },
      { id: "b7", kind: "summarize", operation: "sum", field: "amount" },
      { id: "b8", kind: "action", do: "sheets_write" },
      { id: "b9", kind: "action", do: "quickbooks_create" },
      { id: "b10", kind: "action", do: "send_slack" },
    ];
  }

  if (id === "competitor_tracker") {
    // COMPETITOR TRACKER: Daily → scrape multiple competitor sites →
    // compare with yesterday → AI analyze changes → report.
    return [
      { id: "b1", kind: "start", when: "time", every: "day", at: "07:30" },
      { id: "b2", kind: "read", source: "website_scrape" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "html_extract", selector: ".pricing, .features, h1, h2, .product" },
      { id: "b5", kind: "compare", mode: "find_changed" },
      { id: "b6", kind: "filter", expression: "has changes" },
      { id: "b7", kind: "ai", instruction },
      { id: "b8", kind: "action", do: "save_to_library" },
      { id: "b9", kind: "action", do: "send_email" },
    ];
  }

  if (id === "report_generator") {
    // REPORT GENERATOR: Weekly → read from multiple sources → merge →
    // AI analyze → generate PDF → email → save to Drive.
    return [
      { id: "b1", kind: "start", when: "time", every: "week", at: "08:00", weekday: 1 },
      { id: "b2", kind: "read", source: "google_sheets" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "sort", field: "date", direction: "desc" },
      { id: "b5", kind: "summarize", operation: "sum", field: "revenue" },
      { id: "b6", kind: "ai", instruction },
      { id: "b7", kind: "action", do: "generate_pdf" },
      { id: "b8", kind: "action", do: "send_email" },
      { id: "b9", kind: "action", do: "google_drive_upload" },
      { id: "b10", kind: "action", do: "send_slack" },
    ];
  }

  if (id === "webhook_processor") {
    // WEBHOOK PROCESSOR: Receive webhook → validate → extract →
    // error handler → transform → respond → save → notify.
    return [
      { id: "b1", kind: "start", when: "webhook" },
      { id: "b2", kind: "error_handler", fallbackAction: "continue" },
      { id: "b3", kind: "extract_info", fields: ["event_type", "payload", "timestamp", "source"] },
      { id: "b4", kind: "condition", test: "has_content" },
      { id: "b5", kind: "ai", instruction },
      { id: "b6", kind: "set", assignments: [{ field: "status", value: "processed" }, { field: "processed_at", value: "now" }] },
      { id: "b7", kind: "action", do: "database_write" },
      { id: "b8", kind: "respond_webhook", statusCode: 200, body: '{"ok":true}' },
      { id: "b9", kind: "action", do: "send_slack" },
    ];
  }

  if (id === "crm_sync") {
    // CRM SYNC: Daily → read Salesforce → remove duplicates → compare with
    // local → loop over new ones → AI enrich → create in HubSpot → report.
    return [
      { id: "b1", kind: "start", when: "time", every: "day", at: "06:30" },
      { id: "b2", kind: "read", source: "salesforce_records" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "remove_duplicates", field: "email" },
      { id: "b5", kind: "compare", mode: "find_new" },
      { id: "b6", kind: "filter", expression: "has new records" },
      { id: "b7", kind: "loop", maxIterations: 50 },
      { id: "b8", kind: "ai", instruction },
      { id: "b9", kind: "action", do: "hubspot_update" },
      { id: "b10", kind: "action", do: "send_email" },
    ];
  }

  if (id === "content_pipeline") {
    // CONTENT PIPELINE: RSS feed → AI summarize → AI translate →
    // AI create social posts → approval → post everywhere → save.
    return [
      { id: "b1", kind: "start", when: "time", every: "day", at: "10:00" },
      { id: "b2", kind: "read", source: "rss_feed" },
      { id: "b3", kind: "condition", test: "has_content" },
      { id: "b4", kind: "limit", maxItems: 5 },
      { id: "b5", kind: "ai", instruction },
      { id: "b6", kind: "transform", instruction: "Create a LinkedIn post, a Twitter post, and a Facebook post from this summary" },
      { id: "b7", kind: "approval" },
      { id: "b8", kind: "action", do: "post_linkedin" },
      { id: "b9", kind: "action", do: "post_twitter" },
      { id: "b10", kind: "action", do: "post_facebook" },
      { id: "b11", kind: "action", do: "save_to_library" },
    ];
  }

  // ALERT SYSTEM: Monitor API → check status → error handler →
  // filter failures → AI diagnose → switch severity → notify team.
  // id === "alert_system"
  return [
    { id: "b1", kind: "start", when: "time", every: "day", at: "00:00" },
    { id: "b2", kind: "read", source: "http_request" },
    { id: "b3", kind: "error_handler", fallbackAction: "retry", retryCount: 3, retryDelay: 30 },
    { id: "b4", kind: "condition", test: "has_content" },
    { id: "b5", kind: "filter", expression: "status is not 200" },
    { id: "b6", kind: "ai", instruction },
    { id: "b7", kind: "text_classifier", categories: ["critical", "warning", "info"] },
    { id: "b8", kind: "action", do: "send_slack" },
    { id: "b9", kind: "action", do: "send_email" },
    { id: "b10", kind: "action", do: "create_task" },
  ];
}

/** The template as a row the routes accept, or null when the words cannot make one. */
export function templateFlow(id: TemplateId, instruction: string): Box[] | null {
  const verdict = readFlow(templateBoxes(id, instruction));
  return verdict.ok ? verdict.boxes : null;
}
