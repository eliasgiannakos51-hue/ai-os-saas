import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { paymentsConfigured, type PaymentsAccount } from "./connect";

/**
 * IONEXA PAYMENTS — INVOICES.
 *
 * Auto-generates and sends invoices for payments through Stripe Invoicing.
 * The seller's connected account issues the invoice, branded with their
 * business name and details. The platform fee is transparent.
 *
 * Stripe Invoicing charges 0.4% per paid invoice on the connected account.
 */

export type InvoiceSettings = {
  autoSendInvoice: boolean;
  includeBusinessDetails: boolean;
  defaultPaymentTermDays: number;
  footerText: string | null;
};

const DEFAULT_SETTINGS: InvoiceSettings = {
  autoSendInvoice: true,
  includeBusinessDetails: true,
  defaultPaymentTermDays: 30,
  footerText: null,
};

/**
 * Creates and sends a Stripe Invoice on the seller's connected account.
 */
export async function createInvoice(params: {
  account: PaymentsAccount;
  customerEmail: string;
  customerName?: string;
  items: { description: string; amountCents: number; quantity?: number }[];
  dueDate?: string;
  memo?: string;
  autoSend?: boolean;
}): Promise<{ ok: true; invoiceId: string; invoiceUrl: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!params.account.charges_enabled) return { ok: false, reason: "charges_not_enabled" };
  if (!params.items.length) return { ok: false, reason: "no_items" };

  try {
    const stripe = createStripeClient();
    const stripeAccount = params.account.stripe_account_id;

    // Find or create customer on the connected account.
    const customers = await stripe.customers.list(
      { email: params.customerEmail, limit: 1 },
      { stripeAccount }
    );
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create(
        {
          email: params.customerEmail,
          name: params.customerName,
          metadata: { platform: "ionexa_payments" },
        },
        { stripeAccount }
      );
      customerId = customer.id;
    }

    // Create the invoice.
    const invoice = await stripe.invoices.create(
      {
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: params.dueDate ? undefined : 30,
        ...(params.dueDate ? { due_date: Math.floor(new Date(params.dueDate).getTime() / 1000) } : {}),
        description: params.memo,
        metadata: {
          ionexa_user_id: params.account.user_id,
          platform: "ionexa_payments",
        },
      },
      { stripeAccount }
    );

    // Add line items.
    for (const item of params.items) {
      await stripe.invoiceItems.create(
        {
          customer: customerId,
          invoice: invoice.id,
          description: item.description,
          amount: item.amountCents * (item.quantity ?? 1),
          currency: params.account.default_currency ?? "eur",
        },
        { stripeAccount }
      );
    }

    // Finalize (locks the invoice so it can be paid).
    const finalized = await stripe.invoices.finalizeInvoice(
      invoice.id,
      {},
      { stripeAccount }
    );

    // Auto-send if requested (default: yes).
    if (params.autoSend !== false) {
      await stripe.invoices.sendInvoice(invoice.id, {}, { stripeAccount });
    }

    return {
      ok: true,
      invoiceId: finalized.id,
      invoiceUrl: finalized.hosted_invoice_url ?? "",
    };
  } catch (err) {
    logApiError("payments:create-invoice", err, { stage: "create", userId: params.account.user_id });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Lists recent invoices on the seller's connected account.
 */
export async function listInvoices(params: {
  account: PaymentsAccount;
  limit?: number;
}): Promise<{ id: string; number: string | null; customer_email: string | null; amount_due: number; currency: string; status: string; due_date: number | null; hosted_invoice_url: string | null; created: number }[]> {
  if (!paymentsConfigured()) return [];

  try {
    const stripe = createStripeClient();
    const invoices = await stripe.invoices.list(
      { limit: params.limit ?? 20 },
      { stripeAccount: params.account.stripe_account_id }
    );

    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      customer_email: inv.customer_email,
      amount_due: inv.amount_due,
      currency: inv.currency,
      status: String(inv.status ?? "draft"),
      due_date: inv.due_date,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      created: inv.created,
    }));
  } catch (err) {
    logApiError("payments:list-invoices", err, { stage: "list", userId: params.account.user_id });
    return [];
  }
}

/**
 * Gets the invoice settings saved in the user's payments_accounts row.
 */
export async function getInvoiceSettings(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<InvoiceSettings> {
  const { data } = await admin
    .from("payments_accounts")
    .select("invoice_settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.invoice_settings) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(data.invoice_settings as Partial<InvoiceSettings>) };
}

/**
 * Saves invoice settings in the user's payments_accounts row.
 */
export async function saveInvoiceSettings(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  settings: Partial<InvoiceSettings>
): Promise<{ ok: boolean }> {
  const { error } = await admin
    .from("payments_accounts")
    .update({ invoice_settings: { ...DEFAULT_SETTINGS, ...settings } })
    .eq("user_id", userId);
  if (error) {
    logApiError("payments:save-invoice-settings", error, { userId });
    return { ok: false };
  }
  return { ok: true };
}
