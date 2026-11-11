import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import { createInvoice, listInvoices } from "@/lib/payments/invoices";

/**
 * GET  /api/payments/invoices — list recent invoices.
 * POST /api/payments/invoices — create and send an invoice.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) return NextResponse.json({ error: "no_account" }, { status: 400 });

    const invoices = await listInvoices({ account });
    return NextResponse.json({ invoices });
  } catch (err) {
    logApiError("api/payments/invoices:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) return NextResponse.json({ error: "no_account" }, { status: 400 });

    const body = await req.json();

    if (!body.customerEmail || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const result = await createInvoice({
      account,
      customerEmail: String(body.customerEmail),
      customerName: body.customerName ? String(body.customerName) : undefined,
      items: body.items.map((item: { description?: string; amountCents?: number; quantity?: number }) => ({
        description: String(item.description ?? ""),
        amountCents: Number(item.amountCents ?? 0),
        quantity: item.quantity ? Number(item.quantity) : 1,
      })),
      dueDate: body.dueDate ? String(body.dueDate) : undefined,
      memo: body.memo ? String(body.memo) : undefined,
      autoSend: body.autoSend !== false,
    });

    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ invoiceId: result.invoiceId, invoiceUrl: result.invoiceUrl });
  } catch (err) {
    logApiError("api/payments/invoices:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
