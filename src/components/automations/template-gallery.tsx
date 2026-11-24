"use client";

import { useTranslations } from "next-intl";
import { Plus, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { FlowSteps, type Connected } from "@/components/automations/flow-boxes";
import { aiBoxCount } from "@/lib/automations/boxes";
import { GALLERY, templateBoxes, type SoonTemplateId, type TemplateId } from "@/lib/automations/templates";

/**
 * THE READY-MADE AUTOMATIONS (the owner, 2026-11-05, after the automation
 * videos; the switch "automation-templates"), drawn in the work area when
 * «Έτοιμες αυτοματοποιήσεις» is pressed under the field.
 *
 * A READY CARD SHOWS THE WHOLE AUTOMATION BEFORE THE PRESS, as Simple
 * says it — «Όταν / Κάνε», step by step, through the same FlowSteps the
 * automation will open in — and what each run will cost (the step price
 * the routes hold, times its AI boxes). One press makes it, off, and opens
 * it; nothing runs until the person switches it on.
 *
 * A «ΣΎΝΤΟΜΑ» CARD SAYS WHY IN ONE LINE AND HAS NOTHING TO PRESS
 * (lib/automations/templates.ts SOON_TEMPLATE_IDS): the product cannot
 * do it yet, and a button that made half of one would be the placeholder
 * the owner's rules forbid.
 *
 * Every word a literal key, so the message slicer sees them all
 * (lib/i18n/message-slices.ts).
 */
export function TemplateGallery({
  stepPrice,
  starting,
  disabled,
  connected,
  onStart,
}: {
  /** One AI box of one run, at the most it reads (lib/automations/flow-pricing.ts). */
  stepPrice: number;
  /** The template being made right now, if any. */
  starting: TemplateId | null;
  disabled: boolean;
  connected: Connected;
  onStart: (id: TemplateId) => void;
}) {
  const t = useTranslations("dashboard.automations");
  const group: Record<(typeof GALLERY)[number]["group"], string> = {
    finance: t("templates.groups.finance"),
    instagram: t("templates.groups.instagram"),
    ecommerce: t("templates.groups.ecommerce"),
    support: t("templates.groups.support"),
    marketing: t("templates.groups.marketing"),
    sales: t("templates.groups.sales"),
    data: "Data",
    operations: "Operations",
    monitoring: "Monitoring",
  };
  const ready: Record<TemplateId, { name: string; description: string; instruction: string }> = {
    finance_daily: { name: t("templates.finance_daily.name"), description: t("templates.finance_daily.description"), instruction: t("templates.finance_daily.instruction") },
    finance_weekly: { name: t("templates.finance_weekly.name"), description: t("templates.finance_weekly.description"), instruction: t("templates.finance_weekly.instruction") },
    ecommerce_daily: { name: t("templates.ecommerce_daily.name"), description: t("templates.ecommerce_daily.description"), instruction: t("templates.ecommerce_daily.instruction") },
    support_triage: { name: t("templates.support_triage.name"), description: t("templates.support_triage.description"), instruction: t("templates.support_triage.instruction") },
    content_repurpose: { name: t("templates.content_repurpose.name"), description: t("templates.content_repurpose.description"), instruction: t("templates.content_repurpose.instruction") },
    lead_enrich: { name: t("templates.lead_enrich.name"), description: t("templates.lead_enrich.description"), instruction: t("templates.lead_enrich.instruction") },
    // Complex n8n-style templates (2026-11-24):
    data_pipeline: { name: "Data Pipeline", description: "Scrape a website daily, extract and clean the data, and save to Google Sheets.", instruction: "Extract the key data points from this content. Format as a clean table with columns for name, value, date and source. Remove any irrelevant or duplicate entries." },
    customer_onboarding: { name: "Customer Onboarding", description: "When a new customer signs up via webhook, send welcome email, create tasks, and update CRM.", instruction: "Write a warm, professional welcome email for this new customer. Include their name, mention their plan, and list 3 quick-start steps. Keep it under 200 words." },
    social_monitor: { name: "Social Media Monitor", description: "Track social mentions daily, analyze sentiment, classify feedback, and report to Slack.", instruction: "Analyze these social mentions. For each, identify the sentiment (positive/negative/neutral), the main topic, and whether it needs a response. Prioritize complaints." },
    invoice_processor: { name: "Invoice Processor", description: "When an email arrives with an invoice, extract all fields and save to accounting.", instruction: "Extract all invoice details: vendor name, invoice number, date, due date, line items, subtotal, tax, and total amount. Format amounts with 2 decimal places." },
    competitor_tracker: { name: "Competitor Tracker", description: "Daily scrape competitor websites, compare changes, and send analysis report.", instruction: "Compare today's data with the previous version. Highlight any pricing changes, new features, removed features, or messaging changes. Assess the competitive impact of each change." },
    report_generator: { name: "Weekly Report Generator", description: "Every Monday, compile data from Sheets, analyze trends, generate PDF and distribute.", instruction: "Create a comprehensive weekly business report. Include: executive summary (3 bullets), key metrics with week-over-week changes, top performers, areas of concern, and 3 recommended actions." },
    webhook_processor: { name: "Webhook Processor", description: "Receive webhooks, validate, process with AI, store results, and respond.", instruction: "Process this webhook payload. Validate the data, extract the relevant fields, determine the appropriate action, and format a structured response." },
    crm_sync: { name: "CRM Sync", description: "Daily sync between Salesforce and HubSpot: find new contacts, enrich, and update.", instruction: "For each new contact, enrich with any available data: company size, industry, likely role, and engagement score (1-100). Flag high-priority leads (score > 70)." },
    content_pipeline: { name: "Content Pipeline", description: "Read RSS feeds, create social media posts for all platforms, get approval, and publish.", instruction: "Create 3 social media posts from this content: 1) LinkedIn (professional, 1300 chars max with hashtags), 2) Twitter/X (280 chars, punchy), 3) Facebook (casual, 500 chars). Each should have a different angle." },
    alert_system: { name: "Alert System", description: "Monitor APIs, detect failures, classify severity, and alert the team.", instruction: "Analyze this API response. If there are errors or anomalies, diagnose the likely cause, assess severity (critical/warning/info), and suggest immediate remediation steps." },
  };
  const soon: Record<SoonTemplateId, { name: string; description: string; why: string }> = {
    finance_expense_telegram: { name: t("templates.finance_expense_telegram.name"), description: t("templates.finance_expense_telegram.description"), why: t("templates.finance_expense_telegram.why") },
    instagram_to_telegram: { name: t("templates.instagram_to_telegram.name"), description: t("templates.instagram_to_telegram.description"), why: t("templates.instagram_to_telegram.why") },
  };

  return (
    <div data-testid="flow-templates" className="space-y-6">
      <p className="text-sm text-muted">{t("templates.intro")}</p>
      {GALLERY.map((g) => (
        <section key={g.group} aria-labelledby={`templates-${g.group}`} className="space-y-3">
          <h2 id={`templates-${g.group}`} className="text-xs font-medium text-foreground">
            {group[g.group]}
          </h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {g.ready.map((id) => {
              const words = ready[id];
              const boxes = templateBoxes(id, words.instruction);
              const runPrice = stepPrice * aiBoxCount(boxes);
              return (
                <li key={id} data-testid="flow-template" data-template={id} data-ready="true" className="flex flex-col gap-3 rounded-card bg-panel p-4">
                  <div className="space-y-1">
                    <h3 className="break-words text-sm font-medium text-foreground">{words.name}</h3>
                    <p className="break-words text-xs text-muted">{words.description}</p>
                  </div>
                  {/* The automation itself, as it will open: the same Simple steps. */}
                  <div className="rounded-item bg-workspace p-3">
                    <FlowSteps boxes={boxes} connected={connected} preview />
                  </div>
                  <div className="mt-auto space-y-2">
                    <p data-testid="flow-template-price" className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
                      <span>{t("templates.free")}</span>
                      <span aria-hidden="true">·</span>
                      <span>{runPrice > 0 ? t("priceRun", { count: runPrice }) : t("priceRunFree")}</span>
                    </p>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onStart(id)}
                      data-testid="flow-template-start"
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel-hover px-3 text-xs font-medium text-foreground hover:bg-tag disabled:opacity-60"
                    >
                      {starting === id ? <ThinkingIndicator size="sm" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                      {t("templates.start")}
                    </button>
                  </div>
                </li>
              );
            })}
            {g.soon.map((id) => {
              const words = soon[id];
              return (
                <li key={id} data-testid="flow-template" data-template={id} data-ready="false" className="flex flex-col gap-2 rounded-card bg-panel/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words text-sm font-medium text-body">{words.name}</h3>
                    <span data-testid="flow-template-soon" className="shrink-0 whitespace-nowrap rounded-full bg-tag px-2 py-0.5 text-[11px] text-muted">
                      {t("templates.soon")}
                    </span>
                  </div>
                  <p className="break-words text-xs text-muted">{words.description}</p>
                  <p data-testid="flow-template-why" className="break-words text-xs text-muted">
                    {words.why}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
