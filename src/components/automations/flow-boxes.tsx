"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarChart3, Bell, BookOpen, Briefcase, Calendar, CalendarDays, Check, Clock, Cloud, CreditCard, Database, DollarSign, FileOutput, FileText, FileUp, Filter, FolderUp, FormInput, GitBranch, Globe, Hash, Image, Layers, Mail, MessageCircle, MessageSquare, Package, PauseCircle, Phone, Play, Plus, Rss, Send, Share2, ShoppingCart, Sparkles, Table2, Timer, Trash2, Video, Webhook, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import {
  ACTIONS,
  ACTION_CONFIG,
  FLOW_MODES,
  MAX_INSTRUCTION_CHARS,
  READ_SOURCES,
  SOURCE_CONFIG,
  connectionsNeeded,
  partOf,
  type ActionKind,
  type Box,
  type ConfigField,
  type FlowMode,
  type ReadSource,
  type SentencePart,
  type StartBox,
} from "@/lib/automations/boxes";
import type { LineState, RunProgress } from "@/lib/automations/run-progress";
import { MAX_MINUTES, MIN_MINUTES, timeSaved } from "@/lib/automations/time-saved";
import type { ShownRun } from "@/lib/automations/flow-view";
import { errorCode } from "@/lib/automations/flow-view";
import type { RunStep } from "@/lib/automations/run-steps";
import { getProvider } from "@/lib/integrations/providers";

/**
 * THE BOXES OF ONE AUTOMATION, AND WHAT EACH RUN DID WITH THEM (MASTER 16,
 * package 30). Drawn by components/automations/automation-shell.tsx in
 * the work area.
 *
 * Top to bottom, joined by a line: each box is one press, which CHOOSES
 * it — the field then changes that box alone, and the hand editor opens
 * under the row. A condition draws its other branch beside it («αλλιώς:
 * σταματά»). A box that needs something not connected says so, with the
 * press that leads to the connection.
 *
 * Every word is a literal key here (dashboard.automations.*), so the
 * message slicer sees them all.
 */
export type Connected = Record<string, boolean>;

/** The names of what an automation connects to: brand names, the same in every language. */
export const CONNECTION_NAME: Record<string, string> = {
  google_calendar: String(getProvider("google_calendar")?.name),
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  slack: "Slack",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  google_sheets: "Google Sheets",
  sms: "SMS",
  crm: "CRM",
  webhook: "Webhook",
  notion: "Notion",
  airtable: "Airtable",
  google_drive: "Google Drive",
  jira: "Jira",
  github: "GitHub",
  hubspot: "HubSpot",
  shopify: "Shopify",
  discord: "Discord",
  trello: "Trello",
  asana: "Asana",
  clickup: "ClickUp",
  stripe: "Stripe",
  mailchimp: "Mailchimp",
  sendgrid: "SendGrid",
  twilio: "Twilio",
  zoom: "Zoom",
  google_ads: "Google Ads",
  facebook_ads: "Facebook Ads",
  youtube: "YouTube",
  wordpress: "WordPress",
  supabase: "Supabase",
  redis: "Redis",
  mqtt: "MQTT",
  s3: "Amazon S3",
  typeform: "Typeform",
  google_forms: "Google Forms",
};

/** Where each connection is made. */
const INTEGRATIONS = "/dashboard/integrations";
export const CONNECT_AT: Record<string, string> = {
  google_calendar: INTEGRATIONS,
  telegram: "/dashboard/agents",
  whatsapp: INTEGRATIONS, slack: INTEGRATIONS, instagram: INTEGRATIONS,
  facebook: INTEGRATIONS, twitter: INTEGRATIONS, linkedin: INTEGRATIONS,
  google_sheets: INTEGRATIONS, sms: INTEGRATIONS, crm: INTEGRATIONS,
  webhook: INTEGRATIONS, notion: INTEGRATIONS, airtable: INTEGRATIONS,
  google_drive: INTEGRATIONS, jira: INTEGRATIONS, github: INTEGRATIONS,
  hubspot: INTEGRATIONS, shopify: INTEGRATIONS, discord: INTEGRATIONS,
  trello: INTEGRATIONS, asana: INTEGRATIONS, clickup: INTEGRATIONS,
  stripe: INTEGRATIONS, mailchimp: INTEGRATIONS, sendgrid: INTEGRATIONS,
  twilio: INTEGRATIONS, zoom: INTEGRATIONS, google_ads: INTEGRATIONS,
  facebook_ads: INTEGRATIONS, youtube: INTEGRATIONS, wordpress: INTEGRATIONS,
  supabase: INTEGRATIONS, redis: INTEGRATIONS, mqtt: INTEGRATIONS,
  s3: INTEGRATIONS, typeform: INTEGRATIONS, google_forms: INTEGRATIONS,
};

/**
 * n8n NODE DESIGN — BLUE/GRAY minimal palette, like actual n8n.
 *
 * n8n nodes are mostly NEUTRAL — gray card with a small coloured icon.
 * The card itself is not vivid; only the icon circle carries the accent.
 * The whole scheme is blue-gray, clean and professional.
 *
 * NODE_THEME: `icon` is the small coloured circle background,
 * `iconText` its foreground, `label` the kind label text colour.
 * The card itself is always the same neutral bg-panel.
 */
const NODE_THEME: Record<Box["kind"], { icon: string; iconText: string; label: string; bg: string; bgHover: string; text: string; border: string }> = {
  start:     { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", bg: "#1e3a5f", bgHover: "#1e3a5f", text: "#fff", border: "#3b82f6" },
  read:      { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", bg: "#1e3a5f", bgHover: "#1e3a5f", text: "#fff", border: "#3b82f6" },
  ai:        { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", bg: "#2d1b69", bgHover: "#2d1b69", text: "#fff", border: "#8b5cf6" },
  condition: { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", bg: "#1e3a5f", bgHover: "#1e3a5f", text: "#fff", border: "#3b82f6" },
  approval:  { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", bg: "#1e3a5f", bgHover: "#1e3a5f", text: "#fff", border: "#3b82f6" },
  action:    { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", bg: "#1e3a5f", bgHover: "#1e3a5f", text: "#fff", border: "#3b82f6" },
};

/** Status → border highlight on the WHOLE node after a run. */
const STATE_BORDER: Record<string, string | undefined> = {
  done: "#10b981",    // green
  failed: "#ef4444",  // red
  active: "#8b5cf6",  // purple pulse
};

function useWords() {
  const t = useTranslations("dashboard.automations");
  const kind: Record<Box["kind"], string> = {
    start: t("kinds.start"),
    read: t("kinds.read"),
    ai: t("kinds.ai"),
    condition: t("kinds.condition"),
    approval: t("kinds.approval"),
    action: t("kinds.action"),
  };
  const source: Record<ReadSource, string> = {
    calendar_today: t("sources.calendar_today"),
    calendar_tomorrow: t("sources.calendar_tomorrow"),
    calendar_week: t("sources.calendar_week"),
    finances_week: t("sources.finances_week"),
    finances_month: t("sources.finances_month"),
    uploaded_file: t("sources.uploaded_file"),
    google_sheets: t("sources.google_sheets"),
    website_scrape: t("sources.website_scrape"),
    rss_feed: t("sources.rss_feed"),
    last_emails: t("sources.last_emails"),
    database_query: t("sources.database_query"),
    crm_contacts: t("sources.crm_contacts"),
    social_mentions: t("sources.social_mentions"),
    analytics_report: t("sources.analytics_report"),
    notion_pages: t("sources.notion_pages"),
    airtable_records: t("sources.airtable_records"),
    google_drive_files: t("sources.google_drive_files"),
    jira_issues: t("sources.jira_issues"),
    github_issues: t("sources.github_issues"),
    hubspot_contacts: t("sources.hubspot_contacts"),
    shopify_orders: t("sources.shopify_orders"),
    http_request: t("sources.http_request"),
    pdf_extract: t("sources.pdf_extract"),
    weather_data: t("sources.weather_data"),
    stock_prices: t("sources.stock_prices"),
    discord_messages: t("sources.discord_messages"),
    trello_cards: t("sources.trello_cards"),
    asana_tasks: t("sources.asana_tasks"),
    clickup_tasks: t("sources.clickup_tasks"),
    stripe_payments: t("sources.stripe_payments"),
    typeform_responses: t("sources.typeform_responses"),
    google_forms: t("sources.google_forms"),
  };
  const action: Record<ActionKind, string> = {
    send_telegram: t("actions.send_telegram"),
    send_email: t("actions.send_email"),
    notify: t("actions.notify"),
    save_to_library: t("actions.save_to_library"),
    send_whatsapp: t("actions.send_whatsapp"),
    send_slack: t("actions.send_slack"),
    send_sms: t("actions.send_sms"),
    post_instagram: t("actions.post_instagram"),
    post_facebook: t("actions.post_facebook"),
    post_twitter: t("actions.post_twitter"),
    post_linkedin: t("actions.post_linkedin"),
    sheets_write: t("actions.sheets_write"),
    database_write: t("actions.database_write"),
    webhook_post: t("actions.webhook_post"),
    create_task: t("actions.create_task"),
    create_event: t("actions.create_event"),
    create_invoice: t("actions.create_invoice"),
    send_discord: t("actions.send_discord"),
    notion_write: t("actions.notion_write"),
    airtable_write: t("actions.airtable_write"),
    google_drive_upload: t("actions.google_drive_upload"),
    jira_create: t("actions.jira_create"),
    github_create: t("actions.github_create"),
    hubspot_update: t("actions.hubspot_update"),
    shopify_update: t("actions.shopify_update"),
    http_request: t("actions.http_request"),
    generate_pdf: t("actions.generate_pdf"),
    translate_text: t("actions.translate_text"),
    compress_files: t("actions.compress_files"),
    resize_image: t("actions.resize_image"),
    convert_format: t("actions.convert_format"),
    trello_create: t("actions.trello_create"),
    asana_create: t("actions.asana_create"),
    clickup_create: t("actions.clickup_create"),
    stripe_charge: t("actions.stripe_charge"),
    mailchimp_add: t("actions.mailchimp_add"),
    sendgrid_send: t("actions.sendgrid_send"),
    twilio_call: t("actions.twilio_call"),
    zoom_create: t("actions.zoom_create"),
    google_ads_update: t("actions.google_ads_update"),
    facebook_ads_update: t("actions.facebook_ads_update"),
    youtube_upload: t("actions.youtube_upload"),
    wordpress_post: t("actions.wordpress_post"),
    supabase_insert: t("actions.supabase_insert"),
    redis_set: t("actions.redis_set"),
    mqtt_publish: t("actions.mqtt_publish"),
    s3_upload: t("actions.s3_upload"),
  };
  const weekday = [t("weekdays.d1"), t("weekdays.d2"), t("weekdays.d3"), t("weekdays.d4"), t("weekdays.d5"), t("weekdays.d6"), t("weekdays.d7")];
  // «Όταν → Αν → Κάνε»: the part of the sentence each box is (lib/automations/boxes.ts SENTENCE_PART).
  const part: Record<SentencePart, string> = { when: t("parts.when"), if: t("parts.if"), do: t("parts.do") };
  const needs = CONNECTION_NAME;
  function start(box: StartBox): string {
    if (box.when === "file_uploaded") return t("start.file");
    if (box.when === "webhook") return t("start.webhook");
    if (box.when === "new_email") return t("start.new_email");
    if (box.when === "rss") return t("start.rss");
    if (box.when === "form_submitted") return t("start.form_submitted");
    if (box.when === "chat_message") return t("start.chat_message");
    if (box.when === "app_event") return t("start.app_event");
    if (box.when === "manual") return t("start.manual");
    if (box.when === "time") {
      if (box.every === "day") return t("start.day", { at: box.at });
      if (box.every === "weekdays") return t("start.weekdays", { at: box.at });
      if (box.every === "week") return t("start.week", { day: weekday[(box.weekday ?? 1) - 1], at: box.at });
      return t("start.month", { day: box.monthDay ?? 1, at: box.at });
    }
    return t("start.file");
  }
  function describe(box: Box): string {
    switch (box.kind) {
      case "start":
        return start(box);
      case "read":
        return source[box.source];
      case "ai":
        return box.instruction;
      case "condition":
        return t("condition");
      case "approval":
        return t("approval");
      case "action":
        return action[box.do];
    }
  }
  return { t, kind, source, action, weekday, part, needs, describe };
}

/** What one step of a run did, in the reader's words: the history's lines and the canvas's failure mark say it the same way. */
function useNoteWords(): (step: RunStep) => string {
  const t = useTranslations("dashboard.automations");
  return (step) => {
    const note: Record<RunStep["note"], string> = {
      started: t("notes.started"),
      read_items: t("notes.read_items", { count: step.count ?? 0 }),
      read_nothing: t("notes.read_nothing"),
      ai_done: t("notes.ai_done"),
      condition_empty: t("notes.condition_empty"),
      condition_met: t("notes.condition_met"),
      approval_waiting: t("notes.approval_waiting"),
      approval_given: t("notes.approval_given"),
      would_wait: t("notes.would_wait"),
      sent: t("notes.sent"),
      would_send: t("notes.would_send"),
      saved: t("notes.saved"),
      would_save: t("notes.would_save"),
      not_connected: t("notes.not_connected"),
      no_file: t("notes.no_file"),
      over_limit: t("notes.over_limit"),
      no_credits: t("notes.no_credits"),
      rate_limited: t("notes.rate_limited"),
      provider: t("notes.provider"),
      unsafe: t("notes.unsafe"),
      delivery: t("notes.delivery"),
      failed: t("notes.failed"),
    };
    return note[step.note];
  };
}

/**
 * ONE LINE BETWEEN TWO BOXES OF THE PRO CANVAS, in the state the run puts
 * it in (lib/automations/run-progress.ts): idle is the border colour and
 * still; `done` is lit; `active` is lit with two dots travelling down it
 * into the box the run is in. The look is globals.css's `.flow-line`,
 * which also takes the dots away, and keeps the line bright, for anybody
 * who asked for less motion.
 */
function FlowLine({ state }: { state: LineState }) {
  return (
    <span aria-hidden="true" data-testid="flow-line" data-state={state} className="flow-line">
      {state === "active" && (
        <>
          <span className="flow-dot" />
          <span className="flow-dot" />
        </>
      )}
    </span>
  );
}

/** One box, as a short line: what the field says it will change. */
export function useBoxLabel(): (box: Box) => string {
  const { kind } = useWords();
  return (box) => kind[box.kind];
}

/** The icon for one box — a 20px lucide icon, coloured by kind. */
function BoxIconInner({ box }: { box: Box }) {
  const cls = "h-5 w-5";
  if (box.kind === "start") {
    if (box.when === "file_uploaded") return <FileUp className={cls} aria-hidden="true" />;
    if (box.when === "webhook") return <Webhook className={cls} aria-hidden="true" />;
    if (box.when === "new_email") return <Mail className={cls} aria-hidden="true" />;
    if (box.when === "rss") return <Rss className={cls} aria-hidden="true" />;
    if (box.when === "form_submitted") return <FormInput className={cls} aria-hidden="true" />;
    if (box.when === "chat_message") return <MessageCircle className={cls} aria-hidden="true" />;
    if (box.when === "app_event") return <Zap className={cls} aria-hidden="true" />;
    if (box.when === "manual") return <Play className={cls} aria-hidden="true" />;
    return <Clock className={cls} aria-hidden="true" />;
  }
  if (box.kind === "read") {
    if (box.source.startsWith("calendar_")) return <CalendarDays className={cls} aria-hidden="true" />;
    if (box.source === "uploaded_file") return <FileUp className={cls} aria-hidden="true" />;
    if (box.source === "google_sheets" || box.source === "airtable_records") return <Table2 className={cls} aria-hidden="true" />;
    if (box.source === "website_scrape") return <Globe className={cls} aria-hidden="true" />;
    if (box.source === "rss_feed") return <Rss className={cls} aria-hidden="true" />;
    if (box.source === "last_emails" || box.source === "discord_messages") return <Mail className={cls} aria-hidden="true" />;
    if (box.source === "database_query") return <Database className={cls} aria-hidden="true" />;
    if (box.source === "crm_contacts" || box.source === "hubspot_contacts") return <BookOpen className={cls} aria-hidden="true" />;
    if (box.source === "social_mentions") return <Hash className={cls} aria-hidden="true" />;
    if (box.source === "analytics_report") return <BarChart3 className={cls} aria-hidden="true" />;
    if (box.source === "notion_pages") return <FileText className={cls} aria-hidden="true" />;
    if (box.source === "google_drive_files") return <FolderUp className={cls} aria-hidden="true" />;
    if (box.source === "jira_issues" || box.source === "trello_cards" || box.source === "asana_tasks" || box.source === "clickup_tasks") return <Layers className={cls} aria-hidden="true" />;
    if (box.source === "github_issues") return <GitBranch className={cls} aria-hidden="true" />;
    if (box.source === "shopify_orders") return <ShoppingCart className={cls} aria-hidden="true" />;
    if (box.source === "http_request") return <Globe className={cls} aria-hidden="true" />;
    if (box.source === "pdf_extract") return <FileText className={cls} aria-hidden="true" />;
    if (box.source === "weather_data") return <Cloud className={cls} aria-hidden="true" />;
    if (box.source === "stock_prices") return <DollarSign className={cls} aria-hidden="true" />;
    if (box.source === "stripe_payments") return <CreditCard className={cls} aria-hidden="true" />;
    if (box.source === "typeform_responses" || box.source === "google_forms") return <FormInput className={cls} aria-hidden="true" />;
    return <Table2 className={cls} aria-hidden="true" />;
  }
  if (box.kind === "ai") return <Sparkles className={cls} aria-hidden="true" />;
  if (box.kind === "condition") return <Filter className={cls} aria-hidden="true" />;
  if (box.kind === "approval") return <PauseCircle className={cls} aria-hidden="true" />;
  if (box.kind === "action") {
    if (box.do === "send_telegram") return <Send className={cls} aria-hidden="true" />;
    if (box.do === "send_email" || box.do === "sendgrid_send") return <Mail className={cls} aria-hidden="true" />;
    if (box.do === "send_whatsapp") return <MessageCircle className={cls} aria-hidden="true" />;
    if (box.do === "send_slack" || box.do === "send_discord") return <MessageSquare className={cls} aria-hidden="true" />;
    if (box.do === "send_sms" || box.do === "twilio_call") return <Phone className={cls} aria-hidden="true" />;
    if (box.do === "post_instagram" || box.do === "post_facebook" || box.do === "post_twitter") return <Share2 className={cls} aria-hidden="true" />;
    if (box.do === "post_linkedin") return <Briefcase className={cls} aria-hidden="true" />;
    if (box.do === "sheets_write" || box.do === "airtable_write") return <Table2 className={cls} aria-hidden="true" />;
    if (box.do === "database_write" || box.do === "supabase_insert" || box.do === "redis_set") return <Database className={cls} aria-hidden="true" />;
    if (box.do === "webhook_post" || box.do === "http_request" || box.do === "mqtt_publish") return <Webhook className={cls} aria-hidden="true" />;
    if (box.do === "create_task" || box.do === "jira_create" || box.do === "trello_create" || box.do === "asana_create" || box.do === "clickup_create") return <Layers className={cls} aria-hidden="true" />;
    if (box.do === "create_event" || box.do === "zoom_create") return <Calendar className={cls} aria-hidden="true" />;
    if (box.do === "create_invoice" || box.do === "stripe_charge") return <CreditCard className={cls} aria-hidden="true" />;
    if (box.do === "notify") return <Bell className={cls} aria-hidden="true" />;
    if (box.do === "notion_write") return <FileText className={cls} aria-hidden="true" />;
    if (box.do === "google_drive_upload" || box.do === "s3_upload") return <FolderUp className={cls} aria-hidden="true" />;
    if (box.do === "github_create") return <GitBranch className={cls} aria-hidden="true" />;
    if (box.do === "hubspot_update" || box.do === "mailchimp_add") return <BookOpen className={cls} aria-hidden="true" />;
    if (box.do === "shopify_update") return <ShoppingCart className={cls} aria-hidden="true" />;
    if (box.do === "generate_pdf") return <FileOutput className={cls} aria-hidden="true" />;
    if (box.do === "translate_text") return <Globe className={cls} aria-hidden="true" />;
    if (box.do === "compress_files" || box.do === "convert_format") return <Package className={cls} aria-hidden="true" />;
    if (box.do === "resize_image") return <Image className={cls} aria-hidden="true" />;
    if (box.do === "google_ads_update" || box.do === "facebook_ads_update") return <DollarSign className={cls} aria-hidden="true" />;
    if (box.do === "youtube_upload") return <Video className={cls} aria-hidden="true" />;
    if (box.do === "wordpress_post") return <Globe className={cls} aria-hidden="true" />;
  }
  return <BookOpen className={cls} aria-hidden="true" />;
}

/** HORIZONTAL SVG connector — left-to-right like n8n's canvas.
 *  Small port circles with a curved bezier line between them. */
function NodeConnector() {
  return (
    <div aria-hidden="true" className="flex shrink-0 items-center" style={{ width: 32 }}>
      <svg width="32" height="14" viewBox="0 0 32 14">
        <circle cx="3" cy="7" r="3" fill="#374151" stroke="#4b5563" strokeWidth="1" />
        <path d="M6 7 C12 7, 20 7, 26 7" stroke="#4b5563" strokeWidth="1.5" fill="none" />
        <circle cx="29" cy="7" r="3" fill="#374151" stroke="#4b5563" strokeWidth="1" />
      </svg>
    </div>
  );
}

/** Canvas wrapper — dot-grid background like n8n's infinite canvas. */
function FlowCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-x-auto rounded-xl px-6 py-6"
      style={{
        background: "rgb(var(--panel) / 0.4)",
        backgroundImage: "radial-gradient(circle, rgb(var(--foreground) / 0.06) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
        border: "1px solid rgb(var(--border) / 0.3)",
        minHeight: 200,
      }}
    >
      {children}
    </div>
  );
}

export function BoxRow({
  boxes,
  chosen,
  onChoose,
  connected,
  progress,
  onAdd,
  onDelete,
  lastRunSteps,
}: {
  boxes: Box[];
  chosen: string | null;
  onChoose: (id: string) => void;
  connected: Connected;
  /** Where the followed run is (lib/automations/run-progress.ts), for
   *  the readers "agents-automations-pro" is open to. Omitted, the row is
   *  drawn exactly as it was before: a short still line, nothing marked. */
  progress?: RunProgress | null;
  /** n8n-style: add a new box AFTER the given index, with the chosen kind. */
  onAdd?: (afterIndex: number, kind: Box["kind"]) => void;
  /** Delete a box by id (start cannot be deleted). */
  onDelete?: (boxId: string) => void;
  /** Steps from the last run — shown as a summary on each node. */
  lastRunSteps?: RunStep[];
}) {
  const { t, kind, needs, describe } = useWords();
  const noteWords = useNoteWords();
  /** Which "+" was clicked — shows the type picker at that index. */
  const [addAt, setAddAt] = useState<number | null>(null);
  /** The 5 addable kinds (start is never added manually). */
  const ADD_KINDS: Box["kind"][] = ["read", "ai", "condition", "approval", "action"];
  return (
    <FlowCanvas>
    <ol data-testid="flow-boxes" data-live={progress ? progress.live : undefined} aria-busy={progress?.live || undefined} className="flex items-start gap-0">
      {boxes.map((box, i) => {
        const missing = connectionsNeeded([box]).filter((need) => !connected[need]);
        const state = progress?.boxes[box.id] ?? "idle";
        const lastStep = lastRunSteps?.find((s) => s.box === box.id);
        const failed = progress?.failed?.box === box.id ? progress.failed : null;
        const theme = NODE_THEME[box.kind];
        const stateBorder = STATE_BORDER[state];
        const isChosen = chosen === box.id;
        return (
          <li key={box.id} className="relative flex shrink-0 items-start">
            {/* Horizontal SVG connector between nodes */}
            {i > 0 && (progress
              ? <span className="flex items-center"><FlowLine state={progress.lines[i - 1] ?? "idle"} /></span>
              : <NodeConnector />
            )}
            {/* Node + sub-elements in a column */}
            <div className="flex flex-col items-center">
            {/* ── n8n NODE — HORIZONTAL LAYOUT ──
             *  Compact card: icon on top, name below. Arranged left-to-right
             *  like n8n's canvas. Each node is ~120px wide. */}
            <button
              type="button"
              onClick={() => onChoose(box.id)}
              aria-pressed={isChosen}
              data-testid="flow-box"
              data-kind={box.kind}
              data-state={progress ? state : undefined}
              className="flex w-28 flex-col items-center gap-1.5 rounded-xl bg-panel px-2 py-3 text-center transition-all"
              style={{
                border: isChosen
                  ? `2px solid ${theme.border}`
                  : stateBorder
                    ? `2px solid ${stateBorder}`
                    : "1px solid rgb(var(--border) / 0.5)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
              }}
            >
              {/* Coloured icon — the main visual element */}
              <div className="relative">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: theme.icon }}
                >
                  <span style={{ color: theme.iconText }}><BoxIconInner box={box} /></span>
                </div>
                {/* Status badge — top right of icon */}
                {state === "done" && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full" style={{ background: "#dcfce7", border: "1.5px solid #10b981" }}><Check className="h-2.5 w-2.5" style={{ color: "#10b981" }} aria-hidden="true" /></span>}
                {state === "failed" && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold" style={{ background: "#fee2e2", border: "1.5px solid #ef4444", color: "#ef4444" }}>✕</span>}
                {state === "active" && <span className="absolute -right-1 -top-1"><ThinkingIndicator size="sm" /><span className="sr-only">{t("runStatus.running")}</span></span>}
              </div>
              {/* Kind label */}
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: theme.label }}>{kind[box.kind]}</span>
              {/* 1-line description */}
              <span className="w-full truncate text-[10px] leading-tight text-muted" title={describe(box)}>{describe(box)}</span>
              {/* Run result */}
              {lastStep && !progress?.live && (
                <span className={`w-full truncate text-[8px] ${lastStep.status === "failed" ? "text-danger" : lastStep.status === "ok" ? "text-success" : "text-muted"}`}>
                  {noteWords(lastStep)}
                </span>
              )}
            </button>
            {/* Delete button (not for start — every flow needs one) */}
            {onDelete && box.kind !== "start" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(box.id); }}
                data-testid="flow-box-delete"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-panel text-muted opacity-0 shadow transition-opacity hover:text-danger group-hover:opacity-100 [li:hover>&]:opacity-100"
                style={{ border: "1px solid rgb(var(--border))" }}
                title={t("edit.delete")}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
            {box.kind === "condition" && (
              <span data-testid="flow-branch" className="mt-1 text-[11px] text-muted">
                {t("conditionElse")}
              </span>
            )}
            {failed && (
              <p data-testid="flow-failed" className="mt-1 ps-3 text-xs text-danger">
                {t("failedHere", { reason: noteWords({ box: failed.box, status: "failed", note: failed.note }) })}
              </p>
            )}
            {missing.map((need) => (
              <p key={need} data-testid="flow-needs" className="mt-1 flex flex-wrap items-center gap-2 ps-3 text-xs text-warning">
                {t("needsConnection", { name: needs[need] })}
                <Link href={CONNECT_AT[need]} className="inline-flex min-h-[44px] items-center text-foreground underline underline-offset-2">
                  {t("connect")}
                </Link>
              </p>
            ))}
            {/* n8n-style "+" button → opens type picker */}
            {onAdd && i < boxes.length - 1 && (
              <div className="relative mt-1">
                <button
                  type="button"
                  onClick={() => setAddAt(addAt === i ? null : i)}
                  data-testid="flow-add"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-panel hover:text-foreground [li:hover>&]:opacity-100"
                  style={{ border: "1px dashed rgb(var(--border))" }}
                  title={t("edit.add")}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {/* Type picker popup */}
                {addAt === i && (
                  <div className="absolute left-1/2 z-10 mt-1 flex -translate-x-1/2 gap-1 rounded-lg bg-panel p-1.5 shadow-lg" style={{ border: "1px solid rgb(var(--border))" }}>
                    {ADD_KINDS.map((k) => {
                      const th = NODE_THEME[k];
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => { setAddAt(null); onAdd(i, k); }}
                          className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors hover:bg-panel-hover"
                          style={{ color: th.border }}
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: th.bg }}>
                            {k === "read" && <Table2 className="h-3.5 w-3.5" />}
                            {k === "ai" && <Sparkles className="h-3.5 w-3.5" />}
                            {k === "condition" && <Filter className="h-3.5 w-3.5" />}
                            {k === "approval" && <PauseCircle className="h-3.5 w-3.5" />}
                            {k === "action" && <Send className="h-3.5 w-3.5" />}
                          </span>
                          {kind[k]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>{/* end node column */}
          </li>
        );
      })}
      {/* "+" at the end → type picker */}
      {onAdd && (
        <li className="relative flex shrink-0 items-center ps-2">
          <button
            type="button"
            onClick={() => setAddAt(addAt === -1 ? null : -1)}
            data-testid="flow-add-end"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-all hover:bg-panel hover:text-foreground"
            style={{ border: "1px dashed rgb(var(--border))" }}
            title={t("edit.add")}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          {addAt === -1 && (
            <div className="absolute top-10 z-10 flex gap-1 rounded-lg bg-panel p-1.5 shadow-lg" style={{ border: "1px solid rgb(var(--border))" }}>
              {ADD_KINDS.map((k) => {
                const th = NODE_THEME[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setAddAt(null); onAdd(boxes.length - 1, k); }}
                    className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors hover:bg-panel-hover"
                    style={{ color: th.border }}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: th.bg }}>
                      {k === "read" && <Table2 className="h-3.5 w-3.5" />}
                      {k === "ai" && <Sparkles className="h-3.5 w-3.5" />}
                      {k === "condition" && <Filter className="h-3.5 w-3.5" />}
                      {k === "approval" && <PauseCircle className="h-3.5 w-3.5" />}
                      {k === "action" && <Send className="h-3.5 w-3.5" />}
                    </span>
                    {kind[k]}
                  </button>
                );
              })}
            </div>
          )}
        </li>
      )}
    </ol>
    </FlowCanvas>
  );
}

/**
 * THE SAME AUTOMATION, IN PLAIN WORDS: Simple's half of the «Simple | Pro»
 * switch (the owner's «55. AGENTS ΚΑΙ AUTOMATIONS: SIMPLE ΚΑΙ PRO»,
 * 2026-11-04, Κομμάτι 1) — «βλέπεις τα βήματα σε λίστα, με απλά λόγια».
 *
 * THE SAME `boxes` ARRAY `BoxRow` ABOVE DRAWS, read through the same
 * `useWords().describe`. That is the whole point of the switch: «ό,τι
 * φτιάχνεις στο Simple ανοίγει και στο Pro, και αντίστροφα», so there is
 * no second shape to keep in step and no second place a step could go
 * missing. Pressing Pro draws the identical row of boxes it always did.
 *
 * WHAT SIMPLE LEAVES OUT IS THE MECHANISM, NOT THE AUTOMATION: no kind
 * labels (ΕΝΑΡΞΗ/ΑΝΑΓΝΩΣΗ/ΣΥΝΘΗΚΗ are the words Pro teaches), no branch
 * drawn beside a condition — the condition says both halves in one
 * sentence instead — and nothing to press, because configuring a step is
 * what Pro is for. Every step is still shown: a reader of Simple who
 * counts the lines gets the same number Pro draws boxes.
 *
 * A BOX THAT NEEDS A CONNECTION STILL SAYS SO. It is not mechanism, it is
 * the reason the automation cannot be switched on, and hiding it in
 * Simple would leave a person with a dead «Ενεργοποίηση» and no sentence
 * anywhere saying why (the `flow-needs` line `BoxRow` draws, same text,
 * same press to the connection).
 */
export function FlowSteps({ boxes, connected, preview = false }: { boxes: Box[]; connected: Connected; /** A template's card (components/automations/template-gallery.tsx): the same steps, without the line that says Pro is where to change them. */ preview?: boolean }) {
  const { t, kind, part, needs, describe } = useWords();
  function sentence(box: Box): string {
    switch (box.kind) {
      case "read":
        return t("simple.reads", { what: describe(box) });
      case "ai":
        return t("simple.does", { what: describe(box) });
      case "condition":
        return t("simple.onlyIf");
      default:
        // start, approval and action already read as whole sentences in
        // every locale («Κάθε μέρα στις 09:00», «Περιμένει να το
        // εγκρίνεις», «Το στέλνει στο Telegram σου») — wrapping those in
        // a lead-in would say the same thing twice.
        return describe(box);
    }
  }
  return (
    <div>
      <FlowCanvas>
      <ol data-testid="flow-steps" className="flex items-start gap-0">
        {boxes.map((box, i) => {
          const missing = connectionsNeeded([box]).filter((need) => !connected[need]);
          const theme = NODE_THEME[box.kind];
          return (
            <li key={box.id} data-testid="flow-step" data-kind={box.kind} data-part={partOf(box)} className="relative flex shrink-0 items-start">
              {/* Horizontal connector */}
              {i > 0 && <NodeConnector />}
              <div className="flex flex-col items-center">
              {/* n8n NODE — compact card, icon top, name below */}
              <div
                data-testid="flow-box"
                data-kind={box.kind}
                className="flex w-28 flex-col items-center gap-1.5 rounded-xl bg-panel px-2 py-3 text-center"
                style={{ border: "1px solid rgb(var(--border) / 0.5)", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: theme.icon }}
                >
                  <span style={{ color: theme.iconText }}><BoxIconInner box={box} /></span>
                </div>
                <span data-testid="flow-step-part" className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: theme.label }}>{kind[box.kind]}</span>
                <span title={sentence(box)} className="w-full truncate text-[10px] leading-tight text-muted">
                  {sentence(box)}
                </span>
              </div>
              {missing.map((need) => (
                <p key={need} data-testid="flow-needs" className="mt-1 text-center text-[9px] text-warning">
                  <Link href={CONNECT_AT[need]} className="underline underline-offset-2">
                    {t("connect")}
                  </Link>
                </p>
              ))}
              </div>{/* end node column */}
            </li>
          );
        })}
      </ol>
      </FlowCanvas>
      {!preview && <p className="mt-3 text-center text-xs text-muted">{t("simple.hint")}</p>}
    </div>
  );
}

/**
 * THE SAME BOX, CHANGED BY HAND: the choices a box has, as lists. Saved
 * through PATCH /api/automations/flows/[id] as a new version — free, and
 * taken back by «Αναίρεση» like a change with words.
 */
/** Render config fields for a box — n8n-style per-node settings. */
function ConfigFields({ fields, config, onChange }: { fields: ConfigField[]; config: Record<string, string>; onChange: (cfg: Record<string, string>) => void }) {
  const fieldCls = "mt-1 block min-h-[44px] w-full rounded-item bg-panel px-3 text-sm text-foreground";
  const labelCls = "block text-xs text-muted";
  return (
    <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "rgb(var(--border) / 0.3)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">⚙ Settings</p>
      {fields.map((f) => (
        <label key={f.key} className={labelCls}>
          {f.label}{f.required && <span className="text-danger"> *</span>}
          {f.type === "textarea" ? (
            <textarea
              className={`${fieldCls} min-h-[66px] py-2`}
              placeholder={f.placeholder}
              value={config[f.key] ?? ""}
              onChange={(e) => onChange({ ...config, [f.key]: e.target.value })}
            />
          ) : (
            <input
              type={f.type === "password" ? "password" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
              className={fieldCls}
              placeholder={f.placeholder}
              value={config[f.key] ?? ""}
              onChange={(e) => onChange({ ...config, [f.key]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}

export function BoxEditor({ box, saving, onSave, onDuplicate, lastOutput }: {
  box: Box;
  saving: boolean;
  onSave: (next: Box) => void;
  /** Duplicate this box (insert a copy after it). */
  onDuplicate?: () => void;
  /** The output from the last run for this box — shown in a preview panel. */
  lastOutput?: string | null;
}) {
  const { t, source, action, weekday } = useWords();
  const [draft, setDraft] = useState<Box>(box);
  const field = "mt-1 block min-h-[44px] w-full rounded-item bg-panel px-3 text-sm text-foreground";
  const label = "block text-xs text-muted";

  // Per-type config fields (n8n-style node settings)
  const configFields: ConfigField[] =
    draft.kind === "action" ? (ACTION_CONFIG[draft.do] ?? []) :
    draft.kind === "read" ? (SOURCE_CONFIG[draft.source] ?? []) : [];
  const currentConfig = (draft.kind === "action" || draft.kind === "read") ? (draft.config ?? {}) : {};

  let body: React.ReactNode = null;
  if (draft.kind === "start") {
    const timed = draft.when === "time" ? draft : null;
    body = (
      <>
        <label className={label}>
          {t("edit.when")}
          <select
            className={field}
            value={timed ? timed.every : draft.when}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "file_uploaded") setDraft({ id: draft.id, kind: "start", when: "file_uploaded" });
              else if (v === "webhook") setDraft({ id: draft.id, kind: "start", when: "webhook" });
              else if (v === "new_email") setDraft({ id: draft.id, kind: "start", when: "new_email" });
              else if (v === "rss") setDraft({ id: draft.id, kind: "start", when: "rss" });
              else if (v === "form_submitted") setDraft({ id: draft.id, kind: "start", when: "form_submitted" });
              else if (v === "chat_message") setDraft({ id: draft.id, kind: "start", when: "chat_message" });
              else if (v === "manual") setDraft({ id: draft.id, kind: "start", when: "manual" });
              else setDraft({ id: draft.id, kind: "start", when: "time", every: v as "day", at: timed?.at ?? "09:00", ...(v === "week" ? { weekday: timed?.weekday ?? 1 } : {}), ...(v === "month" ? { monthDay: timed?.monthDay ?? 1 } : {}) });
            }}
          >
            <optgroup label="⏰ Schedule">
              <option value="day">{t("edit.everyDay")}</option>
              <option value="weekdays">{t("edit.everyWeekdays")}</option>
              <option value="week">{t("edit.everyWeek")}</option>
              <option value="month">{t("edit.everyMonth")}</option>
            </optgroup>
            <optgroup label="⚡ Events">
              <option value="file_uploaded">{t("start.file")}</option>
              <option value="webhook">{t("start.webhook")}</option>
              <option value="new_email">{t("start.new_email")}</option>
              <option value="rss">{t("start.rss")}</option>
              <option value="form_submitted">{t("start.form_submitted")}</option>
              <option value="chat_message">{t("start.chat_message")}</option>
              <option value="manual">{t("start.manual")}</option>
            </optgroup>
          </select>
        </label>
        {timed && (
          <label className={label}>
            {t("edit.at")}
            <input type="time" className={field} value={timed.at} onChange={(e) => setDraft({ ...timed, at: e.target.value })} />
          </label>
        )}
        {timed?.every === "week" && (
          <label className={label}>
            {t("edit.weekday")}
            <select className={field} value={timed.weekday ?? 1} onChange={(e) => setDraft({ ...timed, weekday: Number(e.target.value) })}>
              {weekday.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {timed?.every === "month" && (
          <label className={label}>
            {t("edit.monthDay")}
            <input type="number" min={1} max={28} className={field} value={timed.monthDay ?? 1} onChange={(e) => setDraft({ ...timed, monthDay: Number(e.target.value) })} />
          </label>
        )}
      </>
    );
  } else if (draft.kind === "read") {
    const read = draft;
    body = (
      <>
        <label className={label}>
          {t("edit.source")}
          <select className={field} value={read.source} onChange={(e) => setDraft({ ...read, source: e.target.value as ReadSource, config: undefined })}>
            {READ_SOURCES.map((s) => (
              <option key={s} value={s}>
                {source[s]}
              </option>
            ))}
          </select>
        </label>
        {configFields.length > 0 && (
          <ConfigFields fields={configFields} config={currentConfig} onChange={(cfg) => setDraft({ ...read, config: cfg })} />
        )}
      </>
    );
  } else if (draft.kind === "ai") {
    const ai = draft;
    body = (
      <label className={label}>
        {t("edit.instruction")}
        <textarea
          className={`${field} min-h-[88px] py-2`}
          maxLength={MAX_INSTRUCTION_CHARS}
          value={ai.instruction}
          onChange={(e) => setDraft({ ...ai, instruction: e.target.value })}
        />
      </label>
    );
  } else if (draft.kind === "action") {
    const act = draft;
    body = (
      <>
        <label className={label}>
          {t("edit.do")}
          <select className={field} value={act.do} onChange={(e) => setDraft({ ...act, do: e.target.value as ActionKind, config: undefined })}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {action[a]}
              </option>
            ))}
          </select>
        </label>
        {configFields.length > 0 && (
          <ConfigFields fields={configFields} config={currentConfig} onChange={(cfg) => setDraft({ ...act, config: cfg })} />
        )}
      </>
    );
  } else {
    body = <p className="text-xs text-muted">{t("edit.nothing")}</p>;
  }

  const editable = draft.kind !== "condition" && draft.kind !== "approval";
  const theme = NODE_THEME[box.kind];
  return (
    <div data-testid="flow-box-editor" className="space-y-3 rounded-xl p-4" style={{ background: "rgb(var(--panel) / 0.6)", border: "1px solid rgb(var(--border) / 0.4)" }}>
      {/* Header with node colour accent */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ background: theme.bg }}>
          <BoxIconInner box={box} />
        </span>
        <p className="flex-1 text-xs font-bold" style={{ color: theme.border }}>{t("edit.title")}</p>
        {/* Duplicate button */}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[10px] text-muted transition-colors hover:bg-panel hover:text-foreground"
            style={{ border: "1px solid rgb(var(--border) / 0.3)" }}
          >
            <Layers className="h-3 w-3" aria-hidden="true" />
            Duplicate
          </button>
        )}
      </div>
      {body}
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {editable && (
          <button
            type="button"
            disabled={saving || JSON.stringify(draft) === JSON.stringify(box)}
            onClick={() => onSave(draft)}
            data-testid="flow-box-save"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 text-xs font-medium text-white disabled:opacity-60"
            style={{ background: saving ? theme.bgHover : theme.bg }}
          >
            {saving ? <ThinkingIndicator size="sm" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {t("edit.save")}
          </button>
        )}
      </div>
      {/* n8n-style OUTPUT PREVIEW — shows the last run result for this node */}
      {lastOutput && (
        <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: "rgb(var(--border) / 0.3)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">📄 Output</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-panel p-3 text-[11px] text-foreground" style={{ border: "1px solid rgb(var(--border) / 0.3)" }}>
            {lastOutput}
          </pre>
        </div>
      )}
    </div>
  );
}

function StepLine({ step, boxes }: { step: RunStep; boxes: Box[] }) {
  const { t, kind } = useWords();
  const noteWords = useNoteWords();
  const box = boxes.find((b) => b.id === step.box);
  const tone = step.status === "failed" ? "text-danger" : step.status === "stopped" || step.status === "waiting" ? "text-warning" : "text-body";
  return (
    <li data-testid="flow-step" data-status={step.status} className={`flex items-baseline gap-2 text-xs ${tone}`}>
      <span className="w-24 shrink-0 text-muted">{box ? kind[box.kind] : step.box}</span>
      <span className="min-w-0 flex-1 break-words">{noteWords(step)}</span>
      {typeof step.credits === "number" && step.credits > 0 && <span className="shrink-0 text-muted">{t("credits", { count: step.credits })}</span>}
    </li>
  );
}

export function RunHistory({
  runs,
  boxes,
  locale,
  timeZone,
  busy,
  onApprove,
  onCancel,
  openId,
}: {
  runs: ShownRun[];
  boxes: Box[];
  locale: string;
  timeZone: string;
  busy: string | null;
  onApprove: (run: ShownRun) => void;
  onCancel: (run: ShownRun) => void;
  /** A run to open on arrival: the one a notification pointed at. */
  openId?: string | null;
}) {
  const { t } = useWords();
  const [open, setOpen] = useState<string | null>(openId ?? runs.find((r) => r.status === "waiting_approval")?.id ?? null);
  const when = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch {
      return iso.slice(0, 16).replace("T", " ");
    }
  };
  const by: Record<ShownRun["startedBy"], string> = { time: t("by.time"), event: t("by.event"), manual: t("by.manual"), dry: t("by.dry") };
  const status: Record<ShownRun["status"], string> = {
    queued: t("runStatus.queued"),
    running: t("runStatus.running"),
    waiting_approval: t("runStatus.waiting_approval"),
    done: t("runStatus.done"),
    stopped: t("runStatus.stopped"),
    failed: t("runStatus.failed"),
    cancelled: t("runStatus.cancelled"),
  };
  const reason: Record<string, string> = {
    approval_expired: t("runErrors.approval_expired"),
    interrupted: t("runErrors.interrupted"),
    switched_off: t("runErrors.off"),
    flow_off: t("runErrors.off"),
  };

  if (runs.length === 0) return <p className="text-xs text-muted">{t("historyEmpty")}</p>;
  return (
    <ul data-testid="flow-history" className="space-y-2">
      {runs.map((run) => {
        const expanded = open === run.id;
        const code = errorCode(run.error);
        return (
          <li key={run.id} data-testid="flow-run" data-status={run.status} className="overflow-hidden rounded-lg" style={{ border: "1px solid rgb(var(--border) / 0.3)" }}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : run.id)}
              aria-expanded={expanded}
              className="flex min-h-[44px] w-full items-center gap-2.5 px-3 py-2 text-start text-xs transition-colors hover:bg-panel/80"
              style={{ background: "rgb(var(--panel) / 0.4)" }}
            >
              {/* n8n-style status dot */}
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: run.status === "done" ? "#10b981"
                    : run.status === "failed" ? "#ef4444"
                    : run.status === "running" ? "#8b5cf6"
                    : run.status === "waiting_approval" ? "#f59e0b"
                    : "#6b7280",
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="text-foreground">{when(run.startedAt)}</span>
                <span className="ms-1.5 text-muted">{by[run.startedBy]}</span>
              </span>
              <span className={`text-[10px] font-medium ${run.status === "failed" ? "text-danger" : run.status === "waiting_approval" ? "text-warning" : run.status === "done" ? "text-success" : "text-body"}`}>{status[run.status]}</span>
              <span className="text-[10px] text-muted">{run.credits > 0 ? t("credits", { count: run.credits }) : ""}</span>
            </button>
            {expanded && (
              <div className="space-y-2 px-3 pb-3">
                {code && reason[code] && <p className="text-xs text-muted">{reason[code]}</p>}
                {run.steps.length > 0 && (
                  <ol className="space-y-1">
                    {run.steps.map((step, i) => (
                      <StepLine key={`${step.box}-${i}`} step={step} boxes={boxes} />
                    ))}
                  </ol>
                )}
                {run.output && (
                  <div>
                    <p className="text-[11px] text-muted">{run.startedBy === "dry" ? t("wouldSend") : run.status === "waiting_approval" ? t("toApprove") : t("result")}</p>
                    <p data-testid="flow-output" className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-item bg-panel px-3 py-2 text-xs text-foreground">
                      {run.output}
                    </p>
                  </div>
                )}
                {run.status === "waiting_approval" && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => onApprove(run)}
                        data-testid="flow-approve"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs font-medium text-foreground hover:bg-panel-hover disabled:opacity-60"
                      >
                        {busy === run.id ? <ThinkingIndicator size="sm" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        {t("approve")}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => onCancel(run)}
                        data-testid="flow-cancel"
                        className="inline-flex min-h-[44px] items-center rounded-item px-3 text-xs text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-60"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                    {run.approvalExpiresAt && <p className="text-[11px] text-muted">{t("approveHint", { when: when(run.approvalExpiresAt) })}</p>}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * THE MOST ONE RUN MAY COST (automation_flows.cost_limit), set by hand.
 * The runner stops a run before the AI box that would pass it
 * (lib/automations/runner.ts); the route holds it to the column's bounds.
 */
export function CostLimitForm({ limit, saving, onSave }: { limit: number; saving: boolean; onSave: (limit: number) => void }) {
  const { t } = useWords();
  const [draft, setDraft] = useState(String(limit));
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Number(draft));
      }}
    >
      <label htmlFor="flow-limit" className="block text-xs text-muted">
        {t("limit")}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="flow-limit"
          type="number"
          min={1}
          max={5000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="flow-limit"
          className="min-h-[44px] w-28 rounded-item bg-panel px-3 text-sm text-foreground"
        />
        <span className="text-xs text-muted">{t("limitUnit")}</span>
        <button
          type="submit"
          disabled={saving || draft === String(limit)}
          data-testid="flow-limit-save"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover disabled:opacity-60"
        >
          {t("limitSave")}
        </button>
      </div>
      <p className="text-[11px] text-muted">{t("limitHelp")}</p>
    </form>
  );
}

/**
 * «ΣΟΥ ΓΛΊΤΩΣΕ ~X ΏΡΕΣ» (the owner, 2026-11-05; the switch
 * "automation-time-saved"): how many minutes the job used to take, typed
 * by the person, and what that comes to — finished runs × those minutes
 * (lib/automations/time-saved.ts), with both factors printed under the
 * figure so it can be checked by eye. With no minutes it shows the field
 * and nothing else: not a zero, not a guess.
 *
 * Drawn only when the page could read the column at all
 * (lib/automations/page-data.ts loadMinutesSaved), so a database the
 * migration has not reached yet never offers a field that cannot save.
 */
export function TimeSavedForm({ minutes, doneRuns, saving, onSave }: { minutes: number | null; doneRuns: number; saving: boolean; onSave: (minutes: number | null) => void }) {
  const { t } = useWords();
  const [draft, setDraft] = useState(minutes === null ? "" : String(minutes));
  const saved = timeSaved(doneRuns, minutes);
  return (
    <form
      className="space-y-1"
      data-testid="flow-time-saved"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft.trim() === "" ? null : Number(draft));
      }}
    >
      {saved.kind !== "none" && (
        <div data-testid="flow-time-saved-result" data-kind={saved.kind} className="mb-2 space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <Timer className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            {saved.kind === "hours" ? t("timeSaved.hours", { hours: saved.hours }) : saved.kind === "minutes" ? t("timeSaved.minutes", { minutes: saved.total }) : t("timeSaved.notYet")}
          </p>
          {saved.kind !== "not_yet" && <p data-testid="flow-time-saved-how" className="text-[11px] text-muted">{t("timeSaved.how", { runs: saved.runs, minutes: saved.minutesPerRun })}</p>}
        </div>
      )}
      <label htmlFor="flow-minutes" className="block text-xs text-muted">
        {t("timeSaved.label")}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="flow-minutes"
          type="number"
          inputMode="numeric"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="flow-minutes"
          className="min-h-[44px] w-28 rounded-item bg-panel px-3 text-sm text-foreground"
        />
        <span className="text-xs text-muted">{t("timeSaved.unit")}</span>
        <button
          type="submit"
          disabled={saving || draft.trim() === (minutes === null ? "" : String(minutes))}
          data-testid="flow-minutes-save"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover disabled:opacity-60"
        >
          {t("limitSave")}
        </button>
      </div>
      <p className="text-[11px] text-muted">{t("timeSaved.help")}</p>
    </form>
  );
}

/**
 * HOW ONE AUTOMATION RUNS (automation_flows.mode, Automations Κομμάτι 2a,
 * lib/automations/boxes.ts FlowMode): Auto runs for real; Shadow rehearses
 * every unattended start (cron, a queued file) and runs for real only when
 * pressed by hand (effectiveDry's own manual exemption); Supervised gates
 * every action behind an approval, even one already in the boxes.
 *
 * Drawn only when the page could read the column at all (same precedent
 * as TimeSavedForm above — lib/automations/page-data.ts loadModes), so a
 * database the migration has not reached yet never offers a selector that
 * cannot save.
 */
export function ModeForm({ mode, saving, onSave }: { mode: FlowMode; saving: boolean; onSave: (mode: FlowMode) => void }) {
  const { t } = useWords();
  const NAME: Record<FlowMode, string> = { auto: t("mode.auto"), shadow: t("mode.shadow"), supervised: t("mode.supervised") };
  const HELP: Record<FlowMode, string> = { auto: t("mode.autoHelp"), shadow: t("mode.shadowHelp"), supervised: t("mode.supervisedHelp") };
  return (
    <div className="space-y-1" data-testid="flow-mode">
      <span className="block text-xs text-muted">{t("mode.label")}</span>
      {/* Same `bg-panel` TRACK + selected-pill shape as components/shell/
       *  tool-shell.tsx's ShellModeSwitch, for the same reason its own
       *  comment gives: a track separates the choices from the row
       *  without one more border against design-density.test.mjs's
       *  ceiling. */}
      <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-panel p-0.5" role="group" aria-label={t("mode.label")}>
        {FLOW_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === mode}
            disabled={saving}
            data-testid={`flow-mode-${m}`}
            onClick={() => m !== mode && onSave(m)}
            className={`min-h-[44px] whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors duration-150 disabled:opacity-60 ${
              m === mode ? "bg-foreground text-background" : "text-muted hover:text-foreground"
            }`}
          >
            {NAME[m]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted" data-testid="flow-mode-help">{HELP[mode]}</p>
    </div>
  );
}

/**
 * THE APPROVAL CENTER (οδηγία 55, 2026-11-08): every run waiting for
 * approval, across EVERY automation, in one list — instead of opening
 * each automation in turn to find the one that is waiting. Approving or
 * cancelling here is the SAME two routes RunHistory's own buttons call
 * (api/automations/runs/[runId]/approve|cancel); this is a second place
 * to reach them, not a second mechanism.
 *
 * Deliberately lighter than RunHistory: no step-by-step detail (that
 * needs the owning automation's `boxes`, which differ per automation),
 * only what was made (or will be sent) and the decision. «Open» goes to
 * the automation itself for the full history.
 */
export function PendingApprovals({
  runs,
  flowName,
  locale,
  busy,
  onApprove,
  onCancel,
  onOpenFlow,
}: {
  runs: ShownRun[];
  /** flow id → name, from the screen's already-loaded flows list. A run
   *  whose flow is not in this map (deleted since) is skipped: nothing
   *  for the person to open, and the route itself refuses it already. */
  flowName: Record<string, string>;
  locale: string;
  busy: string | null;
  onApprove: (run: ShownRun) => void;
  onCancel: (run: ShownRun) => void;
  onOpenFlow: (flowId: string) => void;
}) {
  const { t } = useWords();
  const when = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch {
      return iso.slice(0, 16).replace("T", " ");
    }
  };
  const visible = runs.filter((r) => flowName[r.flowId]);
  if (visible.length === 0) return <p className="text-xs text-muted">{t("pendingApprovals.empty")}</p>;
  return (
    <ul data-testid="pending-approvals" className="space-y-2">
      {visible.map((run) => (
        <li key={run.id} data-testid="pending-approval" className="space-y-1.5 rounded-item bg-panel/60 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onOpenFlow(run.flowId)}
            data-testid="pending-approval-open"
            className="block text-start text-xs font-medium text-foreground hover:underline"
          >
            {flowName[run.flowId]}
          </button>
          {run.output && (
            <p data-testid="pending-approval-output" className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-item bg-panel px-3 py-2 text-xs text-foreground">
              {run.output}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => onApprove(run)}
              data-testid="pending-approval-approve"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs font-medium text-foreground hover:bg-panel-hover disabled:opacity-60"
            >
              {busy === run.id ? <ThinkingIndicator size="sm" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {t("approve")}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => onCancel(run)}
              data-testid="pending-approval-cancel"
              className="inline-flex min-h-[44px] items-center rounded-item px-3 text-xs text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-60"
            >
              {t("cancel")}
            </button>
          </div>
          {run.approvalExpiresAt && <p className="text-[11px] text-muted">{t("approveHint", { when: when(run.approvalExpiresAt) })}</p>}
        </li>
      ))}
    </ul>
  );
}
