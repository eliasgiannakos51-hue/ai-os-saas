import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";
import { previousMonth, monthKey } from "@/lib/billing/revenue-history";

/**
 * OVERAGE AS ITS OWN LINE ON THE INVOICE (V4 #25, rule δ).
 *
 * "Ξεχωριστά στο τιμολόγιο" is not a formatting preference. Overage folded
 * into the subscription line is a subscription that costs a different
 * amount every month for no stated reason, which is the shape of a bill
 * people dispute. Each month's overage becomes ONE pending invoice item
 * per customer, described in the customer's own terms — how many credits,
 * at what rate, for which month — and Stripe attaches it to their next
 * invoice alongside the plan.
 *
 * ONE ITEM PER MONTH, NOT PER ACTION. A customer who ran two hundred
 * actions does not want two hundred lines; they want to know what the
 * extra charge was and be able to check it.
 *
 * BILLED AT MOST ONCE. Every ledger row carries stripe_invoice_item_id
 * (unique) and invoiced_at, and rows are only ever picked up when both
 * are null. A crash between creating the item and marking the rows leaves
 * the rows unmarked — so the next run would bill them again, which is why
 * the marking is keyed on the row ids captured BEFORE the item was
 * created and is retried on the next run if it failed. The residual risk
 * is a double charge in a narrow window; it is logged loudly rather than
 * hidden, because a duplicate line a human can see and credit is better
 * than a missing one nobody ever finds.
 *
 * NOTHING IS BILLED FOR THE CURRENT MONTH. A month still running has
 * charges still arriving.
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
    const credits = userRows.reduce((sum, r) => sum + Number(r.credits || 0), 0);
    // Rounded to the cent ONCE, at the end. Rounding each row and summing
    // would drift from the ledger the customer can see.
    const amountEur = Math.round(userRows.reduce((sum, r) => sum + (Number(r.amount_eur) || 0), 0) * 100) / 100;
    if (amountEur <= 0) continue;

    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const customerId = userData?.user?.user_metadata?.stripe_customer_id as string | undefined;
      if (!customerId) {
        // NO CUSTOMER, NO CHARGE. The rows stay unbilled and unmarked, so
        // they are picked up if a customer id appears later. Inventing one
        // would attach somebody's usage to somebody else's card.
        result.skippedNoCustomer += 1;
        continue;
      }

      const item = await stripe.invoiceItems.create(
        {
          customer: customerId,
          currency: "eur",
          // CENTS. Stripe's smallest unit — a euro figure here would be a
          // hundredfold overcharge. `amount` rather than unit_amount x
          // quantity: the line is one month's total, and Stripe treats
          // the two forms as mutually exclusive.
          amount: Math.round(amountEur * 100),
          description: `Usage overage — ${credits} extra credits (${label})`,
          metadata: { supabase_user_id: userId, overage_month: label, credits: String(credits) },
        },
        // The idempotency key is the customer and the month, so a retried
        // cron run cannot create a second line.
        { idempotencyKey: `overage:${userId}:${month}` }
      );

      const { error: markError } = await admin
        .from("usage_overage_ledger")
        .update({ stripe_invoice_item_id: item.id, invoiced_at: new Date().toISOString() })
        .in(
          "id",
          userRows.map((r) => r.id)
        );
      if (markError) {
        // The charge exists and our record of it does not. Loud, because
        // the next run will try again and Stripe's idempotency key is the
        // only thing standing between that and a second line.
        logApiError("billing:overage-invoice", markError, { stage: "mark", userId, month, itemId: item.id });
        result.failed += 1;
        continue;
      }

      result.itemsCreated += 1;
      result.amountEur = Math.round((result.amountEur + amountEur) * 100) / 100;
    } catch (err) {
      logApiError("billing:overage-invoice", err, { stage: "create_item", userId, month });
      result.failed += 1;
    }
  }

  return result;
}
