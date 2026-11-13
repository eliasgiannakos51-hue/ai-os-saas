import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";
import { previousMonth, monthKey } from "@/lib/billing/revenue-history";

/**
 * OVERAGE ON ITS OWN INVOICE (V4 #25, rule δ), AND ACTUALLY COLLECTED.
 *
 * "Ξεχωριστά στο τιμολόγιο" is not a formatting preference. Overage folded
 * into the subscription line is a subscription that costs a different
 * amount every month for no stated reason, which is the shape of a bill
 * people dispute. Each month's overage is ONE invoice per customer with
 * one line, described in the customer's own terms — how many credits, at
 * what rate, for which month.
 *
 * COLLECTED, NOT LEFT PENDING (2026-11-05, ΑΣ-4.16). This used to create a
 * PENDING invoice item and leave Stripe to pick it up on the customer's
 * next subscription invoice. When there was no next invoice — the
 * subscription had ended, which is exactly when the last month of overage
 * is billed — the item waited for ever and nothing was collected. Now the
 * invoice is created, the line attached to it explicitly, and the invoice
 * finalized, so Stripe charges it at once with the card the subscription
 * pays with. `auto_advance` means a draft whose finalize call failed is
 * still finalized by Stripe about an hour later.
 *
 * ONE LINE PER MONTH, NOT PER ACTION. A customer who ran two hundred
 * actions does not want two hundred lines; they want to know what the
 * extra charge was and be able to check it.
 *
 * BILLED AT MOST ONCE. Every ledger row carries stripe_invoice_item_id
 * (unique) and invoiced_at, and rows are only ever picked up when both
 * are null. Each Stripe call carries an idempotency key built from the
 * customer and the month (or the subscription that ended), so a retried
 * run inside Stripe's 24 hours gets the same invoice back. A crash between
 * creating the line and marking the rows leaves the rows unmarked; the
 * residual risk is a double charge after that window, and it is logged
 * loudly rather than hidden, because a duplicate a human can see and
 * credit is better than a missing one nobody ever finds.
 *
 * NOTHING IS BILLED FOR THE CURRENT MONTH by the monthly run: a month
 * still running has charges still arriving. The one exception is a
 * subscription that ENDED (billOutstandingOverage, from the webhook):
 * overage needs a live subscription (lib/billing/overage.ts), so nothing
 * more can arrive, and whatever is outstanding is billed then.
 */

export type OverageInvoiceResult = {
  month: string;
  customers: number;
  itemsCreated: number;
  amountEur: number;
  skippedNoCustomer: number;
  failed: number;
};

type LedgerRow = { id: string; user_id: string; credits: number; amount_eur: unknown };
type Stripe = ReturnType<typeof createStripeClient>;
type Admin = ReturnType<typeof createAdminClient>;

/** The card the subscription pays with, so the overage invoice is charged
 *  where the plan is. Null leaves Stripe to use the customer's default. */
async function subscriptionPaymentMethod(stripe: Stripe, subscriptionId: string | null): Promise<string | null> {
  if (!subscriptionId) return null;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const pm = subscription.default_payment_method;
    return typeof pm === "string" ? pm : pm?.id ?? null;
  } catch (err) {
    logApiError("billing:overage-invoice", err, { stage: "payment_method", subscriptionId });
    return null;
  }
}

/**
 * One customer's rows on one finalized invoice. Returns the euros billed,
 * or null when it failed (already logged).
 */
async function invoiceRows(params: {
  stripe: Stripe;
  admin: Admin;
  userId: string;
  customerId: string;
  rows: LedgerRow[];
  label: string;
  /** Unique per customer and billing run: the month, or the ended subscription. */
  runKey: string;
  defaultPaymentMethod: string | null;
}): Promise<number | null> {
  const { stripe, admin, userId, customerId, rows, label, runKey } = params;
  const credits = rows.reduce((sum, r) => sum + Number(r.credits || 0), 0);
  // Rounded to the cent ONCE, at the end. Rounding each row and summing
  // would drift from the ledger the customer can see.
  const amountEur = Math.round(rows.reduce((sum, r) => sum + (Number(r.amount_eur) || 0), 0) * 100) / 100;
  if (amountEur <= 0) return 0;

  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      currency: "eur",
      collection_method: "charge_automatically",
      auto_advance: true,
      // ONLY THIS LINE. Anything else pending on the customer stays where
      // it is; this invoice is the overage and nothing but the overage.
      pending_invoice_items_behavior: "exclude",
      description: `Usage overage (${label})`,
      metadata: { supabase_user_id: userId, overage_run: runKey },
      ...(params.defaultPaymentMethod ? { default_payment_method: params.defaultPaymentMethod } : {}),
    },
    { idempotencyKey: `overage_invoice:${runKey}` }
  );
  if (!invoice.id) throw new Error("Stripe returned an invoice without an id");

  const item = await stripe.invoiceItems.create(
    {
      customer: customerId,
      // ATTACHED, NOT PENDING: this line belongs to the invoice above.
      invoice: invoice.id,
      currency: "eur",
      // CENTS. Stripe's smallest unit — a euro figure here would be a
      // hundredfold overcharge. `amount` rather than unit_amount x
      // quantity: the line is one month's total, and Stripe treats the
      // two forms as mutually exclusive.
      amount: Math.round(amountEur * 100),
      description: `Usage overage — ${credits} extra credits (${label})`,
      metadata: { supabase_user_id: userId, overage_month: label, credits: String(credits) },
    },
    // A retried run cannot add a second line.
    { idempotencyKey: `overage_item:${runKey}` }
  );

  const { error: markError } = await admin
    .from("usage_overage_ledger")
    .update({ stripe_invoice_item_id: item.id, invoiced_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in(
      "id",
      rows.map((r) => r.id)
    );
  if (markError) {
    // The charge exists and our record of it does not. Loud, because the
    // next run will try again and Stripe's idempotency key is the only
    // thing standing between that and a second invoice.
    logApiError("billing:overage-invoice", markError, { stage: "mark", userId, runKey, itemId: item.id });
    return null;
  }

  try {
    await stripe.invoices.finalizeInvoice(
      invoice.id,
      { auto_advance: true },
      { idempotencyKey: `overage_finalize:${invoice.id}` }
    );
  } catch (err) {
    // Not lost: auto_advance finalizes the draft on Stripe's side.
    logApiError("billing:overage-invoice", err, { stage: "finalize", userId, invoiceId: invoice.id });
  }
  return amountEur;
}

export async function billOverageForClosedMonth(now = new Date()): Promise<OverageInvoiceResult> {
  // ALREADY A FULL DATE. monthKey/previousMonth return YYYY-MM-01, not
  // YYYY-MM — appending "-01" to it produced "2026-02-01-01", which
  // matched no ledger row and would have billed nobody, silently, for
  // ever. `label` is the human half and is derived from it, never the
  // other way round.
  const month = previousMonth(monthKey(now));
  const label = month.slice(0, 7);
  const result: OverageInvoiceResult = {
    month,
    customers: 0,
    itemsCreated: 0,
    amountEur: 0,
    skippedNoCustomer: 0,
    failed: 0,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("usage_overage_ledger")
    .select("id, user_id, credits, amount_eur")
    .eq("billing_month", month)
    .is("stripe_invoice_item_id", null)
    .is("invoiced_at", null)
    .limit(50_000);
  if (error) throw error;

  const rows = (data ?? []) as LedgerRow[];
  if (rows.length === 0) return result;

  const byUser = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id);
    if (list) list.push(row);
    else byUser.set(row.user_id, [row]);
  }
  result.customers = byUser.size;

  const stripe = createStripeClient();

  for (const [userId, userRows] of byUser) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const meta = userData?.user?.user_metadata ?? {};
      const customerId = meta.stripe_customer_id as string | undefined;
      if (!customerId) {
        // NO CUSTOMER, NO CHARGE. The rows stay unbilled and unmarked, so
        // they are picked up if a customer id appears later. Inventing one
        // would attach somebody's usage to somebody else's card.
        result.skippedNoCustomer += 1;
        continue;
      }
      const subscriptionId = typeof meta.stripe_subscription_id === "string" ? meta.stripe_subscription_id : null;
      const billed = await invoiceRows({
        stripe,
        admin,
        userId,
        customerId,
        rows: userRows,
        label,
        runKey: `${userId}:${month}`,
        defaultPaymentMethod: await subscriptionPaymentMethod(stripe, subscriptionId),
      });
      if (billed === null) {
        result.failed += 1;
        continue;
      }
      if (billed > 0) {
        result.itemsCreated += 1;
        result.amountEur = Math.round((result.amountEur + billed) * 100) / 100;
      }
    } catch (err) {
      logApiError("billing:overage-invoice", err, { stage: "create_invoice", userId, month });
      result.failed += 1;
    }
  }

  return result;
}

/**
 * EVERYTHING STILL OWED, WHEN A SUBSCRIPTION ENDS (2026-11-05, ΑΣ-4.16).
 *
 * Called by the Stripe webhook on customer.subscription.deleted, with the
 * subscription that ended. Every unbilled ledger row of the account, of
 * any month including this one, goes on one finalized invoice, charged to
 * the card that subscription used. Nothing more can accrue after this:
 * overage is refused without a live subscription and the webhook deletes
 * the consent in the same pass. Never throws: a failure here is logged,
 * and the rows stay unbilled for the monthly run to pick up.
 */
export async function billOutstandingOverage(params: {
  userId: string;
  customerId: string;
  subscriptionId: string;
  defaultPaymentMethod: string | null;
}): Promise<{ billedEur: number } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("usage_overage_ledger")
      .select("id, user_id, credits, amount_eur")
      .eq("user_id", params.userId)
      .is("stripe_invoice_item_id", null)
      .is("invoiced_at", null)
      .limit(5_000);
    if (error) throw error;
    const rows = (data ?? []) as LedgerRow[];
    if (rows.length === 0) return { billedEur: 0 };
    const billed = await invoiceRows({
      stripe: createStripeClient(),
      admin,
      userId: params.userId,
      customerId: params.customerId,
      rows,
      label: "final",
      runKey: `${params.userId}:final:${params.subscriptionId}`,
      defaultPaymentMethod: params.defaultPaymentMethod,
    });
    return billed === null ? null : { billedEur: billed };
  } catch (err) {
    logApiError("billing:overage-invoice", err, { stage: "final_invoice", userId: params.userId });
    return null;
  }
}
