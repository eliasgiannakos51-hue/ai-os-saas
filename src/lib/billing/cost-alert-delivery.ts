import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createResendClient } from "@/lib/resend";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin";
import { createNotification } from "@/lib/notifications/store";
import { logApiError } from "@/lib/log-error";
import type { CostAlert } from "@/lib/billing/cost-alerts";

/**
 * GETTING AN ALERT TO A PERSON, once.
 *
 * THE RATE LIMIT IS A DATABASE CLAIM, not a check. "At most one per type
 * per hour" written as SELECT-then-INSERT is a race, and this runs on a
 * schedule with retries: two overlapping runs both see nothing and both
 * send. record_cost_alert does the whole thing in one INSERT ... WHERE
 * NOT EXISTS and returns whether the row landed, so the sender is
 * whoever actually won it. Nothing is sent without winning first.
 *
 * The in-memory cooldown used by lib/email/margin-alert.ts is
 * deliberately not reused here. It is per-process, and on serverless each
 * cron invocation is a fresh process — it would never have prevented
 * anything on this path.
 *
 * DELIVERY IS RECORDED SEPARATELY from the claim, because the worst
 * outcome is a run that takes the hour's slot and then fails to send:
 * silent for an hour AND nothing delivered. A row with delivered=false is
 * exactly that, visible on the owner's page.
 */

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

/** One hour, as the brief asks. */
export const COST_ALERT_MIN_INTERVAL_SECONDS = 3600;

export type DeliveryOutcome = {
  type: string;
  /** False when another run already held this hour's slot. */
  fired: boolean;
  emailed: boolean;
  notified: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Claim the slot, then deliver. Never throws: this runs inside a cron
 * route that has other alerts to deliver after it, and one failing
 * channel must not take the rest down with it.
 */
export async function deliverCostAlert(alert: CostAlert): Promise<DeliveryOutcome> {
  const outcome: DeliveryOutcome = { type: alert.type, fired: false, emailed: false, notified: false };
  let alertId: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("record_cost_alert", {
      p_alert_type: alert.type,
      p_payload: alert.detail,
      p_min_interval_seconds: COST_ALERT_MIN_INTERVAL_SECONDS,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    outcome.fired = Boolean(row?.fired);
    alertId = (row?.alert_id as string | null) ?? null;
  } catch (err) {
    // A failed CLAIM must not send: without the claim there is no rate
    // limit, and the failure mode of getting that wrong is thousands of
    // emails rather than none.
    logApiError("cost-alerts:claim", err, { alertType: alert.type });
    return outcome;
  }

  if (!outcome.fired) return outcome;

  outcome.emailed = await emailOwners(alert);
  outcome.notified = await notifyOwners(alert);

  if (alertId && (outcome.emailed || outcome.notified)) {
    try {
      const admin = createAdminClient();
      await admin.rpc("mark_cost_alert_delivered", { p_alert_id: alertId });
    } catch (err) {
      logApiError("cost-alerts:mark_delivered", err, { alertType: alert.type });
    }
  }
  return outcome;
}

async function emailOwners(alert: CostAlert): Promise<boolean> {
  if (ADMIN_EMAILS.length === 0) return false;
  try {
    const resend = createResendClient();
    const rows = Object.entries(alert.detail)
      .map(
        ([key, value]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(key)}</td>` +
          `<td style="padding:4px 0"><strong>${escapeHtml(String(value ?? "—"))}</strong></td></tr>`
      )
      .join("");
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAILS,
      subject: `[Ionexa cost alert] ${alert.title}`,
      html:
        `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">` +
        `<h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(alert.title)}</h2>` +
        `<p style="margin:0 0 16px">${escapeHtml(alert.body)}</p>` +
        `<table style="border-collapse:collapse">${rows}</table>` +
        `<p style="margin:16px 0 0;color:#666">At most one alert of this kind per hour.</p>` +
        `</div>`,
    });
    return true;
  } catch (err) {
    logApiError("cost-alerts:email", err, { alertType: alert.type });
    return false;
  }
}

/**
 * The in-app half.
 *
 * Notifications are per USER, and an owner is a user — so this needs the
 * ids behind ADMIN_EMAILS. Looked up rather than configured: an
 * ADMIN_EMAILS entry that never signed up has no id, and writing to a
 * guessed one would put another customer's notification bell in the
 * middle of our billing alerts.
 */
async function notifyOwners(alert: CostAlert): Promise<boolean> {
  const ids = await ownerUserIds();
  if (ids.length === 0) return false;
  let any = false;
  for (const id of ids) {
    const done = await createNotification({
      userId: id,
      source: "cost-alert",
      title: alert.title,
      body: alert.body,
      url: "/dashboard/costs",
    });
    any = any || done;
  }
  return any;
}

export async function ownerUserIds(): Promise<string[]> {
  if (ADMIN_EMAILS.length === 0) return [];
  try {
    const admin = createAdminClient();
    const ids: string[] = [];
    // PAGED, and it stops as soon as every owner is found.
    //
    // The first version read one page of 200 on the reasoning that "the
    // owner set is tiny" — which is true and irrelevant: listUsers pages
    // over ALL users, not over owners, so the owner's own account drops
    // off the end the moment there are 200 customers who signed up
    // before them. The alert would then deliver by email and silently
    // stop appearing in the app, with nothing to indicate why. Same
    // reasoning as api/cron/monthly-credits, which pages for the same
    // reason.
    //
    // The scan is bounded so a listUsers that never returns a short page
    // cannot spin: 50 pages is 10,000 accounts, and an owner not found
    // in the first 10,000 is a configuration problem, not a paging one.
    const perPage = 200;
    const MAX_PAGES = 50;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const user of users) {
        if (isAdminEmail(user.email)) ids.push(user.id);
      }
      if (ids.length >= ADMIN_EMAILS.length) break;
      if (users.length < perPage) break;
    }
    if (ids.length === 0) {
      // Worth saying out loud: the email half will still work, so this
      // fails in the shape of "half the alerts arrive" — which is the
      // kind of thing nobody notices for months.
      logApiError(
        "cost-alerts:owner_ids",
        new Error("no account matches ADMIN_EMAILS, so in-app alerts have nowhere to go"),
        { adminEmails: ADMIN_EMAILS.length }
      );
    }
    return ids;
  } catch (err) {
    logApiError("cost-alerts:owner_ids", err);
    return [];
  }
}
