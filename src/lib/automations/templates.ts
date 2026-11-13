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
export const TEMPLATE_IDS = ["finance_daily", "finance_weekly"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const SOON_TEMPLATE_IDS = ["finance_expense_telegram", "instagram_to_telegram"] as const;
export type SoonTemplateId = (typeof SOON_TEMPLATE_IDS)[number];

export type TemplateGroup = "finance" | "instagram";

/** The order and grouping of the gallery: the finance assistant's three, then Instagram's one. */
export const GALLERY: readonly { group: TemplateGroup; ready: readonly TemplateId[]; soon: readonly SoonTemplateId[] }[] = [
  { group: "finance", ready: ["finance_daily", "finance_weekly"], soon: ["finance_expense_telegram"] },
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
  return [
    { id: "b1", kind: "start", when: "time", every: "week", at: "08:30", weekday: 1 },
    { id: "b2", kind: "read", source: "finances_month" },
    { id: "b3", kind: "ai", instruction },
    { id: "b4", kind: "action", do: "send_telegram" },
  ];
}

/** The template as a row the routes accept, or null when the words cannot make one. */
export function templateFlow(id: TemplateId, instruction: string): Box[] | null {
  const verdict = readFlow(templateBoxes(id, instruction));
  return verdict.ok ? verdict.boxes : null;
}
