import { CheckCircle } from "lucide-react";

/**
 * /pay/success — the customer lands here after a successful payment.
 * Static, no auth, no database. Just a confirmation.
 */
export const metadata = { title: "Payment successful", robots: "noindex" };

export default function PaySuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center">
        <div className="rounded-card border border-divider bg-panel p-8">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle className="h-7 w-7 text-success" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Payment successful
          </h1>
          <p className="text-sm text-muted">
            Thank you for your payment. You will receive a confirmation email from Stripe.
          </p>
        </div>
        <p className="mt-4 text-xs text-muted">Powered by Ionexa Payments</p>
      </div>
    </div>
  );
}
