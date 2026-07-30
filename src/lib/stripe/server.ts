import "server-only";
import Stripe from "stripe";

// Server-only Stripe client. Import this ONLY from server-only code (Route
// Handlers) — the `server-only` import above makes any accidental
// client-component import fail at build time instead of leaking the key to
// the browser. Pinned to the API version this SDK version ships types for,
// so a future account-level default-version change can't silently alter
// response shapes here.
export function createStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-07-29.dahlia",
  });
}
