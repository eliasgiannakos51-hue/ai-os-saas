import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreditCard, Shield, ArrowRight } from "lucide-react";

/**
 * PUBLIC PAY PAGE — /pay/[productId]
 *
 * This is the page a customer (NOT an Ionexa user) lands on when they
 * click a payment link. It shows the product name, price, description,
 * and a "Pay" button that redirects to Stripe Checkout.
 *
 * NO AUTH REQUIRED — this is a public page. The product owner's identity
 * comes from the database, not from a session.
 *
 * NO SESSION BY DESIGN: the CUSTOMER paying has no Ionexa account and
 * never will. Stripe handles the whole checkout, including card
 * collection, 3D Secure and receipts.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;
  const admin = createAdminClient();
  const { data: product } = await admin
    .from("payments_products")
    .select("name")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();
  return {
    title: product?.name ?? "Pay",
    robots: "noindex",
  };
}

export const dynamic = "force-dynamic";

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const admin = createAdminClient();

  // Load the product AND its owner's account in one go.
  const { data: product } = await admin
    .from("payments_products")
    .select("*, payments_accounts!inner(stripe_account_id, business_name, charges_enabled)")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (!product || !product.payments_accounts?.charges_enabled) {
    notFound();
  }

  const businessName = product.payments_accounts.business_name;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="rounded-card border border-divider bg-panel p-8">
          {/* Business name */}
          {businessName && (
            <p className="mb-4 text-center text-xs text-muted">{businessName}</p>
          )}

          {/* Product icon */}
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-workspace">
            <CreditCard className="h-7 w-7 text-foreground" />
          </div>

          {/* Product name */}
          <h1 className="mb-2 text-center text-xl font-semibold text-foreground">
            {product.name}
          </h1>

          {/* Description */}
          {product.description && (
            <p className="mb-4 text-center text-sm text-muted leading-relaxed">
              {product.description}
            </p>
          )}

          {/* Price */}
          <div className="mb-6 text-center">
            <span className="text-3xl font-bold text-foreground">
              {formatPrice(product.price_cents, product.currency)}
            </span>
            {product.is_recurring && (
              <span className="ms-1 text-sm text-muted">
                /{product.recurring_interval === "year" ? "year" : "month"}
              </span>
            )}
          </div>

          {/* Pay button — form submits to the checkout API */}
          <form action={`/api/pay/${productId}`} method="POST">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-item bg-button px-6 py-3.5 text-sm font-medium text-button-ink hover:opacity-90"
            >
              Pay {formatPrice(product.price_cents, product.currency)}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Security note */}
          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <Shield className="h-3.5 w-3.5" />
            <span>Secured by Stripe</span>
          </div>
        </div>

        {/* Powered by */}
        <p className="mt-4 text-center text-xs text-muted">
          Powered by Ionexa Payments
        </p>
      </div>
    </div>
  );
}
